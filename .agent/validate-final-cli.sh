#!/usr/bin/env bash
set -euo pipefail

for entry in \
  "3b524f71da9fa24927a7c852fa23713185b442db9cc9ce86e75458927eae567f .agent/operations-cli-final.part0" \
  "da2a70b1fbef3c7d32382ab6fff68ef2b6e75ad361120f87c67d6ce895cf1eef .agent/operations-cli-final.part1" \
  "f51534e75e344b26542bae5a2d61c5a23c1cb606acb181c42dd45d0b8cc6f0f1 .agent/operations-cli-final.part2" \
  "0f51bd6c4661fe340c22436166990ce01691cba848c553e6adc84c47106428ea .agent/operations-cli-final.part3"; do
  echo "$entry" | sha256sum --check
 done

cat .agent/operations-cli-final.part{0,1,2,3} > /tmp/operations-cli-final.patch.gz.b64
echo "7b56e86f3ac9a3f75c23d02de71c7cb6d75ae21fbabfeed53fc19579694991a8 /tmp/operations-cli-final.patch.gz.b64" | sha256sum --check
base64 --decode /tmp/operations-cli-final.patch.gz.b64 | gunzip > /tmp/operations-cli-final.patch
echo "ba949d6652aabdb2be373ac42546eacb3eb5b8f4ce602a071d984a9dac0bc4b6 /tmp/operations-cli-final.patch" | sha256sum --check
git apply --check --verbose /tmp/operations-cli-final.patch
git apply /tmp/operations-cli-final.patch

pnpm install --frozen-lockfile
pnpm run generate
pnpm exec oxfmt \
  apps/webapp/scripts/flowcordia-alert-preflight.ts \
  apps/webapp/scripts/flowcordia-provider-preflight.ts \
  docker/scripts/flowcordia-doctor.mjs \
  scripts/flowcordia-release-image-evidence.ts \
  scripts/flowcordia-self-host-artifact-preflight.ts \
  scripts/flowcordia-self-host-clean-dependencies.ts \
  scripts/flowcordia-self-host-exec.ts \
  scripts/flowcordia-self-host-lifecycle-evidence.ts \
  scripts/flowcordia-self-host-validate.ts \
  scripts/flowcordia-upstream-drift.mjs
NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck 2>&1 | tee /tmp/operations-cli-final-typecheck.log
node --check docker/scripts/flowcordia-doctor.mjs
node --check scripts/flowcordia-upstream-drift.mjs

expect_usage() {
  local label="$1"
  shift
  set +e
  "$@" >/tmp/cli-output.log 2>&1
  local status=$?
  set -e
  if [[ "$status" -ne 2 ]]; then
    cat /tmp/cli-output.log
    echo "Expected $label to exit 2; got $status." >&2
    exit 1
  fi
  grep -F "Usage:" /tmp/cli-output.log >/dev/null
}

expect_not_usage() {
  local label="$1"
  shift
  set +e
  "$@" >/tmp/cli-output.log 2>&1
  local status=$?
  set -e
  if [[ "$status" -eq 2 ]]; then
    cat /tmp/cli-output.log
    echo "Expected $label arguments to pass parsing." >&2
    exit 1
  fi
}

expect_usage alert-unknown pnpm --filter webapp exec tsx scripts/flowcordia-alert-preflight.ts --flowcordia-unknown-option
expect_not_usage alert-valid pnpm --filter webapp exec tsx scripts/flowcordia-alert-preflight.ts \
  --release-id release-test \
  --expected-application-commit 0123456789abcdef0123456789abcdef01234567 \
  --project-ref project-test \
  --channel-ref channel-test \
  --confirm EXECUTE_EXACT_FLOWCORDIA_ALERT_CANARY \
  --max-pending 10 \
  --max-oldest-pending-age-ms 60000 \
  --json

expect_usage provider-unknown pnpm --filter webapp exec tsx scripts/flowcordia-provider-preflight.ts --flowcordia-unknown-option
expect_not_usage provider-valid pnpm --filter webapp exec tsx scripts/flowcordia-provider-preflight.ts \
  --email-recipient readiness@example.com \
  --confirm-email-send EXECUTE_EXACT_FLOWCORDIA_PROVIDER_EMAIL_TEST \
  --allow-global-studio \
  --json

expect_usage doctor-unknown node docker/scripts/flowcordia-doctor.mjs --flowcordia-unknown-option
expect_usage doctor-invalid-profile node docker/scripts/flowcordia-doctor.mjs --profile invalid

