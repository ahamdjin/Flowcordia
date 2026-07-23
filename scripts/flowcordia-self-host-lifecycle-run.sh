#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: scripts/flowcordia-self-host-lifecycle-run.sh \
  --current-checkout <path> --target-checkout <path> \
  --current-config <path> --current-secrets <path> \
  --target-config <path> --target-secrets <path> \
  --current-manifest <path> --current-image-evidence <path> \
  --target-manifest <path> --target-image-evidence <path> \
  --work-root <path> --output <path> \
  --repository <owner/name> --run-id <id> --run-attempt <number> --source-sha <sha>
USAGE
  exit 2
}

absolute_path() {
  [[ "$1" == /* && "$1" != *$'\0'* ]] || usage
  printf '%s' "$1"
}

current_checkout=""
target_checkout=""
current_config=""
current_secrets=""
target_config=""
target_secrets=""
current_manifest=""
current_image_evidence=""
target_manifest=""
target_image_evidence=""
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
    --current-checkout) current_checkout="$(absolute_path "$value")" ;;
    --target-checkout) target_checkout="$(absolute_path "$value")" ;;
    --current-config) current_config="$(absolute_path "$value")" ;;
    --current-secrets) current_secrets="$(absolute_path "$value")" ;;
    --target-config) target_config="$(absolute_path "$value")" ;;
    --target-secrets) target_secrets="$(absolute_path "$value")" ;;
    --current-manifest) current_manifest="$(absolute_path "$value")" ;;
    --current-image-evidence) current_image_evidence="$(absolute_path "$value")" ;;
    --target-manifest) target_manifest="$(absolute_path "$value")" ;;
    --target-image-evidence) target_image_evidence="$(absolute_path "$value")" ;;
    --work-root) work_root="$(absolute_path "$value")" ;;
    --output) output="$(absolute_path "$value")" ;;
    --repository) repository="$value" ;;
    --run-id) run_id="$value" ;;
    --run-attempt) run_attempt="$value" ;;
    --source-sha) source_sha="$value" ;;
    *) usage ;;
  esac
done

for required in \
  current_checkout target_checkout current_config current_secrets target_config target_secrets \
  current_manifest current_image_evidence target_manifest target_image_evidence work_root output \
  repository run_id run_attempt source_sha; do
  [[ -n "${!required}" ]] || usage
done

[[ "$(id -u)" == "1000" ]] || {
  echo "Flowcordia lifecycle runner must execute as UID 1000." >&2
  exit 1
}
[[ -d "$current_checkout" && -d "$target_checkout" ]] || {
  echo "Flowcordia lifecycle source checkouts are unavailable." >&2
  exit 1
}
[[ ! -e "$work_root" ]] || {
  echo "Flowcordia lifecycle workspace already exists." >&2
  exit 1
}
[[ ! -e "$output" ]] || {
  echo "Flowcordia lifecycle evidence already exists." >&2
  exit 1
}

workspace_id="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(6).toString("hex"))')"
project="flowcordia-lifecycle-${workspace_id}"
work_dir="$work_root/$workspace_id"
mkdir -p "$work_dir"
chmod 0700 "$work_root" "$work_dir"

installation_identity="$work_dir/installation-identity.json"
clean_dependencies="$work_dir/clean-dependencies.json"
current_migration_dir="$work_dir/current-migration"
current_install_doctor_dir="$work_dir/current-install-doctor"
current_restart_doctor_dir="$work_dir/current-restart-doctor"
recovery_dir="$work_dir/recovery"
target_migration_dir="$work_dir/target-migration"
target_doctor_dir="$work_dir/target-doctor"
rollback_doctor_dir="$work_dir/rollback-doctor"
mkdir -p \
  "$current_migration_dir" "$current_install_doctor_dir" "$current_restart_doctor_dir" \
  "$recovery_dir" "$target_migration_dir" "$target_doctor_dir" "$rollback_doctor_dir"
chmod 0700 "$work_dir"/*

phase_file="$work_dir/phases.tsv"
: > "$phase_file"
started_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
record_phase() {
  printf '%s\t%s\n' "$1" "$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')" >> "$phase_file"
}

manifest_field() {
  node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const path=process.argv[2].split(".");let result=value;for(const key of path)result=result?.[key];if(typeof result!=="string"&&typeof result!=="number")process.exit(1);process.stdout.write(String(result));' "$1" "$2"
}

current_release_id="$(manifest_field "$current_manifest" releaseId)"
current_application_sha="$(manifest_field "$current_manifest" applicationCommitSha)"
current_image="$(manifest_field "$current_manifest" image.reference)"
target_release_id="$(manifest_field "$target_manifest" releaseId)"
target_application_sha="$(manifest_field "$target_manifest" applicationCommitSha)"
target_image="$(manifest_field "$target_manifest" image.reference)"

compose_current() {
  FLOWCORDIA_CONFIG_FILE="$current_config" \
  FLOWCORDIA_SECRETS_FILE="$current_secrets" \
  FLOWCORDIA_RELEASE_MANIFEST_FILE="$current_manifest" \
  FLOWCORDIA_MIGRATION_STATE_DIR="${FLOWCORDIA_MIGRATION_STATE_DIR_OVERRIDE:-$current_migration_dir}" \
  FLOWCORDIA_DIAGNOSTICS_STATE_DIR="${FLOWCORDIA_DIAGNOSTICS_STATE_DIR_OVERRIDE:-$current_install_doctor_dir}" \
  docker compose --project-name "$project" --env-file "$current_config" \
    -f "$current_checkout/docker/flowcordia-self-host.yml" "$@"
}

compose_target() {
  FLOWCORDIA_CONFIG_FILE="$target_config" \
  FLOWCORDIA_SECRETS_FILE="$target_secrets" \
  FLOWCORDIA_RELEASE_MANIFEST_FILE="$target_manifest" \
  FLOWCORDIA_MIGRATION_STATE_DIR="${FLOWCORDIA_MIGRATION_STATE_DIR_OVERRIDE:-$target_migration_dir}" \
  FLOWCORDIA_DIAGNOSTICS_STATE_DIR="${FLOWCORDIA_DIAGNOSTICS_STATE_DIR_OVERRIDE:-$target_doctor_dir}" \
  docker compose --project-name "$project" --env-file "$target_config" \
    -f "$target_checkout/docker/flowcordia-self-host.yml" "$@"
}

cleanup() {
  set +e
  compose_target --profile diagnostics down --remove-orphans --volumes >/dev/null 2>&1
  compose_current --profile diagnostics down --remove-orphans --volumes >/dev/null 2>&1
}
trap cleanup EXIT

if docker ps -aq --filter "label=com.docker.compose.project=$project" | grep -q .; then
  echo "Flowcordia lifecycle project is not clean." >&2
  exit 1
fi
if docker network inspect "${project}_application" >/dev/null 2>&1; then
  echo "Flowcordia lifecycle network already exists." >&2
  exit 1
fi

pnpm --dir "$target_checkout" flowcordia:self-host:artifact-preflight -- \
  --manifest "$current_manifest" \
  --image-evidence "$current_image_evidence" \
  --expected-repository "$repository" \
  --expected-run-id "$(node -e 'const v=require(process.argv[1]);process.stdout.write(v.workflow.runId)' "$current_image_evidence")" \
  --expected-application-sha "$current_application_sha"
pnpm --dir "$target_checkout" flowcordia:self-host:artifact-preflight -- \
  --manifest "$target_manifest" \
  --image-evidence "$target_image_evidence" \
  --expected-repository "$repository" \
  --expected-run-id "$(node -e 'const v=require(process.argv[1]);process.stdout.write(v.workflow.runId)' "$target_image_evidence")" \
  --expected-application-sha "$target_application_sha"
pnpm --dir "$current_checkout" flowcordia:self-host:validate -- \
  --config "$current_config" --secrets "$current_secrets" --manifest "$current_manifest"
pnpm --dir "$target_checkout" flowcordia:self-host:validate -- \
  --config "$target_config" --secrets "$target_secrets" --manifest "$target_manifest"
record_phase artifact_verification

pnpm --dir "$target_checkout" flowcordia:self-host:transition-preflight -- \
  --current-config "$current_config" \
  --current-secrets "$current_secrets" \
  --current-manifest "$current_manifest" \
  --target-config "$target_config" \
  --target-secrets "$target_secrets" \
  --target-manifest "$target_manifest" \
  --output "$installation_identity"
record_phase installation_identity

pnpm --dir "$target_checkout" flowcordia:self-host:exec -- \
  --config "$current_config" --secrets "$current_secrets" --cwd "$target_checkout" -- \
  pnpm flowcordia:self-host:clean-dependencies \
    --manifest "$current_manifest" \
    --output "$clean_dependencies"
record_phase clean_dependency_state

docker pull "$current_image" >/dev/null
docker pull "$target_image" >/dev/null
record_phase clean_install

compose_current up --force-recreate --abort-on-container-exit --exit-code-from migrate migrate
current_migration_evidence="$current_migration_dir/$current_release_id.json"
[[ -f "$current_migration_evidence" ]] || {
  echo "Current migration evidence is unavailable." >&2
  exit 1
}
record_phase current_migration

compose_current up -d --no-deps --force-recreate --wait operations
compose_current up -d --no-deps --force-recreate --wait web
record_phase current_start

FLOWCORDIA_DIAGNOSTICS_STATE_DIR_OVERRIDE="$current_install_doctor_dir" \
  compose_current --profile diagnostics run --rm --no-deps doctor
current_install_diagnostics="$current_install_doctor_dir/$current_release_id.json"
[[ -f "$current_install_diagnostics" ]] || exit 1
record_phase current_diagnostics

compose_current restart operations web
compose_current up -d --no-deps --wait operations web
record_phase idempotent_restart

FLOWCORDIA_DIAGNOSTICS_STATE_DIR_OVERRIDE="$current_restart_doctor_dir" \
  compose_current --profile diagnostics run --rm --no-deps doctor
current_restart_diagnostics="$current_restart_doctor_dir/$current_release_id.json"
[[ -f "$current_restart_diagnostics" ]] || exit 1
record_phase restart_diagnostics

pnpm --dir "$target_checkout" flowcordia:self-host:exec -- \
  --config "$current_config" --secrets "$current_secrets" --cwd "$current_checkout" -- \
  pnpm flowcordia:db:backup --release-id "$current_release_id" --output-dir "$recovery_dir"
backup_archive="$recovery_dir/$current_release_id.dump"
backup_manifest="$recovery_dir/$current_release_id.backup.json"
pnpm --dir "$target_checkout" flowcordia:self-host:exec -- \
  --config "$current_config" --secrets "$current_secrets" --cwd "$current_checkout" -- \
  pnpm flowcordia:db:restore-rehearsal \
    --archive "$backup_archive" \
    --manifest "$backup_manifest" \
    --evidence "$recovery_dir/$current_release_id.restore.json"
restore_evidence="$recovery_dir/$current_release_id.restore.json"
record_phase recovery_rehearsal

upgrade_evidence="$work_dir/upgrade.json"
pnpm --dir "$target_checkout" flowcordia:self-host:exec -- \
  --config "$target_config" --secrets "$target_secrets" --cwd "$target_checkout" -- \
  pnpm flowcordia:upgrade:preflight \
    --current-application-sha "$current_application_sha" \
    --backup-manifest "$backup_manifest" \
    --restore-evidence "$restore_evidence" \
    --confirm-migration-review \
    --confirm-maintenance-window \
    --confirm-restore-rollback \
    --json > "$upgrade_evidence"
upgrade_kind="$(node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(v.state!=="READY"||!v.upgrade?.kind)process.exit(1);process.stdout.write(v.upgrade.kind)' "$upgrade_evidence")"
record_phase upgrade_preflight

compose_current stop web operations
compose_target up --force-recreate --abort-on-container-exit --exit-code-from migrate migrate
target_migration_evidence="$target_migration_dir/$target_release_id.json"
[[ -f "$target_migration_evidence" ]] || exit 1
record_phase target_migration

compose_target up -d --no-deps --force-recreate --wait operations
compose_target up -d --no-deps --force-recreate --wait web
record_phase target_start

FLOWCORDIA_DIAGNOSTICS_STATE_DIR_OVERRIDE="$target_doctor_dir" \
  compose_target --profile diagnostics run --rm --no-deps doctor
target_diagnostics="$target_doctor_dir/$target_release_id.json"
[[ -f "$target_diagnostics" ]] || exit 1
record_phase target_diagnostics

rollback_argument=()
if [[ "$upgrade_kind" == "application_only" ]]; then
  compose_target stop web operations
  compose_current up -d --no-deps --force-recreate --wait operations
  compose_current up -d --no-deps --force-recreate --wait web
  FLOWCORDIA_DIAGNOSTICS_STATE_DIR_OVERRIDE="$rollback_doctor_dir" \
    compose_current --profile diagnostics run --rm --no-deps doctor
  rollback_diagnostics="$rollback_doctor_dir/$current_release_id.json"
  [[ -f "$rollback_diagnostics" ]] || exit 1
  rollback_argument=(--rollback-diagnostics "$rollback_diagnostics")
elif [[ "$upgrade_kind" == "append_only_migrations" ]]; then
  compose_target stop web operations
else
  echo "Flowcordia lifecycle upgrade kind is unsupported." >&2
  exit 1
fi
record_phase rollback_boundary

cleanup
trap - EXIT
if docker ps -aq --filter "label=com.docker.compose.project=$project" | grep -q .; then
  echo "Flowcordia lifecycle containers remain after teardown." >&2
  exit 1
fi
if docker network inspect "${project}_application" >/dev/null 2>&1; then
  echo "Flowcordia lifecycle network remains after teardown." >&2
  exit 1
fi
if docker volume ls -q --filter "label=com.docker.compose.project=$project" | grep -q .; then
  echo "Flowcordia lifecycle volumes remain after teardown." >&2
  exit 1
fi
record_phase teardown
completed_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"

observations="$work_dir/observations.json"
node - "$phase_file" "$observations" "$workspace_id" "$started_at" "$completed_at" <<'NODE'
const fs = require("node:fs");
const [phasePath, output, workspaceId, startedAt, completedAt] = process.argv.slice(2);
const phases = fs.readFileSync(phasePath, "utf8").trim().split(/\n/).filter(Boolean).map((line) => {
  const [key, observedAt] = line.split("\t");
  return { key, state: "READY", observedAt };
});
const value = {
  schemaVersion: "0.1",
  kind: "flowcordia-self-host-lifecycle-observations",
  workspaceId,
  startedAt,
  completedAt,
  phases,
  teardown: {
    applicationContainersAbsent: true,
    applicationNetworkAbsent: true,
    applicationVolumesAbsent: true,
  },
};
fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
NODE

pnpm --dir "$target_checkout" flowcordia:self-host:lifecycle:evidence -- \
  --current-manifest "$current_manifest" \
  --current-image-evidence "$current_image_evidence" \
  --installation-identity-evidence "$installation_identity" \
  --clean-dependencies-evidence "$clean_dependencies" \
  --current-migration-evidence "$current_migration_evidence" \
  --current-install-diagnostics "$current_install_diagnostics" \
  --current-restart-diagnostics "$current_restart_diagnostics" \
  --backup-manifest "$backup_manifest" \
  --restore-evidence "$restore_evidence" \
  --upgrade-evidence "$upgrade_evidence" \
  --target-manifest "$target_manifest" \
  --target-image-evidence "$target_image_evidence" \
  --target-migration-evidence "$target_migration_evidence" \
  --target-diagnostics "$target_diagnostics" \
  "${rollback_argument[@]}" \
  --observations "$observations" \
  --repository "$repository" \
  --run-id "$run_id" \
  --run-attempt "$run_attempt" \
  --source-sha "$source_sha" \
  --output "$output"

rm -rf "$work_dir"
echo "Flowcordia published self-host lifecycle acceptance: READY"
echo "Current release: $current_release_id"
echo "Target release: $target_release_id"
echo "Upgrade kind: $upgrade_kind"
echo "Evidence: $output"
