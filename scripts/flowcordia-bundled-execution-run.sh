#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: scripts/flowcordia-bundled-execution-run.sh \
  --checkout <absolute-path> --config <absolute-path> --secrets <absolute-path> \
  --manifest <absolute-path> --registry-auth <absolute-path> \
  --work-root <absolute-path> --output <absolute-path> \
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
output=""
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
    --output) output="$(absolute "$value")" ;;
    --repository) repository="$value" ;;
    --run-id) run_id="$value" ;;
    --run-attempt) run_attempt="$value" ;;
    --source-sha) source_sha="$value" ;;
    *) usage ;;
  esac
done

for required in checkout config secrets manifest registry_auth work_root output repository run_id run_attempt source_sha; do
  [[ -n "${!required}" ]] || usage
done
[[ "$(id -u)" == "1000" ]] || { echo "Bundled execution runner must use UID 1000." >&2; exit 1; }
[[ -d "$checkout" && -f "$config" && -f "$secrets" && -f "$manifest" && -f "$registry_auth" ]] || {
  echo "Bundled execution inputs are unavailable." >&2
  exit 1
}
[[ ! -e "$work_root" && ! -e "$output" ]] || {
  echo "Bundled execution workspace or evidence already exists." >&2
  exit 1
}
[[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 1
[[ "$run_id" =~ ^[1-9][0-9]{0,19}$ && "$run_attempt" =~ ^[1-9][0-9]{0,2}$ ]] || exit 1
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || exit 1

mkdir -m 0700 -p "$work_root"
workspace_id="$(printf '%s:%s:%s' "$run_id" "$run_attempt" "$source_sha" | sha256sum | cut -c1-12)"
work_dir="$work_root/$workspace_id"
mkdir -m 0700 "$work_dir"
derived_config="$work_dir/deployment.env"
private_dir="$work_dir/private"
migration_dir="$work_dir/migrations"
install_diagnostics="$work_dir/install-diagnostics"
restart_diagnostics="$work_dir/restart-diagnostics"
mkdir -m 0700 "$private_dir" "$migration_dir" "$install_diagnostics" "$restart_diagnostics"

release_id="$(node -e 'const v=require(process.argv[1]); if(typeof v.releaseId!=="string") process.exit(1); process.stdout.write(v.releaseId)' "$manifest")"
application_sha="$(node -e 'const v=require(process.argv[1]); if(typeof v.applicationCommitSha!=="string") process.exit(1); process.stdout.write(v.applicationCommitSha)' "$manifest")"
image_reference="$(node -e 'const v=require(process.argv[1]); if(typeof v.image?.reference!=="string") process.exit(1); process.stdout.write(v.image.reference)' "$manifest")"
image_digest="$(node -e 'const v=require(process.argv[1]); if(typeof v.image?.digest!=="string") process.exit(1); process.stdout.write(v.image.digest)' "$manifest")"
manifest_sha="$(node -e 'const v=require(process.argv[1]); if(typeof v.manifestSha256!=="string") process.exit(1); process.stdout.write(v.manifestSha256)' "$manifest")"
[[ "$application_sha" == "$source_sha" ]] || { echo "Release manifest is not bound to this source revision." >&2; exit 1; }

project="flowcordia-beta-$workspace_id"
volume_prefix="$project"
application_network="$project-application"
supervisor_network="$project-supervisor"
docker_proxy_network="$project-docker-proxy"
http_port=31080
registry_port=31081
minio_port=31082
for port in "$http_port" "$registry_port" "$minio_port"; do
  if ss -ltn "sport = :$port" | tail -n +2 | grep -q .; then
    echo "Required protected runner port $port is already occupied." >&2
    exit 1
  fi
done

cp "$config" "$derived_config"
chmod 0600 "$derived_config"
cat >> "$derived_config" <<EOF
FLOWCORDIA_CONFIG_FILE=$derived_config
FLOWCORDIA_SECRETS_FILE=$secrets
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

compose() {
  docker compose \
    --project-name "$project" \
    --env-file "$derived_config" \
    --env-file "$secrets" \
    -f "$checkout/docker/flowcordia-self-host.yml" \
    -f "$checkout/docker/flowcordia-bundled.yml" \
    "$@"
}

cleanup() {
  set +e
  compose --profile diagnostics down --remove-orphans --volumes >/dev/null 2>&1
}
trap cleanup EXIT

if docker ps -aq --filter "label=com.docker.compose.project=$project" | grep -q .; then
  echo "Bundled execution project is not clean." >&2
  exit 1
fi
for resource in "$application_network" "$supervisor_network" "$docker_proxy_network"; do
  docker network inspect "$resource" >/dev/null 2>&1 && { echo "Bundled execution network already exists." >&2; exit 1; }
done
for suffix in postgres redis clickhouse minio registry s2 s2-config shared; do
  docker volume inspect "$volume_prefix-$suffix" >/dev/null 2>&1 && { echo "Bundled execution volume already exists." >&2; exit 1; }
done
started_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"

pnpm --dir "$checkout" exec tsx scripts/flowcordia-bundled-validate.ts \
  --config "$derived_config" --secrets "$secrets" --manifest "$manifest" --registry-auth "$registry_auth"
compose --profile diagnostics config --quiet
compose pull
compose up -d --wait

service_state="$private_dir/services.json"
compose ps --format json > "$private_dir/compose-ps.json"
node - "$private_dir/compose-ps.json" "$service_state" <<'NODE'
const fs = require("node:fs");
const [input, output] = process.argv.slice(2);
const text = fs.readFileSync(input, "utf8").trim();
let rows = [];
if (text.startsWith("[")) rows = JSON.parse(text);
else rows = text.split(/\n/).filter(Boolean).map((line) => JSON.parse(line));
const required = ["postgres","redis","electric","clickhouse","minio","registry","s2","docker-proxy","web","operations","supervisor"];
const services = {};
for (const name of required) {
  const row = rows.find((entry) => (entry.Service ?? entry.service) === name);
  const state = String(row?.State ?? row?.state ?? "").toLowerCase();
  const health = String(row?.Health ?? row?.health ?? "").toLowerCase();
  if (state !== "running" || (health && health !== "healthy")) {
    throw new Error(`Bundled service ${name} is not ready.`);
  }
  services[name] = "READY";
}
fs.writeFileSync(output, JSON.stringify(services, null, 2) + "\n", { mode: 0o600, flag: "wx" });
NODE

compose --profile diagnostics run --rm --no-deps doctor
[[ -f "$install_diagnostics/$release_id.json" ]] || { echo "Bundled install diagnostics are unavailable." >&2; exit 1; }

bootstrap="$private_dir/bootstrap.json"
helper_image="node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0"
docker run --rm \
  --network "$application_network" \
  --env-file "$derived_config" --env-file "$secrets" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$checkout:/workspace" -v "$private_dir:/private" -w /workspace \
  "$helper_image" sh -lc \
  'corepack enable >/dev/null && corepack prepare pnpm@10.33.2 --activate >/dev/null && pnpm --filter webapp exec tsx apps/webapp/scripts/flowcordia-bundled-reference-bootstrap.ts --output /private/bootstrap.json && chown "$HOST_UID:$HOST_GID" /private/bootstrap.json'
chmod 0600 "$bootstrap"

project_ref="$(node -e 'const v=require(process.argv[1]); if(typeof v.projectRef!=="string")process.exit(1);process.stdout.write(v.projectRef)' "$bootstrap")"
pat="$(node -e 'const v=require(process.argv[1]); if(typeof v.personalAccessToken!=="string")process.exit(1);process.stdout.write(v.personalAccessToken)' "$bootstrap")"
[[ "$project_ref" == "proj_flowcordiabetareference" && "$pat" == tr_pat_* ]] || exit 1

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
  node "$checkout/packages/cli-v3/dist/esm/index.js" deploy "$checkout/packages/trigger-sdk/test/flowcordia-beta-reference" \
    --env prod --project-ref "$project_ref" --skip-update-check --skip-sync-env-vars \
    --local-build --push --plain
unset TRIGGER_ACCESS_TOKEN

deployment_version="$(sed -n 's/^deploymentVersion=//p' "$deploy_output" | tail -1)"
[[ "$deployment_version" =~ ^[A-Za-z0-9._/-]{1,256}$ ]] || { echo "Reference deployment version is unavailable." >&2; exit 1; }
deployed_task_count=1

busybox_image="$(node - "$derived_config" <<'NODE'
const fs=require("node:fs");const lines=fs.readFileSync(process.argv[2],"utf8").split(/\r?\n/);let value="busybox:1.37";for(const line of lines){if(line.startsWith("FLOWCORDIA_BUSYBOX_IMAGE_REFERENCE="))value=line.slice(line.indexOf("=")+1)}process.stdout.write(value);
NODE
)"
s2_volume="$volume_prefix-s2"
s2_before="$(docker run --rm -v "$s2_volume:/data:ro" "$busybox_image" sh -c 'tar -cf - -C /data .' | sha256sum | cut -d' ' -f1)"

events="$private_dir/docker-events.jsonl"
event_started="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
docker events --since "$event_started" --format '{{json .}}' > "$events" &
event_pid=$!
execution="$private_dir/execution.json"
pnpm --dir "$checkout" exec tsx scripts/flowcordia-bundled-reference-client.ts \
  --bootstrap "$bootstrap" --base-url "http://127.0.0.1:$http_port" \
  --timeout-seconds 900 --output "$execution"
sleep 3
kill "$event_pid" >/dev/null 2>&1 || true
wait "$event_pid" >/dev/null 2>&1 || true

registry_prefix="127.0.0.1:$registry_port/flowcordia/"
node - "$events" "$registry_prefix" <<'NODE'
const fs=require("node:fs");const [path,prefix]=process.argv.slice(2);const rows=fs.readFileSync(path,"utf8").split(/\n/).filter(Boolean).flatMap((line)=>{try{return [JSON.parse(line)]}catch{return []}});const matched=rows.some((row)=>{const status=String(row.status??row.Status??row.Action??"").toLowerCase();const attrs=row.Actor?.Attributes??row.actor?.attributes??{};const image=String(attrs.image??"");return ["create","start","die"].includes(status)&&image.startsWith(prefix)});if(!matched)throw new Error("No supervisor-created reference workload container was observed.");
NODE

s2_after="$(docker run --rm -v "$s2_volume:/data:ro" "$busybox_image" sh -c 'tar -cf - -C /data .' | sha256sum | cut -d' ' -f1)"
[[ "$s2_before" != "$s2_after" ]] || { echo "S2 durable state did not change during the verified reference run." >&2; exit 1; }

compose restart web operations supervisor
compose up -d --no-deps --wait web operations supervisor
FLOWCORDIA_DIAGNOSTICS_STATE_DIR="$restart_diagnostics" compose --profile diagnostics run --rm --no-deps doctor
[[ -f "$restart_diagnostics/$release_id.json" ]] || { echo "Bundled restart diagnostics are unavailable." >&2; exit 1; }

cleanup
trap - EXIT
containers_absent=true
networks_absent=true
volumes_absent=true
docker ps -aq --filter "label=com.docker.compose.project=$project" | grep -q . && containers_absent=false
for resource in "$application_network" "$supervisor_network" "$docker_proxy_network"; do
  docker network inspect "$resource" >/dev/null 2>&1 && networks_absent=false
done
for suffix in postgres redis clickhouse minio registry s2 s2-config shared; do
  docker volume inspect "$volume_prefix-$suffix" >/dev/null 2>&1 && volumes_absent=false
done
[[ "$containers_absent" == true && "$networks_absent" == true && "$volumes_absent" == true ]] || {
  echo "Bundled execution resources remain after teardown." >&2
  exit 1
}
completed_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
observation="$private_dir/observation.json"
node - "$service_state" "$observation" "$started_at" "$completed_at" "$deployment_version" "$deployed_task_count" <<'NODE'
const fs=require("node:fs");const [servicesPath,output,startedAt,completedAt,deploymentVersion,taskCount]=process.argv.slice(2);const services=JSON.parse(fs.readFileSync(servicesPath,"utf8"));const value={schemaVersion:"0.1",startedAt,completedAt,services,cleanInstall:true,doctorReady:true,deploymentVersion,deployedTaskCount:Number(taskCount),supervisorWorkloadObserved:true,s2StateChanged:true,restartReady:true,teardown:{containersAbsent:true,networksAbsent:true,volumesAbsent:true}};fs.writeFileSync(output,JSON.stringify(value,null,2)+"\n",{mode:0o600,flag:"wx"});
NODE

pnpm --dir "$checkout" exec tsx scripts/flowcordia-bundled-execution-evidence.ts \
  --manifest "$manifest" --observation "$observation" --execution "$execution" \
  --repository "$repository" --run-id "$run_id" --run-attempt "$run_attempt" \
  --source-sha "$source_sha" --output "$output"
rm -rf "$work_dir"
echo "Flowcordia bundled supervisor and S2 execution acceptance: READY"
