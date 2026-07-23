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

if [ -n "${DATABASE_HOST:-}" ]; then
  ./scripts/wait-for-it.sh "$DATABASE_HOST" -- echo "PostgreSQL is reachable"
fi

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
case "$CLICKHOUSE_URL" in
  *secure=*) GOOSE_DBSTRING="$CLICKHOUSE_URL" ;;
  *\?*) GOOSE_DBSTRING="${CLICKHOUSE_URL}&secure=true" ;;
  *) GOOSE_DBSTRING="${CLICKHOUSE_URL}?secure=true" ;;
esac
export GOOSE_DBSTRING
export GOOSE_MIGRATION_DIR=/triggerdotdev/internal-packages/clickhouse/schema
/usr/local/bin/goose validate
/usr/local/bin/goose up

node ./scripts/flowcordia-migration-evidence.mjs
