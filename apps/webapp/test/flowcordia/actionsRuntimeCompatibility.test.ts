import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assembleFlowcordiaActionsRuntimeEvidence,
  createFlowcordiaActionsRuntimeStageEvidence,
  FLOWCORDIA_ACTIONS_RUNTIME_CANDIDATES,
  FLOWCORDIA_ACTIONS_RUNTIME_CONFIRMATION,
  FLOWCORDIA_ACTIONS_RUNTIME_PROFILES,
  FLOWCORDIA_ACTIONS_RUNTIME_WORKFLOW,
  flowcordiaActionsRuntimeSha256,
  parseFlowcordiaActionsRuntimeStageEvidence,
  type FlowcordiaActionsRuntimeProfile,
  type FlowcordiaActionsRuntimeStageEvidence,
} from "../../../../scripts/flowcordia-actions-runtime-evidence.mjs";

const applicationCommitSha = "1234567890abcdef1234567890abcdef12345678";
const cacheDigest = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const checkedAt = new Date("2026-07-24T03:00:00.000Z");
const temporaryDirectories: string[] = [];

function repositorySource(path: string): string {
  return fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
}

function syntheticStage(
  profile: FlowcordiaActionsRuntimeProfile
): FlowcordiaActionsRuntimeStageEvidence {
  return createFlowcordiaActionsRuntimeStageEvidence({
    profileName: profile,
    applicationCommitSha,
    runId: "987654321",
    runAttempt: "1",
    configured: !profile.startsWith("configured-"),
    runnerOs: profile === "hosted-windows" ? "Windows" : "Linux",
    runnerArch: "X64",
    runnerName: `${profile}-runner`,
    nodeVersion: "v20.20.2",
    pnpmVersion: "10.33.2",
    gitVersion: "git version 2.50.1",
    cacheKey: `runtime-${profile}-987654321-1`,
    cacheDigest,
    checkedAt,
  });
}

async function evidenceRoot(
  overrides: Partial<
    Record<FlowcordiaActionsRuntimeProfile, FlowcordiaActionsRuntimeStageEvidence>
  > = {}
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "flowcordia-actions-runtime-"));
  temporaryDirectories.push(root);
  for (const profile of FLOWCORDIA_ACTIONS_RUNTIME_PROFILES) {
    const directory = join(root, `flowcordia-actions-runtime-${profile}-987654321`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, `${profile}.json`),
      `${JSON.stringify(overrides[profile] ?? syntheticStage(profile))}\n`,
      { mode: 0o600 }
    );
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("Flowcordia GitHub Actions runtime compatibility", () => {
  it("creates bounded stage evidence without runner names or cache keys", () => {
    const evidence = syntheticStage("hosted-linux");
    const serialized = JSON.stringify(evidence);

    expect(evidence.state).toBe("READY");
    expect(evidence.candidates).toEqual(FLOWCORDIA_ACTIONS_RUNTIME_CANDIDATES);
    expect(evidence.runner.nameSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.cache.keySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(serialized).not.toContain("hosted-linux-runner");
    expect(serialized).not.toContain("runtime-hosted-linux-987654321-1");
    expect(parseFlowcordiaActionsRuntimeStageEvidence(evidence)).toEqual(evidence);
  });

  it("rejects modified stage evidence", () => {
    const evidence = syntheticStage("hosted-windows");
    evidence.toolchain.node = "v99.0.0";

    expect(() => parseFlowcordiaActionsRuntimeStageEvidence(evidence)).toThrow(
      "Runtime stage evidence digest is invalid"
    );
  });

  it("assembles exactly six runner profiles from one workflow run", async () => {
    const root = await evidenceRoot();
    const evidence = await assembleFlowcordiaActionsRuntimeEvidence({
      applicationCommitSha,
      evidenceRoot: root,
      checkedAt: new Date("2026-07-24T03:05:00.000Z"),
    });

    expect(evidence.state).toBe("READY");
    expect(evidence.profiles.map((profile) => profile.profile)).toEqual(
      FLOWCORDIA_ACTIONS_RUNTIME_PROFILES
    );
    expect(evidence.profiles).toHaveLength(6);
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects mixed workflow-run identity", async () => {
    const mixed = syntheticStage("configured-medium");
    mixed.source.runId = "987654322";
    const { evidenceSha256: _digest, ...withoutDigest } = mixed;
    mixed.evidenceSha256 = flowcordiaActionsRuntimeSha256(withoutDigest);
    const root = await evidenceRoot({ "configured-medium": mixed });

    await expect(
      assembleFlowcordiaActionsRuntimeEvidence({
        applicationCommitSha,
        evidenceRoot: root,
      })
    ).rejects.toThrow("one workflow run and attempt");
  });

  it("uses owner-only no-overwrite evidence output", async () => {
    const root = await mkdtemp(join(tmpdir(), "flowcordia-actions-runtime-cli-"));
    temporaryDirectories.push(root);
    const output = join(root, "stage.json");
    const script = repositorySource("scripts/flowcordia-actions-runtime-evidence.mjs");
    const args = [
      script,
      "stage",
      "--profile",
      "hosted-linux",
      "--application-sha",
      applicationCommitSha,
      "--run-id",
      "987654321",
      "--run-attempt",
      "1",
      "--configured",
      "true",
      "--runner-os",
      "Linux",
      "--runner-arch",
      "X64",
      "--runner-name",
      "hosted-runner",
      "--node-version",
      "v20.20.2",
      "--pnpm-version",
      "10.33.2",
      "--git-version",
      "git version 2.50.1",
      "--cache-key",
      "runtime-hosted-linux-987654321-1",
      "--cache-digest",
      cacheDigest,
      "--checked-at",
      checkedAt.toISOString(),
      "--output",
      output,
    ];

    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(first.status).toBe(0);
    expect(JSON.parse(await readFile(output, "utf8")).state).toBe("READY");

    const second = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("Refusing to overwrite existing evidence");
  });

  it("owns a main-only protected non-destructive runtime campaign", async () => {
    const workflow = await readFile(repositorySource(FLOWCORDIA_ACTIONS_RUNTIME_WORKFLOW), "utf8");
    const policy = await readFile(
      repositorySource("flowcordia/security/github-actions-upgrade-policy.md"),
      "utf8"
    );
    const runbook = await readFile(
      repositorySource("flowcordia/runbooks/github-actions-runtime-compatibility.md"),
      "utf8"
    );

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain(FLOWCORDIA_ACTIONS_RUNTIME_CONFIRMATION);
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("on:\n  push:");
    expect(workflow).not.toContain("${{ secrets.");
    expect(workflow).not.toContain("git push");
    expect(workflow).not.toContain("docker push");
    expect(workflow).not.toContain("curl ");

    for (const candidate of Object.values(FLOWCORDIA_ACTIONS_RUNTIME_CANDIDATES)) {
      expect(workflow).toContain(candidate.sha);
    }
    for (const profile of FLOWCORDIA_ACTIONS_RUNTIME_PROFILES) {
      expect(workflow).toContain(profile);
    }

    expect(workflow).toContain("actions/cache/save@");
    expect(workflow).toContain("actions/cache/restore@");
    expect(workflow).toContain("fail-on-cache-miss: true");
    expect(workflow).toContain("environment: flowcordia-self-host-lifecycle");
    expect(workflow).toContain("- flowcordia-release");
    expect(workflow).toContain("persist-credentials: false");
    expect(policy).toContain("runtime compatibility campaign");
    expect(runbook).toContain("CHECK_FLOWCORDIA_ACTIONS_RUNTIME_COMPATIBILITY");
  });
});
