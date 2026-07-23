#!/bin/sh
set -eu

if [ "${FLOWCORDIA_PROCESS_ROLE:-}" = "migration" ]; then
  exec ./scripts/flowcordia-release-migrate.sh
fi

if [ -n "${DATABASE_HOST:-}" ]; then
  ./scripts/wait-for-it.sh "$DATABASE_HOST" -- echo "database is up"
fi

if [ "${FLOWCORDIA_RELEASE_RUNTIME_REQUIRED:-0}" = "1" ]; then
  if [ "${SKIP_POSTGRES_MIGRATIONS:-0}" != "1" ] || \
     [ "${SKIP_DASHBOARD_AGENT_MIGRATIONS:-0}" != "1" ] || \
     [ "${SKIP_CLICKHOUSE_MIGRATIONS:-0}" != "1" ]; then
    echo "Published Flowcordia application replicas must not execute migrations." >&2
    exit 1
  fi
fi

if [ "${SKIP_POSTGRES_MIGRATIONS:-0}" != "1" ]; then
  echo "Running prisma migrations"
  pnpm --filter @trigger.dev/database db:migrate:deploy
  echo "Prisma migrations done"
else
  echo "SKIP_POSTGRES_MIGRATIONS=1, skipping Postgres migrations."
fi

if [ "${SKIP_DASHBOARD_AGENT_MIGRATIONS:-0}" != "1" ]; then
  echo "Running dashboard agent migrations"
  pnpm --filter @internal/dashboard-agent-db db:migrate:deploy
  echo "Dashboard agent migrations done"
else
  echo "SKIP_DASHBOARD_AGENT_MIGRATIONS=1, skipping dashboard agent migrations."
fi

if [ -n "${CLICKHOUSE_URL:-}" ] && [ "${SKIP_CLICKHOUSE_MIGRATIONS:-0}" != "1" ]; then
  echo "Running ClickHouse migrations..."
  export GOOSE_DRIVER=clickhouse
  case "$CLICKHOUSE_URL" in
    *secure=*) GOOSE_DBSTRING="$CLICKHOUSE_URL" ;;
    *\?*) GOOSE_DBSTRING="${CLICKHOUSE_URL}&secure=true" ;;
    *) GOOSE_DBSTRING="${CLICKHOUSE_URL}?secure=true" ;;
  esac
  export GOOSE_DBSTRING
  export GOOSE_MIGRATION_DIR=/triggerdotdev/internal-packages/clickhouse/schema
  /usr/local/bin/goose up
  echo "ClickHouse migrations complete."
elif [ "${SKIP_CLICKHOUSE_MIGRATIONS:-0}" = "1" ]; then
  echo "SKIP_CLICKHOUSE_MIGRATIONS=1, skipping ClickHouse migrations."
else
  echo "CLICKHOUSE_URL not set, skipping ClickHouse migrations."
fi

if [ "${FLOWCORDIA_IMMUTABLE_ROOTFS:-0}" = "1" ]; then
  if [ ! -f apps/webapp/prisma/schema.prisma ] || ! find apps/webapp/prisma -maxdepth 1 -name '*.node' -print -quit | grep -q .; then
    echo "Immutable Flowcordia image is missing packaged Prisma runtime artifacts." >&2
    exit 1
  fi
else
  mkdir -p apps/webapp/prisma
  cp internal-packages/database/prisma/schema.prisma apps/webapp/prisma/
  cp node_modules/@prisma/engines/*.node apps/webapp/prisma/
fi

cd /triggerdotdev/apps/webapp
MAX_OLD_SPACE_SIZE="${NODE_MAX_OLD_SPACE_SIZE:-8192}"
echo "Setting max old space size to ${MAX_OLD_SPACE_SIZE}"
NODE_PATH='/triggerdotdev/node_modules/.pnpm/node_modules' exec dumb-init node --max-old-space-size="${MAX_OLD_SPACE_SIZE}" ./build/server.js
