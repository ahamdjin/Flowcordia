#!/bin/sh
set -eu

if [ -z "${FLOWCORDIA_MIGRATION_CONFIRM:-}" ]; then
  echo "Flowcordia migration confirmation is missing." >&2
  exit 1
fi

node ./scripts/flowcordia-release-verify.mjs migration

release_id="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.env.FLOWCORDIA_RELEASE_MANIFEST_PATH,"utf8")); process.stdout.write(value.releaseId ?? "")')"
if ! printf '%s' "$release_id" | grep -Eq '^[a-z0-9][a-z0-9._-]{2,63}$'; then
  echo "Flowcordia migration release identity is invalid." >&2
  exit 1
fi
if [ "$FLOWCORDIA_MIGRATION_CONFIRM" != "$release_id" ]; then
  echo "Flowcordia migration confirmation does not match the selected release." >&2
  exit 1
fi

database_host="$(node -e 'const candidate=process.env.DIRECT_URL || process.env.DATABASE_URL; if (!candidate) process.exit(1); const url=new URL(candidate); process.stdout.write(`${url.hostname}:${url.port || "5432"}`)')"
if [ -n "${DATABASE_HOST:-}" ] && [ "$DATABASE_HOST" != "$database_host" ]; then
  echo "DATABASE_HOST does not match DIRECT_URL/DATABASE_URL." >&2
  exit 1
fi
./scripts/wait-for-it.sh "$database_host" -- echo "PostgreSQL is reachable"

echo "Applying primary PostgreSQL migrations for release $release_id"
pnpm --filter @trigger.dev/database db:migrate:deploy
pnpm --filter @trigger.dev/database exec prisma migrate status

echo "Applying dashboard-agent PostgreSQL migrations"
pnpm --filter @internal/dashboard-agent-db db:migrate:deploy
pnpm --filter @internal/dashboard-agent-db db:migrate:status

if [ -z "${CLICKHOUSE_URL:-}" ]; then
  echo "CLICKHOUSE_URL is required for the production migration job." >&2
  exit 1
fi
export GOOSE_DRIVER=clickhouse
# Preserve the operator-selected HTTP/HTTPS and TLS query semantics exactly.
export GOOSE_DBSTRING="$CLICKHOUSE_URL"
export GOOSE_MIGRATION_DIR=/triggerdotdev/internal-packages/clickhouse/schema
/usr/local/bin/goose validate
/usr/local/bin/goose up

node ./scripts/flowcordia-migration-evidence.mjs
