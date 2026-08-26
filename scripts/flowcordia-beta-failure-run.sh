#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: scripts/flowcordia-beta-failure-run.sh \
  --checkout <absolute-path> --config <absolute-path> --secrets <absolute-path> \
  --manifest <absolute-path> --registry-auth <absolute-path> \
  --work-root <absolute-path> --observation <absolute-path> \
  --repository <owner/name> --run-id <id> --run-attempt <number> --source-sha <sha>
USAGE
  exit 2
}

absolute() {
  [[ "$1" == /* ]] || usage
  printf '%s' "$1"
}

checkout=""
config=""
secrets=""
manifest=""
registry_auth=""
work_root=""
observation=""
repository=""
run_id=""
run_attempt=""
source_sha=""
while (($#)); do
  (($# >= 2)) || usage
  key="$1"
  value="$2"
  shift 2
  case "$key" in
    --checkout) checkout="$(absolute "$value")" ;;
    --config) config="$(absolute "$value")" ;;
    --secrets) secrets="$(absolute "$value")" ;;
    --manifest) manifest="$(absolute "$value")" ;;
    --registry-auth) registry_auth="$(absolute "$value")" ;;
    --work-root) work_root="$(absolute "$value")" ;;
    --observation) observation="$(absolute "$value")" ;;
    --repository) repository="$value" ;;
    --run-id) run_id="$value" ;;
    --run-attempt) run_attempt="$value" ;;
    --source-sha) source_sha="$value" ;;
    *) usage ;;
  esac
done

for required in checkout config secrets manifest registry_auth work_root observation repository run_id run_attempt source_sha; do
  [[ -n "${!required}" ]] || usage
done
[[ "$(id -u)" == "1000" ]] || { echo "Beta failure runner must use UID 1000." >&2; exit 1; }
[[ -d "$checkout" && -f "$config" && -f "$secrets" && -f "$manifest" && -f "$registry_auth" ]] || {
  echo "Beta failure inputs are unavailable." >&2
  exit 1
}
[[ ! -e "$work_root" && ! -e "$observation" ]] || {
  echo "Beta failure workspace or observation already exists." >&2
  exit 1
}
[[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 1
[[ "$run_id" =~ ^[1-9][0-9]{0,19}$ && "$run_attempt" =~ ^[1-9][0-9]{0,2}$ ]] || exit 1
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || exit 1

mkdir -m 0700 -p "$work_root"
workspace_id="$(printf '%s:%s:%s:failure' "$run_id" "$run_attempt" "$source_sha" | sha256sum | cut -c1-12)"
work_dir="$work_root/$workspace_id"
private_dir="$work_dir/private"
migration_dir="$work_dir/migrations"
install_diagnostics="$work_dir/install-diagnostics"
post_diagnostics="$work_dir/post-failure-diagnostics"
mkdir -m 0700 "$work_dir" "$private_dir" "$migration_dir" "$install_diagnostics" "$post_diagnostics"

derived_config="$work_dir/deployment.env"
derived_secrets="$work_dir/secrets.env"
release_id="$(node -e 'const v=require(process.argv[1]); if(typeof v.releaseId!=="string")process.exit(1);process.stdout.write(v.releaseId)' "$manifest")"
application_sha="$(node -e 'const v=require(process.argv[1]); if(typeof v.applicationCommitSha!=="string")process.exit(1);process.stdout.write(v.applicationCommitSha)' "$manifest")"
image_reference="$(node -e 'const v=require(process.argv[1]); if(typeof v.image?.reference!=="string")process.exit(1);process.stdout.write(v.image.reference)' "$manifest")"
image_digest="$(node -e 'const v=require(process.argv[1]); if(typeof v.image?.digest!=="string")process.exit(1);process.stdout.write(v.image.digest)' "$manifest")"
manifest_sha="$(node -e 'const v=require(process.argv[1]); if(typeof v.manifestSha256!=="string")process.exit(1);process.stdout.write(v.manifestSha256)' "$manifest")"
[[ "$application_sha" == "$source_sha" ]] || { echo "Release manifest is not bound to this source revision." >&2; exit 1; }

project="flowcordia-beta-failure-$workspace_id"
volume_prefix="$project"
application_network="$project-application"
supervisor_network="$project-supervisor"
docker_proxy_network="$project-docker-proxy"
smtp_container="$project-smtp"
http_port=32080
registry_port=32081
minio_port=32082
for port in "$http_port" "$registry_port" "$minio_port"; do
  if ss -ltn "sport = :$port" | tail -n +2 | grep -q .; then
    echo "Required protected runner port $port is already occupied." >&2
    exit 1
  fi
done

cp "$config" "$derived_config"
cp "$secrets" "$derived_secrets"
chmod 0600 "$derived_config" "$derived_secrets"
cat >> "$derived_config" <<EOF
FLOWCORDIA_CONFIG_FILE=$derived_config
FLOWCORDIA_SECRETS_FILE=$derived_secrets
FLOWCORDIA_RELEASE_MANIFEST_FILE=$manifest
FLOWCORDIA_REGISTRY_AUTH_FILE=$registry_auth
FLOWCORDIA_MIGRATION_STATE_DIR=$migration_dir
FLOWCORDIA_DIAGNOSTICS_STATE_DIR=$install_diagnostics
FLOWCORDIA_IMAGE_REFERENCE=$image_reference
FLOWCORDIA_IMAGE_DIGEST=$image_digest
FLOWCORDIA_APPLICATION_COMMIT_SHA=$application_sha
FLOWCORDIA_RELEASE_MANIFEST_SHA256=$manifest_sha
FLOWCORDIA_MIGRATION_CONFIRM=$release_id
FLOWCORDIA_VOLUME_PREFIX=$volume_prefix
FLOWCORDIA_APPLICATION_NETWORK_NAME=$application_network
FLOWCORDIA_SUPERVISOR_NETWORK_NAME=$supervisor_network
FLOWCORDIA_DOCKER_PROXY_NETWORK_NAME=$docker_proxy_network
FLOWCORDIA_STUDIO_BUILDER_DOCKER_PROXY_NETWORK_NAME=${project}-studio-builder-docker-proxy
FLOWCORDIA_STUDIO_BUILD_NETWORK=host
FLOWCORDIA_HTTP_BIND=127.0.0.1
FLOWCORDIA_HTTP_PORT=$http_port
FLOWCORDIA_REGISTRY_PORT=$registry_port
FLOWCORDIA_MINIO_CONSOLE_PORT=$minio_port
FLOWCORDIA_DEPLOY_REGISTRY_HOST=127.0.0.1:$registry_port
DEPLOY_REGISTRY_HOST=127.0.0.1:$registry_port
EOF
cat >> "$derived_secrets" <<EOF
ALERT_EMAIL_TRANSPORT=smtp
ALERT_SMTP_HOST=$smtp_container
ALERT_SMTP_PORT=2525
ALERT_SMTP_SECURE=false
ALERT_SMTP_USER=
ALERT_SMTP_PASSWORD=
ALERT_FROM_EMAIL=flowcordia-beta-failure@localhost.invalid
ALERT_REPLY_TO_EMAIL=flowcordia-beta-failure@localhost.invalid
EOF

compose() {
  docker compose \
    --project-name "$project" \
    --env-file "$derived_config" \
    --env-file "$derived_secrets" \
    -f "$checkout/docker/flowcordia-self-host.yml" \
    -f "$checkout/docker/flowcordia-bundled.yml" \
    "$@"
}

cleanup() {
  set +e
  docker rm -f "$smtp_container" >/dev/null 2>&1
  compose --profile diagnostics down --remove-orphans --volumes >/dev/null 2>&1
}
trap cleanup EXIT

if docker ps -aq --filter "label=com.docker.compose.project=$project" | grep -q .; then
  echo "Beta failure Compose project is not clean." >&2
  exit 1
fi
docker inspect "$smtp_container" >/dev/null 2>&1 && { echo "Beta failure SMTP fixture already exists." >&2; exit 1; }
for resource in "$application_network" "$supervisor_network" "$docker_proxy_network"; do
  docker network inspect "$resource" >/dev/null 2>&1 && { echo "Beta failure network already exists." >&2; exit 1; }
done
for suffix in postgres redis clickhouse minio registry s2 s2-config shared; do
  docker volume inspect "$volume_prefix-$suffix" >/dev/null 2>&1 && { echo "Beta failure volume already exists." >&2; exit 1; }
done

started_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
pnpm --dir "$checkout" exec tsx scripts/flowcordia-bundled-validate.ts \
  --config "$derived_config" --secrets "$derived_secrets" --manifest "$manifest" --registry-auth "$registry_auth"
compose --profile diagnostics config --quiet
compose pull
compose up -d --wait
compose --profile diagnostics run --rm --no-deps doctor
[[ -f "$install_diagnostics/$release_id.json" ]] || { echo "Beta failure install diagnostics are unavailable." >&2; exit 1; }

bootstrap="$private_dir/bootstrap.json"
helper_image="node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0"
docker run --rm \
  --network "$application_network" \
  --env-file "$derived_config" --env-file "$derived_secrets" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$checkout:/workspace" -v "$private_dir:/private" -w /workspace \
  "$helper_image" sh -lc \
  'corepack enable >/dev/null && corepack prepare pnpm@10.33.2 --activate >/dev/null && pnpm --filter webapp exec tsx apps/webapp/scripts/flowcordia-bundled-reference-bootstrap.ts --output /private/bootstrap.json && chown "$HOST_UID:$HOST_GID" /private/bootstrap.json'
chmod 0600 "$bootstrap"

project_ref="$(node -e 'const v=require(process.argv[1]); if(typeof v.projectRef!=="string")process.exit(1);process.stdout.write(v.projectRef)' "$bootstrap")"
pat="$(node -e 'const v=require(process.argv[1]); if(typeof v.personalAccessToken!=="string")process.exit(1);process.stdout.write(v.personalAccessToken)' "$bootstrap")"
environment_key="$(node -e 'const v=require(process.argv[1]); if(typeof v.environmentApiKey!=="string")process.exit(1);process.stdout.write(v.environmentApiKey)' "$bootstrap")"
[[ "$project_ref" == "proj_flowcordiabetareference" && "$pat" == tr_pat_* && "$environment_key" == tr_prod_* ]] || exit 1

pnpm --dir "$checkout" --filter trigger.dev... build
export TRIGGER_ACCESS_TOKEN="$pat"
export TRIGGER_API_URL="http://127.0.0.1:$http_port"
export TRIGGER_PROJECT_REF="$project_ref"
export TRIGGER_LOCAL_BUILD_LABEL_DISABLED=1
export TRIGGER_DEPLOYMENT_LINK_OUTPUT_DISABLED=1
deploy_output="$private_dir/deploy-output"
deploy_env="$private_dir/deploy-env"
: > "$deploy_output"
: > "$deploy_env"
GITHUB_OUTPUT="$deploy_output" GITHUB_ENV="$deploy_env" \
  node "$checkout/packages/cli-v3/dist/esm/index.js" deploy "$checkout/packages/trigger-sdk/test/flowcordia-api-trigger-reliability" \
    --env prod --project-ref "$project_ref" --skip-update-check --skip-sync-env-vars \
    --local-build --push --plain
unset TRIGGER_ACCESS_TOKEN

deployment_version="$(sed -n 's/^deploymentVersion=//p' "$deploy_output" | tail -1)"
[[ "$deployment_version" =~ ^[A-Za-z0-9._/-]{1,256}$ ]] || { echo "Beta failure deployment version is unavailable." >&2; exit 1; }

load_observation="$private_dir/load.json"
pnpm --dir "$checkout" exec tsx scripts/flowcordia-beta-load-client.ts \
  --base-url "http://127.0.0.1:$http_port" \
  --api-key "$environment_key" \
  --deployment-version "$deployment_version" \
  --timeout-seconds 900 \
  --output "$load_observation"

smtp_mode="$private_dir/smtp-mode"
smtp_deliveries="$private_dir/smtp-deliveries.jsonl"
printf 'reject\n' > "$smtp_mode"
: > "$smtp_deliveries"
chmod 0600 "$smtp_mode" "$smtp_deliveries"
docker run -d --name "$smtp_container" \
  --network "$application_network" \
  -e FLOWCORDIA_SMTP_MODE_FILE=/private/smtp-mode \
  -e FLOWCORDIA_SMTP_DELIVERIES_FILE=/private/smtp-deliveries.jsonl \
  -e FLOWCORDIA_SMTP_FIXTURE_PORT=2525 \
  -v "$checkout/scripts/flowcordia-beta-smtp-fixture.mjs:/fixture.mjs:ro" \
  -v "$private_dir:/private" \
  "$helper_image" node /fixture.mjs >/dev/null
for _ in $(seq 1 30); do
  docker logs "$smtp_container" 2>&1 | grep -q 'listening on 2525' && break
  sleep 1
done
docker logs "$smtp_container" 2>&1 | grep -q 'listening on 2525' || { echo "SMTP failure fixture did not become ready." >&2; exit 1; }

delivery_observation="$private_dir/delivery.json"
docker run --rm \
  --network "$application_network" \
  --env-file "$derived_config" --env-file "$derived_secrets" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$checkout:/workspace" -v "$private_dir:/private" -w /workspace \
  "$helper_image" sh -lc \
  'corepack enable >/dev/null && corepack prepare pnpm@10.33.2 --activate >/dev/null && pnpm --filter webapp exec tsx apps/webapp/scripts/flowcordia-beta-failure-delivery.ts --bootstrap /private/bootstrap.json --mode-file /private/smtp-mode --deliveries-file /private/smtp-deliveries.jsonl --output /private/delivery.json && chown "$HOST_UID:$HOST_GID" /private/delivery.json'
chmod 0600 "$delivery_observation"

compose restart web operations supervisor
compose up -d --no-deps --wait web operations supervisor
FLOWCORDIA_DIAGNOSTICS_STATE_DIR="$post_diagnostics" compose --profile diagnostics run --rm --no-deps doctor
[[ -f "$post_diagnostics/$release_id.json" ]] || { echo "Post-failure diagnostics are unavailable." >&2; exit 1; }

cleanup
trap - EXIT
containers_absent=true
networks_absent=true
volumes_absent=true
docker ps -aq --filter "label=com.docker.compose.project=$project" | grep -q . && containers_absent=false
docker inspect "$smtp_container" >/dev/null 2>&1 && containers_absent=false
for resource in "$application_network" "$supervisor_network" "$docker_proxy_network"; do
  docker network inspect "$resource" >/dev/null 2>&1 && networks_absent=false
done
for suffix in postgres redis clickhouse minio registry s2 s2-config shared; do
  docker volume inspect "$volume_prefix-$suffix" >/dev/null 2>&1 && volumes_absent=false
done
[[ "$containers_absent" == true && "$networks_absent" == true && "$volumes_absent" == true ]] || {
  echo "Beta failure resources remain after teardown." >&2
  exit 1
}

completed_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
mkdir -m 0700 -p "$(dirname "$observation")"
node - "$load_observation" "$delivery_observation" "$observation" "$started_at" "$completed_at" <<'NODE'
const fs = require("node:fs");
const [loadPath, deliveryPath, output, startedAt, completedAt] = process.argv.slice(2);
const load = JSON.parse(fs.readFileSync(loadPath, "utf8"));
const delivery = JSON.parse(fs.readFileSync(deliveryPath, "utf8"));
const value = {
  schemaVersion: "0.1",
  startedAt,
  completedAt,
  load: load.load,
  queueSaturation: load.queueSaturation,
  workerLoss: delivery.workerLoss,
  providerOutage: delivery.providerOutage,
  postFailureDiagnostics: "READY",
  teardown: { containersAbsent: true, networksAbsent: true, volumesAbsent: true },
};
fs.writeFileSync(output, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
NODE
chmod 0600 "$observation"
rm -rf "$work_dir"
