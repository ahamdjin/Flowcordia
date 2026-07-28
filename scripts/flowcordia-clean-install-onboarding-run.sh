#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: scripts/flowcordia-clean-install-onboarding-run.sh \
  --checkout <absolute-path> --config <absolute-path> --secrets <absolute-path> \
  --manifest <absolute-path> --image-evidence <absolute-path> \
  --registry-auth <absolute-path> --work-root <absolute-path> --output <absolute-path> \
  --repository <owner/name> --run-id <id> --run-attempt <number> --source-sha <sha>
USAGE
  exit 2
}

absolute() {
  [[ "$1" == /* && "$1" != *$'\0'* ]] || usage
  printf '%s' "$1"
}

checkout=""
config=""
secrets=""
manifest=""
image_evidence=""
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
    --image-evidence) image_evidence="$(absolute "$value")" ;;
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

for required in checkout config secrets manifest image_evidence registry_auth work_root output repository run_id run_attempt source_sha; do
  [[ -n "${!required}" ]] || usage
done
[[ "$(id -u)" == "1000" ]] || { echo "Clean-install onboarding must run as UID 1000." >&2; exit 1; }
[[ -d "$checkout" && -f "$config" && -f "$secrets" && -f "$manifest" && -f "$image_evidence" && -f "$registry_auth" ]] || {
  echo "Clean-install onboarding inputs are unavailable." >&2
  exit 1
}
[[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 1
[[ "$run_id" =~ ^[1-9][0-9]{0,19}$ && "$run_attempt" =~ ^[1-9][0-9]{0,2}$ ]] || exit 1
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ ! -e "$work_root" && ! -e "$output" ]] || {
  echo "Clean-install onboarding workspace or evidence already exists." >&2
  exit 1
}

for environment_name in \
  FLOWCORDIA_ACCEPTANCE_GITHUB_APP_ID \
  FLOWCORDIA_ACCEPTANCE_GITHUB_APP_SLUG \
  FLOWCORDIA_ACCEPTANCE_GITHUB_PRIVATE_KEY \
  FLOWCORDIA_ACCEPTANCE_GITHUB_WEBHOOK_SECRET \
  FLOWCORDIA_ACCEPTANCE_GITHUB_INSTALLATION_ID \
  FLOWCORDIA_ACCEPTANCE_REFERENCE_REPOSITORY \
  FLOWCORDIA_ACCEPTANCE_REFERENCE_BRANCH \
  FLOWCORDIA_ACCEPTANCE_MAILPIT_IMAGE_REFERENCE \
  FLOWCORDIA_ACCEPTANCE_CADDY_IMAGE_REFERENCE; do
  [[ -n "${!environment_name:-}" ]] || { echo "$environment_name is required." >&2; exit 1; }
done
[[ "$FLOWCORDIA_ACCEPTANCE_MAILPIT_IMAGE_REFERENCE" =~ @sha256:[0-9a-f]{64}$ ]] || {
  echo "Mailpit must use an immutable digest reference." >&2
  exit 1
}
[[ "$FLOWCORDIA_ACCEPTANCE_CADDY_IMAGE_REFERENCE" =~ @sha256:[0-9a-f]{64}$ ]] || {
  echo "Caddy must use an immutable digest reference." >&2
  exit 1
}

mkdir -m 0700 -p "$work_root"
workspace_id="$(printf '%s:%s:%s' "$run_id" "$run_attempt" "$source_sha" | sha256sum | cut -c1-12)"
work_dir="$work_root/$workspace_id"
private_dir="$work_dir/private"
browser_dir="$work_dir/browser"
cert_dir="$work_dir/certs"
migration_dir="$work_dir/migrations"
diagnostics_dir="$work_dir/diagnostics"
mkdir -m 0700 "$work_dir" "$private_dir" "$browser_dir" "$cert_dir" "$migration_dir" "$diagnostics_dir"

derived_config="$work_dir/deployment.env"
derived_secrets="$work_dir/deployment.secrets"
overlay="$work_dir/acceptance.compose.yml"
caddyfile="$cert_dir/Caddyfile"
observations="$work_dir/observations.json"
final_observations="$work_dir/final-observations.json"
release_identity="$private_dir/release-identity.json"
github_fixture="$private_dir/github-fixture.json"
reference_checkout="$work_dir/reference-repository"

release_id="$(node -e 'const v=require(process.argv[1]);if(typeof v.releaseId!=="string")process.exit(1);process.stdout.write(v.releaseId)' "$manifest")"
version="$(node -e 'const v=require(process.argv[1]);if(typeof v.version!=="string")process.exit(1);process.stdout.write(v.version)' "$manifest")"
application_sha="$(node -e 'const v=require(process.argv[1]);if(typeof v.applicationCommitSha!=="string")process.exit(1);process.stdout.write(v.applicationCommitSha)' "$manifest")"
image_reference="$(node -e 'const v=require(process.argv[1]);if(typeof v.image?.reference!=="string")process.exit(1);process.stdout.write(v.image.reference)' "$manifest")"
image_digest="$(node -e 'const v=require(process.argv[1]);if(typeof v.image?.digest!=="string")process.exit(1);process.stdout.write(v.image.digest)' "$manifest")"
manifest_sha="$(node -e 'const v=require(process.argv[1]);if(typeof v.manifestSha256!=="string")process.exit(1);process.stdout.write(v.manifestSha256)' "$manifest")"
publication_sha="$(node -e 'const v=require(process.argv[1]);if(typeof v.evidenceSha256!=="string")process.exit(1);process.stdout.write(v.evidenceSha256)' "$image_evidence")"
[[ "$application_sha" == "$source_sha" ]] || { echo "The release is not bound to this exact source revision." >&2; exit 1; }

project="flowcordia-onboarding-$workspace_id"
volume_prefix="$project"
application_network="$project-application"
supervisor_network="$project-supervisor"
docker_proxy_network="$project-docker-proxy"
http_port=31280
registry_port=31281
minio_port=31282
mailpit_port=31283
tls_port=31284
for port in "$http_port" "$registry_port" "$minio_port" "$mailpit_port" "$tls_port"; do
  if ss -ltn "sport = :$port" | tail -n +2 | grep -q .; then
    echo "Required protected runner port $port is occupied." >&2
    exit 1
  fi
done

setup_token="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
owner_password="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("base64url"))')"
owner_email="owner-$workspace_id@localhost.invalid"
second_email="member-$workspace_id@localhost.invalid"

node - "$config" "$derived_config" <<'NODE'
const fs = require("node:fs");
const [input, output] = process.argv.slice(2);
const remove = /^(FLOWCORDIA_(?:CONFIG_FILE|SECRETS_FILE|RELEASE_MANIFEST_FILE|MIGRATION_STATE_DIR|DIAGNOSTICS_STATE_DIR|REGISTRY_AUTH_FILE|IMAGE_REFERENCE|IMAGE_DIGEST|APPLICATION_COMMIT_SHA|RELEASE_MANIFEST_SHA256|MIGRATION_CONFIRM|VOLUME_PREFIX|APPLICATION_NETWORK_NAME|SUPERVISOR_NETWORK_NAME|DOCKER_PROXY_NETWORK_NAME|HTTP_BIND|HTTP_PORT|MINIO_CONSOLE_PORT|REGISTRY_PORT|DEPLOY_REGISTRY_HOST)|DEPLOY_REGISTRY_HOST|APP_ORIGIN|LOGIN_ORIGIN|BROWSER_ORIGIN|EMAIL_TRANSPORT|FROM_EMAIL|REPLY_TO_EMAIL|GITHUB_APP_.+)\s*=/;
const lines = fs.readFileSync(input, "utf8").split(/\r?\n/).filter((line) => !remove.test(line));
fs.writeFileSync(output, `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
NODE
node - "$secrets" "$derived_secrets" <<'NODE'
const fs = require("node:fs");
const [input, output] = process.argv.slice(2);
const remove = /^(FLOWCORDIA_SETUP_TOKEN|GITHUB_APP_.+|EMAIL_.+|SMTP_.+|RESEND_.+|FROM_EMAIL|REPLY_TO_EMAIL)\s*=/;
const lines = fs.readFileSync(input, "utf8").split(/\r?\n/).filter((line) => !remove.test(line));
fs.writeFileSync(output, `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
NODE
chmod 0600 "$derived_config" "$derived_secrets"
cat >> "$derived_config" <<EOF_CONFIG
FLOWCORDIA_CONFIG_FILE=$derived_config
FLOWCORDIA_SECRETS_FILE=$derived_secrets
FLOWCORDIA_RELEASE_MANIFEST_FILE=$manifest
FLOWCORDIA_REGISTRY_AUTH_FILE=$registry_auth
FLOWCORDIA_MIGRATION_STATE_DIR=$migration_dir
FLOWCORDIA_DIAGNOSTICS_STATE_DIR=$diagnostics_dir
FLOWCORDIA_IMAGE_REFERENCE=$image_reference
FLOWCORDIA_IMAGE_DIGEST=$image_digest
FLOWCORDIA_APPLICATION_COMMIT_SHA=$application_sha
FLOWCORDIA_RELEASE_MANIFEST_SHA256=$manifest_sha
FLOWCORDIA_MIGRATION_CONFIRM=$release_id
FLOWCORDIA_VOLUME_PREFIX=$volume_prefix
FLOWCORDIA_APPLICATION_NETWORK_NAME=$application_network
FLOWCORDIA_SUPERVISOR_NETWORK_NAME=$supervisor_network
FLOWCORDIA_DOCKER_PROXY_NETWORK_NAME=$docker_proxy_network
FLOWCORDIA_HTTP_BIND=127.0.0.1
FLOWCORDIA_HTTP_PORT=$http_port
FLOWCORDIA_REGISTRY_PORT=$registry_port
FLOWCORDIA_MINIO_CONSOLE_PORT=$minio_port
FLOWCORDIA_DEPLOY_REGISTRY_HOST=127.0.0.1:$registry_port
DEPLOY_REGISTRY_HOST=127.0.0.1:$registry_port
APP_ORIGIN=https://127.0.0.1:$tls_port
LOGIN_ORIGIN=https://127.0.0.1:$tls_port
BROWSER_ORIGIN=https://127.0.0.1:$tls_port
FLOWCORDIA_STUDIO_ENABLED=1
FLOWCORDIA_ACCEPTANCE_MAILPIT_IMAGE_REFERENCE=$FLOWCORDIA_ACCEPTANCE_MAILPIT_IMAGE_REFERENCE
FLOWCORDIA_ACCEPTANCE_CADDY_IMAGE_REFERENCE=$FLOWCORDIA_ACCEPTANCE_CADDY_IMAGE_REFERENCE
EOF_CONFIG
cat >> "$derived_secrets" <<EOF_SECRETS
FLOWCORDIA_SETUP_TOKEN=$setup_token
EOF_SECRETS

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$cert_dir/key.pem" -out "$cert_dir/cert.pem" \
  -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" >/dev/null 2>&1
chmod 0600 "$cert_dir/key.pem" "$cert_dir/cert.pem"
cat > "$caddyfile" <<'EOF_CADDY'
:8443 {
  tls /certs/cert.pem /certs/key.pem
  reverse_proxy web:3000
}
EOF_CADDY
cat > "$overlay" <<EOF_OVERLAY
services:
  mailpit:
    image: \${FLOWCORDIA_ACCEPTANCE_MAILPIT_IMAGE_REFERENCE:?}
    restart: unless-stopped
    networks:
      - application
    ports:
      - target: 8025
        published: "$mailpit_port"
        host_ip: 127.0.0.1
        protocol: tcp
  tls-proxy:
    image: \${FLOWCORDIA_ACCEPTANCE_CADDY_IMAGE_REFERENCE:?}
    restart: unless-stopped
    depends_on:
      web:
        condition: service_healthy
    command: ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
    volumes:
      - "$caddyfile:/etc/caddy/Caddyfile:ro"
      - "$cert_dir:/certs:ro"
    networks:
      - application
    ports:
      - target: 8443
        published: "$tls_port"
        host_ip: 127.0.0.1
        protocol: tcp
EOF_OVERLAY
chmod 0600 "$overlay" "$caddyfile"

node - "$release_identity" "$release_id" "$version" "$application_sha" "$image_digest" "$manifest_sha" "$publication_sha" <<'NODE'
const fs=require("node:fs");const [path,releaseId,version,applicationCommitSha,imageDigest,manifestSha256,publicationEvidenceSha256]=process.argv.slice(2);fs.writeFileSync(path,JSON.stringify({releaseId,version,applicationCommitSha,imageDigest,manifestSha256,publicationEvidenceSha256},null,2)+"\n",{mode:0o600,flag:"wx"});
NODE

compose() {
  docker compose \
    --project-name "$project" \
    --env-file "$derived_config" \
    --env-file "$derived_secrets" \
    -f "$checkout/docker/flowcordia-self-host.yml" \
    -f "$checkout/docker/flowcordia-bundled.yml" \
    -f "$overlay" \
    "$@"
}

cleanup() {
  set +e
  if [[ -f "$derived_config" && -f "$derived_secrets" && -f "$overlay" ]]; then
    compose --profile diagnostics down --remove-orphans --volumes >/dev/null 2>&1
  fi
  rm -rf "$work_dir"
}
trap cleanup EXIT

pnpm --dir "$checkout" flowcordia:self-host:artifact-preflight -- \
  --manifest "$manifest" --image-evidence "$image_evidence" \
  --expected-repository "${repository,,}" \
  --expected-run-id "$(node -e 'const v=require(process.argv[1]);process.stdout.write(v.workflow.runId)' "$image_evidence")" \
  --expected-application-sha "$source_sha"
pnpm --dir "$checkout" exec tsx scripts/flowcordia-clean-install-github-fixture.ts \
  --checkout "$reference_checkout" --output "$github_fixture"

compose --profile diagnostics config --quiet
compose pull
compose up -d --wait
for url in "https://127.0.0.1:$tls_port/healthcheck" "http://127.0.0.1:$mailpit_port/api/v1/info"; do
  for _ in $(seq 1 60); do
    if curl --silent --show-error --fail --insecure --max-time 5 "$url" >/dev/null; then break; fi
    sleep 2
  done
  curl --silent --show-error --fail --insecure --max-time 5 "$url" >/dev/null
done

pnpm --dir "$checkout" --filter trigger.dev... build
started_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
FLOWCORDIA_ACCEPTANCE_BASE_URL="https://127.0.0.1:$tls_port" \
FLOWCORDIA_ACCEPTANCE_API_URL="http://127.0.0.1:$http_port" \
FLOWCORDIA_ACCEPTANCE_OBSERVATIONS_OUTPUT="$observations" \
FLOWCORDIA_ACCEPTANCE_CHECKOUT="$checkout" \
FLOWCORDIA_ACCEPTANCE_REFERENCE_CHECKOUT="$reference_checkout" \
FLOWCORDIA_ACCEPTANCE_PRIVATE_DIR="$private_dir" \
FLOWCORDIA_ACCEPTANCE_APPLICATION_NETWORK="$application_network" \
FLOWCORDIA_ACCEPTANCE_HELPER_IMAGE="node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0" \
FLOWCORDIA_ACCEPTANCE_CONFIG_FILE="$derived_config" \
FLOWCORDIA_ACCEPTANCE_SECRETS_FILE="$derived_secrets" \
FLOWCORDIA_ACCEPTANCE_REGISTRY_PORT="$registry_port" \
FLOWCORDIA_ACCEPTANCE_MAILPIT_API="http://127.0.0.1:$mailpit_port" \
FLOWCORDIA_ACCEPTANCE_BROWSER_OUTPUT_DIR="$browser_dir" \
FLOWCORDIA_ACCEPTANCE_WORKSPACE_ID="$workspace_id" \
FLOWCORDIA_ACCEPTANCE_STARTED_AT="$started_at" \
FLOWCORDIA_ACCEPTANCE_OWNER_EMAIL="$owner_email" \
FLOWCORDIA_ACCEPTANCE_OWNER_PASSWORD="$owner_password" \
FLOWCORDIA_ACCEPTANCE_SETUP_TOKEN="$setup_token" \
FLOWCORDIA_ACCEPTANCE_SECOND_USER_EMAIL="$second_email" \
FLOWCORDIA_ACCEPTANCE_GITHUB_FIXTURE="$github_fixture" \
FLOWCORDIA_ACCEPTANCE_RELEASE_IDENTITY="$release_identity" \
pnpm --dir "$checkout" exec playwright test --config playwright.clean-install-onboarding.config.ts
[[ -f "$observations" ]] || { echo "Browser onboarding observations are unavailable." >&2; exit 1; }

curl --silent --show-error --fail -X DELETE "http://127.0.0.1:$mailpit_port/api/v1/messages" >/dev/null || true
rm -rf "$browser_dir"
compose --profile diagnostics down --remove-orphans --volumes
rm -rf "$private_dir" "$reference_checkout" "$cert_dir" "$migration_dir" "$diagnostics_dir"
rm -f "$derived_config" "$derived_secrets" "$overlay"
unset setup_token owner_password owner_email second_email
unset FLOWCORDIA_ACCEPTANCE_GITHUB_PRIVATE_KEY FLOWCORDIA_ACCEPTANCE_GITHUB_WEBHOOK_SECRET

if docker ps -aq --filter "label=com.docker.compose.project=$project" | grep -q .; then
  echo "Disposable onboarding containers remain." >&2
  exit 1
fi
for network in "$application_network" "$supervisor_network" "$docker_proxy_network"; do
  docker network inspect "$network" >/dev/null 2>&1 && { echo "Disposable onboarding network remains." >&2; exit 1; }
done
for suffix in postgres redis clickhouse minio registry s2 s2-config shared; do
  docker volume inspect "$volume_prefix-$suffix" >/dev/null 2>&1 && { echo "Disposable onboarding volume remains." >&2; exit 1; }
done
[[ ! -e "$browser_dir" ]] || { echo "Browser state remains." >&2; exit 1; }
[[ ! -e "$private_dir" && ! -e "$derived_secrets" && ! -e "$reference_checkout" ]] || {
  echo "Temporary onboarding credentials remain." >&2
  exit 1
}
if ss -ltn "sport = :$mailpit_port" | tail -n +2 | grep -q .; then
  echo "Disposable mailbox remains reachable." >&2
  exit 1
fi

pnpm --dir "$checkout" exec tsx scripts/flowcordia-clean-install-onboarding-finalize.ts \
  --observations "$observations" --output "$final_observations" \
  --completed-at "$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
pnpm --dir "$checkout" exec tsx scripts/flowcordia-clean-install-onboarding-evidence.ts \
  --observations "$final_observations" --output "$output" \
  --repository "${repository,,}" --run-id "$run_id" --run-attempt "$run_attempt" \
  --source-sha "$source_sha"

rm -f "$observations" "$final_observations"
rmdir "$work_dir" "$work_root"
trap - EXIT