expect_usage image-evidence-unknown pnpm exec tsx scripts/flowcordia-release-image-evidence.ts --flowcordia-unknown-option
expect_not_usage image-evidence-valid pnpm exec tsx scripts/flowcordia-release-image-evidence.ts \
  --manifest /tmp/flowcordia-release-manifest.json \
  --repository owner/repository \
  --run-id 123 \
  --run-attempt 1 \
  --attestation-id attestation-test \
  --created-at 2026-07-27T00:00:00.000Z \
  --output /tmp/flowcordia-image-evidence.json

expect_usage artifact-preflight-unknown pnpm exec tsx scripts/flowcordia-self-host-artifact-preflight.ts --flowcordia-unknown-option
expect_not_usage artifact-preflight-valid pnpm exec tsx scripts/flowcordia-self-host-artifact-preflight.ts \
  --manifest /tmp/flowcordia-release-manifest.json \
  --image-evidence /tmp/flowcordia-image-evidence.json \
  --expected-repository owner/repository \
  --expected-run-id 123 \
  --expected-application-sha 0123456789abcdef0123456789abcdef01234567 \
  --json

expect_usage clean-dependencies-unknown pnpm exec tsx scripts/flowcordia-self-host-clean-dependencies.ts --flowcordia-unknown-option
expect_not_usage clean-dependencies-valid pnpm exec tsx scripts/flowcordia-self-host-clean-dependencies.ts \
  --manifest /tmp/flowcordia-release-manifest.json \
  --output /tmp/flowcordia-clean-dependencies.json

expect_usage self-host-exec-unknown pnpm exec tsx scripts/flowcordia-self-host-exec.ts --flowcordia-unknown-option -- node --version
expect_not_usage self-host-exec-valid pnpm exec tsx scripts/flowcordia-self-host-exec.ts \
  --config /tmp/flowcordia.env \
  --secrets /tmp/flowcordia.secrets \
  --cwd /tmp \
  -- node --version

expect_usage lifecycle-evidence-unknown pnpm exec tsx scripts/flowcordia-self-host-lifecycle-evidence.ts --flowcordia-unknown-option
expect_not_usage lifecycle-evidence-valid pnpm exec tsx scripts/flowcordia-self-host-lifecycle-evidence.ts \
  --current-manifest /tmp/current-manifest.json \
  --current-image-evidence /tmp/current-image.json \
  --installation-identity-evidence /tmp/installation.json \
  --clean-dependencies-evidence /tmp/clean.json \
  --current-migration-evidence /tmp/current-migration.json \
  --current-install-diagnostics /tmp/current-install.json \
  --current-restart-diagnostics /tmp/current-restart.json \
  --backup-manifest /tmp/backup.json \
  --restore-evidence /tmp/restore.json \
  --upgrade-evidence /tmp/upgrade.json \
  --target-manifest /tmp/target-manifest.json \
  --target-image-evidence /tmp/target-image.json \
  --target-migration-evidence /tmp/target-migration.json \
  --target-diagnostics /tmp/target-diagnostics.json \
  --observations /tmp/observations.json \
  --repository owner/repository \
  --run-id 123 \
  --run-attempt 1 \
  --source-sha 0123456789abcdef0123456789abcdef01234567 \
  --output /tmp/lifecycle-evidence.json

expect_usage self-host-validate-unknown pnpm exec tsx scripts/flowcordia-self-host-validate.ts --flowcordia-unknown-option
expect_not_usage self-host-validate-valid pnpm exec tsx scripts/flowcordia-self-host-validate.ts \
  --config /tmp/flowcordia.env \
  --secrets /tmp/flowcordia.secrets \
  --manifest /tmp/flowcordia-release-manifest.json

node --input-type=module <<'NODE'
import { parseArguments } from "./scripts/flowcordia-upstream-drift.mjs";
import assert from "node:assert/strict";

assert.deepEqual(
  parseArguments([
    "--base",
    "origin/main",
    "--head",
    "HEAD",
    "--manifest",
    "ownership.json",
    "--json",
    "--fail-on-core",
  ]),
  {
    base: "origin/main",
    head: "HEAD",
    manifest: "ownership.json",
    json: true,
    failOnCore: true,
  }
);
assert.throws(() => parseArguments([]), { message: "--base is required." });
assert.throws(() => parseArguments(["--base"]), { message: "--base requires a value." });
assert.throws(() => parseArguments(["--unknown"]), {
  message: "Unknown argument: --unknown",
});
assert.throws(() => parseArguments(["unexpected"]), {
  message: "Unknown argument: unexpected",
});
NODE
