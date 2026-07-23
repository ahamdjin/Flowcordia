import { describe, expect, it } from "vitest";
import {
  assembleFlowcordiaSelfHostLaunchManifest,
  FLOWCORDIA_SELF_HOST_RELEASE_STAGE,
} from "../../app/features/flowcordia/acceptance/release-self-host-launch-manifest.server";
import {
  flowcordiaSelfHostLifecycleSha256,
  type FlowcordiaSelfHostLifecycleEvidence,
} from "../../app/features/flowcordia/operations/self-host-lifecycle";
import {
  applicationCommitSha,
  assembledAt,
  proposalId,
  releaseId,
  workflowId,
} from "./releaseEvidenceFixture";
import {
  selfHostLaunchEvidenceSources,
  selfHostLifecycleEvidence,
  selfHostLifecycleSource,
} from "./releaseSelfHostLaunchEvidenceFixture";

function withLifecycleMutation(
  mutate: (evidence: Omit<FlowcordiaSelfHostLifecycleEvidence, "evidenceSha256">) => void
) {
  const lifecycle = selfHostLifecycleEvidence();
  const { evidenceSha256: _digest, ...withoutDigest } = structuredClone(lifecycle);
  mutate(withoutDigest);
  return selfHostLifecycleSource({
    ...withoutDigest,
    evidenceSha256: flowcordiaSelfHostLifecycleSha256(withoutDigest),
  });
}

function assemble(sources = selfHostLaunchEvidenceSources()) {
  return assembleFlowcordiaSelfHostLaunchManifest({
    releaseId,
    applicationCommitSha,
    workflowId,
    proposalId,
    assembledAt,
    sources,
  });
}

describe("Flowcordia schema 0.5 self-host launch manifest", () => {
  it("requires one exact published self-host lifecycle before the eight launch sources", () => {
    const manifest = assemble();

    expect(manifest.schemaVersion).toBe("0.5");
    expect(manifest.result).toBe("ACCEPTED");
    expect(manifest.sourceRuns).toHaveLength(9);
    expect(manifest.sourceRuns.map((source) => source.stage)).toEqual([
      "self_host_lifecycle",
      "provider",
      "alert",
      "preview",
      "promotion",
      "production",
      "webhook_production",
      "rollback_proposal",
      "rollback_production",
    ]);
    expect(manifest.selfHost).toMatchObject({
      targetReleaseId: releaseId,
      targetApplicationCommitSha: applicationCommitSha,
      targetVersion: "0.5.0",
      upgradeKind: "application_only",
      pendingMigrationCount: 0,
      rollbackMode: "application_rollback",
      recoveryRequired: false,
    });
    expect(manifest.sourceRuns[0]).toMatchObject({
      stage: FLOWCORDIA_SELF_HOST_RELEASE_STAGE,
      workflowPath: ".github/workflows/flowcordia-self-host-lifecycle.yml",
      workflowCommitSha: applicationCommitSha,
      artifactName: "flowcordia-self-host-lifecycle-100-1",
    });
    expect(manifest.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a lifecycle target that is not the launch release", () => {
    const lifecycle = withLifecycleMutation((evidence) => {
      evidence.target.releaseId = "another-release";
    });
    const sources = selfHostLaunchEvidenceSources();
    sources[0] = lifecycle;

    expect(() => assemble(sources)).toThrow("selfHost.target.releaseId");
  });

  it("rejects provider readiness that starts before lifecycle completion", () => {
    const lifecycle = withLifecycleMutation((evidence) => {
      evidence.checkedAt = "2026-07-20T15:00:00.000Z";
    });
    const sources = selfHostLaunchEvidenceSources();
    sources[0] = lifecycle;

    expect(() => assemble(sources)).toThrow(
      "Provider readiness started before self-host lifecycle acceptance completed"
    );
  });

  it("rejects a lifecycle workflow run reused by another launch stage", () => {
    const lifecycle = withLifecycleMutation((evidence) => {
      evidence.source.runId = "101";
    });
    lifecycle.runId = "101";
    lifecycle.artifactName = "flowcordia-self-host-lifecycle-101-1";
    const sources = selfHostLaunchEvidenceSources();
    sources[0] = lifecycle;

    expect(() => assemble(sources)).toThrow("distinct workflow run");
  });

  it("rejects a lifecycle artifact from another workflow revision", () => {
    const sources = selfHostLaunchEvidenceSources();
    sources[0] = {
      ...selfHostLifecycleSource(),
      workflowCommitSha: "f".repeat(40),
    };

    expect(() => assemble(sources)).toThrow("selfHost.workflowCommitSha");
  });
});
