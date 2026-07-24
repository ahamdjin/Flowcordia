#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <absolute-output-directory>" >&2
  exit 2
fi

output_dir="$1"
if [[ "$output_dir" != /* ]]; then
  echo "Output directory must be absolute." >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "$script_dir/../.." && pwd -P)"
mkdir -p "$output_dir"
output_dir="$(cd -- "$output_dir" && pwd -P)"

case "$output_dir/" in
  "$repository_root/"*)
    echo "Bundled deployment files must be stored outside the repository." >&2
    exit 2
    ;;
esac

for command in openssl docker; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "$command is required." >&2
    exit 2
  fi
done

umask 077

random_hex() {
  openssl rand -hex "$1"
}

postgres_password="$(random_hex 24)"
redis_password="$(random_hex 24)"
clickhouse_password="$(random_hex 24)"
minio_access_key="$(random_hex 10)"
minio_secret_key="$(random_hex 24)"
registry_password="$(random_hex 24)"
registry_http_secret="$(random_hex 32)"
managed_worker_secret="$(random_hex 32)"
session_secret="$(random_hex 32)"
magic_link_secret="$(random_hex 32)"
encryption_key="$(random_hex 16)"
github_webhook_secret="$(random_hex 32)"
proposal_event_secret="$(random_hex 32)"

config_path="$output_dir/deployment.env"
secrets_path="$output_dir/deployment.secrets"
registry_auth_path="$output_dir/registry.htpasswd"

cat >"$config_path" <<EOF
FLOWCORDIA_CONFIG_FILE=$config_path
FLOWCORDIA_SECRETS_FILE=$secrets_path
FLOWCORDIA_RELEASE_MANIFEST_FILE=$output_dir/release-manifest.json
FLOWCORDIA_MIGRATION_STATE_DIR=$output_dir/migrations
FLOWCORDIA_DIAGNOSTICS_STATE_DIR=$output_dir/diagnostics
FLOWCORDIA_REGISTRY_AUTH_FILE=$registry_auth_path

# Replace these values with the exact protected publication outputs.
FLOWCORDIA_IMAGE_REFERENCE=ghcr.io/owner/flowcordia@sha256:<replace-with-image-digest>
FLOWCORDIA_IMAGE_DIGEST=<replace-with-64-lowercase-hex>
FLOWCORDIA_APPLICATION_COMMIT_SHA=<replace-with-40-lowercase-hex>
FLOWCORDIA_RELEASE_MANIFEST_SHA256=<replace-with-64-lowercase-hex>
FLOWCORDIA_RELEASE_RUNTIME_REQUIRED=1
FLOWCORDIA_MIGRATION_CONFIRM=<replace-with-release-id>

FLOWCORDIA_BUNDLED_MODE=1
FLOWCORDIA_WEB_REPLICAS=1
FLOWCORDIA_OPERATIONS_REPLICAS=1
FLOWCORDIA_HTTP_BIND=127.0.0.1
FLOWCORDIA_HTTP_PORT=3030
FLOWCORDIA_MINIO_CONSOLE_PORT=9001
FLOWCORDIA_REGISTRY_PORT=5000
FLOWCORDIA_VOLUME_PREFIX=flowcordia
FLOWCORDIA_APPLICATION_NETWORK_NAME=flowcordia-application
FLOWCORDIA_SUPERVISOR_NETWORK_NAME=flowcordia-supervisor
FLOWCORDIA_DOCKER_PROXY_NETWORK_NAME=flowcordia-docker-proxy

# Pin these to reviewed versions or immutable digests before a supported release.
FLOWCORDIA_POSTGRES_IMAGE_REFERENCE=postgres:14
FLOWCORDIA_REDIS_IMAGE_REFERENCE=redis:7-alpine
FLOWCORDIA_ELECTRIC_IMAGE_REFERENCE=electricsql/electric:1.2.4
FLOWCORDIA_CLICKHOUSE_IMAGE_REFERENCE=bitnamilegacy/clickhouse:latest
FLOWCORDIA_MINIO_IMAGE_REFERENCE=bitnamilegacy/minio:latest
FLOWCORDIA_REGISTRY_IMAGE_REFERENCE=registry:2.8.3
FLOWCORDIA_BUSYBOX_IMAGE_REFERENCE=busybox:1.37
FLOWCORDIA_DOCKER_PROXY_IMAGE_REFERENCE=tecnativa/docker-socket-proxy:v0.4.2
FLOWCORDIA_SUPERVISOR_IMAGE_REFERENCE=ghcr.io/triggerdotdev/supervisor:v4-beta
FLOWCORDIA_S2_IMAGE_REFERENCE=ghcr.io/s2-streamstore/s2:latest@sha256:d6ded5ca7dd619fa7c946f06e39a98f9c95c6883c8bb884e5eaa129f232c920c

APP_ENV=production
NODE_ENV=production
TZ=UTC
APP_ORIGIN=https://flowcordia.example.com
LOGIN_ORIGIN=https://flowcordia.example.com
FLOWCORDIA_STUDIO_ENABLED=0
NODE_MAX_OLD_SPACE_SIZE=4096

SKIP_POSTGRES_MIGRATIONS=1
SKIP_DASHBOARD_AGENT_MIGRATIONS=1
SKIP_CLICKHOUSE_MIGRATIONS=1

FLOWCORDIA_POSTGRES_USER=flowcordia
FLOWCORDIA_POSTGRES_DB=flowcordia
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_TLS_DISABLED=true
ELECTRIC_ORIGIN=http://electric:3000
RUN_REPLICATION_ENABLED=1
EVENT_REPOSITORY_DEFAULT_STORE=clickhouse_v2

OBJECT_STORE_BASE_URL=http://minio:9000
OBJECT_STORE_BUCKET=packets
FLOWCORDIA_OBJECT_STORE_BUCKET=packets
OBJECT_STORE_REGION=us-east-1
OBJECT_STORE_SERVICE=s3
OBJECT_STORE_DEFAULT_PROTOCOL=s3
OBJECT_STORE_FORCE_PATH_STYLE=true
OBJECT_STORE_S3_BASE_URL=http://minio:9000
OBJECT_STORE_S3_BUCKET=packets
OBJECT_STORE_S3_REGION=us-east-1
OBJECT_STORE_S3_SERVICE=s3

REALTIME_STREAMS_DEFAULT_VERSION=v2
REALTIME_STREAMS_S2_BASIN=flowcordia-realtime
REALTIME_STREAMS_S2_ENDPOINT=http://s2/v1
REALTIME_STREAMS_S2_SKIP_ACCESS_TOKENS=true

FLOWCORDIA_DEPLOY_REGISTRY_HOST=localhost:5000
FLOWCORDIA_DEPLOY_REGISTRY_NAMESPACE=flowcordia
DEPLOY_REGISTRY_HOST=localhost:5000
DEPLOY_REGISTRY_NAMESPACE=flowcordia
TRIGGER_BOOTSTRAP_ENABLED=1
TRIGGER_BOOTSTRAP_WORKER_GROUP_NAME=bootstrap
TRIGGER_BOOTSTRAP_WORKER_TOKEN_PATH=/home/node/shared/worker_token

EMAIL_TRANSPORT=resend
FROM_EMAIL=Flowcordia <no-reply@example.com>
REPLY_TO_EMAIL=support@example.com

GITHUB_APP_ENABLED=1
GITHUB_APP_ID=<replace-with-github-app-id>
GITHUB_APP_SLUG=<replace-with-github-app-slug>

FLOWCORDIA_PROPOSAL_EVENT_URL=https://flowcordia.example.com/api/flowcordia/proposal-events
FLOWCORDIA_PROPOSAL_WORKER_POLL_INTERVAL_MS=5000
FLOWCORDIA_PROPOSAL_WORKER_SHUTDOWN_GRACE_MS=30000
FLOWCORDIA_PROPOSAL_EVENT_TIMEOUT_MS=5000
FLOWCORDIA_PROPOSAL_OUTBOX_BATCH_SIZE=10
FLOWCORDIA_PROPOSAL_OUTBOX_LEASE_MS=60000
FLOWCORDIA_PROPOSAL_RECONCILIATION_BATCH_SIZE=5
FLOWCORDIA_PROPOSAL_RECONCILIATION_LEASE_MS=120000
FLOWCORDIA_PROPOSAL_RECONCILIATION_STALE_MS=300000
FLOWCORDIA_PROPOSAL_RECONCILIATION_REFRESH_MS=900000
FLOWCORDIA_PROPOSAL_GITHUB_TIMEOUT_MS=15000
EOF

cat >"$secrets_path" <<EOF
SESSION_SECRET=$session_secret
MAGIC_LINK_SECRET=$magic_link_secret
ENCRYPTION_KEY=$encryption_key
MANAGED_WORKER_SECRET=$managed_worker_secret

FLOWCORDIA_POSTGRES_PASSWORD=$postgres_password
DATABASE_URL=postgresql://flowcordia:$postgres_password@postgres:5432/flowcordia?schema=public&sslmode=disable
DIRECT_URL=postgresql://flowcordia:$postgres_password@postgres:5432/flowcordia?schema=public&sslmode=disable

FLOWCORDIA_REDIS_PASSWORD=$redis_password
REDIS_PASSWORD=$redis_password

FLOWCORDIA_CLICKHOUSE_USER=default
FLOWCORDIA_CLICKHOUSE_PASSWORD=$clickhouse_password
CLICKHOUSE_URL=http://default:$clickhouse_password@clickhouse:8123/default?secure=false
RUN_REPLICATION_CLICKHOUSE_URL=http://default:$clickhouse_password@clickhouse:8123/default

FLOWCORDIA_MINIO_ACCESS_KEY_ID=$minio_access_key
FLOWCORDIA_MINIO_SECRET_ACCESS_KEY=$minio_secret_key
OBJECT_STORE_ACCESS_KEY_ID=$minio_access_key
OBJECT_STORE_SECRET_ACCESS_KEY=$minio_secret_key
OBJECT_STORE_S3_ACCESS_KEY_ID=$minio_access_key
OBJECT_STORE_S3_SECRET_ACCESS_KEY=$minio_secret_key

FLOWCORDIA_REGISTRY_USERNAME=flowcordia
FLOWCORDIA_REGISTRY_PASSWORD=$registry_password
FLOWCORDIA_REGISTRY_HTTP_SECRET=$registry_http_secret
DEPLOY_REGISTRY_USERNAME=flowcordia
DEPLOY_REGISTRY_PASSWORD=$registry_password

GITHUB_APP_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n<replace-with-pem-body>\n-----END PRIVATE KEY-----
GITHUB_APP_WEBHOOK_SECRET=$github_webhook_secret
FLOWCORDIA_PROPOSAL_EVENT_SECRET=$proposal_event_secret
RESEND_API_KEY=<replace-with-resend-api-key>
EOF

docker run --rm --entrypoint htpasswd httpd:2.4-alpine -Bbn flowcordia "$registry_password" >"$registry_auth_path"

mkdir -p "$output_dir/migrations" "$output_dir/diagnostics"
chmod 0700 "$output_dir" "$output_dir/migrations" "$output_dir/diagnostics"
chmod 0640 "$config_path"
chmod 0600 "$secrets_path" "$registry_auth_path"

printf 'Created:\n  %s\n  %s\n  %s\n' "$config_path" "$secrets_path" "$registry_auth_path"
printf 'Replace every <replace-...> value and install the protected release manifest at:\n  %s\n' "$output_dir/release-manifest.json"
