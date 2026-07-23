import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia protected published self-host lifecycle", () => {
  it("uses exact successful publication runs and independently verifies provenance", () => {
    const workflow = source(".github/workflows/flowcordia-self-host-lifecycle.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: flowcordia-self-host-lifecycle");
    expect(workflow).toContain("flowcordia-release");
    expect(workflow).toContain("RUN-PUBLISHED-SELF-HOST-LIFECYCLE");
    expect(workflow).toContain("current_publication_run_id");
    expect(workflow).toContain("target_publication_run_id");
    expect(workflow).toContain(
      'path == ".github/workflows/flowcordia-publish-self-host-image.yml"'
    );
    expect(workflow).toContain('[[ "$target_sha" == "$GITHUB_SHA" ]]');
    expect(workflow).toContain("gh run download");
    expect(workflow).toContain("gh attestation verify");
    expect(workflow).toContain("--deny-self-hosted-runners");
    expect(workflow).toContain("--source-digest");
    expect(workflow).toContain("--source-ref refs/heads/main");
    expect(workflow).toContain("permissions: {}");
    expect(workflow).toContain("packages: read");
    expect(workflow).not.toContain("packages: write");
  });

  it("executes clean install, recovery, upgrade, rollback boundary, and teardown", () => {
    const runner = source("scripts/flowcordia-self-host-lifecycle-run.sh");

    expect(runner).toContain('[[ "$(id -u)" == "1000" ]]');
    expect(runner).toContain("flowcordia:self-host:transition-preflight");
    expect(runner).toContain("flowcordia:self-host:clean-dependencies");
    expect(runner).toContain("docker pull");
    expect(runner).toContain("--exit-code-from migrate migrate");
    expect(runner).toContain("--no-deps --force-recreate --wait operations");
    expect(runner).toContain("flowcordia:db:backup");
    expect(runner).toContain("flowcordia:db:restore-rehearsal");
    expect(runner).toContain("flowcordia:upgrade:preflight");
    expect(runner).toContain('if [[ "$upgrade_kind" == "application_only" ]]');
    expect(runner).toContain('elif [[ "$upgrade_kind" == "append_only_migrations" ]]');
    expect(runner).not.toContain("docker.sock");
    expect(runner).not.toContain("set -x");
    expect(runner).toContain("applicationContainersAbsent");
    expect(runner).toContain("applicationVolumesAbsent");
    expect(runner).toContain("docker network inspect");
    expect(runner).toContain("docker volume ls");
    expect(runner).toContain("flowcordia:self-host:lifecycle:evidence");
  });

  it("keeps credentials outside evidence and publishes only the bounded artifact", () => {
    const workflow = source(".github/workflows/flowcordia-self-host-lifecycle.yml");
    const evidence = source("scripts/flowcordia-self-host-lifecycle-evidence.ts");
    const executor = source("scripts/flowcordia-self-host-exec.ts");
    const transition = source("scripts/flowcordia-self-host-transition-preflight.ts");
    const clean = source("scripts/flowcordia-self-host-clean-dependencies.ts");

    expect(workflow).toContain("FLOWCORDIA_LIFECYCLE_CURRENT_SECRETS_FILE");
    expect(workflow).toContain("FLOWCORDIA_LIFECYCLE_TARGET_SECRETS_FILE");
    expect(workflow).toContain("steps.lifecycle.outputs.lifecycle_output");
    expect(workflow).not.toContain("upload-artifact@master");
    expect(evidence).toContain('open(temporary, "wx", 0o600)');
    expect(evidence).toContain("lifecycle evidence already exists");
    expect(executor).toContain("must be stored outside the repository");
    expect(executor).toContain("configuration and secrets overlap");
    expect(executor).not.toContain("console.log(config");
    expect(executor).not.toContain("console.log(secrets");
    expect(transition).toContain("installationSha256");
    expect(transition).not.toContain("console.log(currentEnvironment");
    expect(clean).toContain("to_regclass");
    expect(clean).toContain("goose_db_version");
    expect(clean).not.toContain("console.log(primaryUrl");
  });

  it("runs only on a dedicated protected runner and never publishes from repository CI", () => {
    const workflow = source(".github/workflows/flowcordia-self-host-lifecycle.yml");

    expect(workflow).toContain("self-hosted");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("retention-days: 90");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("docker build");
    expect(workflow).not.toContain("--push");
  });
});
