import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE,
  assembleFlowcordiaBundledLaunchManifest,
  type FlowcordiaBundledCleanInstallEvidenceSource,
} from "../../app/features/flowcordia/acceptance/release-bundled-launch-manifest.server";
import { flowcordiaReleaseEvidenceSha256 } from "../../app/features/flowcordia/acceptance/release-manifest.server";
import { FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW } from "../../app/features/flowcordia/operations/bundled-clean-install";
import { applicationCommitSha, proposalId, releaseId, workflowId } from "./releaseEvidenceFixture";
import {
  selfHostLaunchEvidenceSources,
  selfHostLifecycleStartedAt,
  selfHostLifecycleEvidence,
} from "./releaseSelfHostLaunchEvidenceFixture";

const bundledRunId = "90";
const bundledRunAttempt = 1;

function digest(character: string): string {
  return character.repeat(64);
}

function bundledSource(
  overrides: Partial<FlowcordiaBundledCleanInstallEvidenceSource> = {}
): FlowcordiaBundledCleanInstallEvidenceSource {
  const lifecycle = selfHostLifecycleEvidence();
  const evidence = {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-bundled-clean-install" as const,
    result: "READY" as const,
    phase: "complete" as const,
    cleanup: "READY" as const,
    source: {
      runId: bundledRunId,
      runAttempt: bundledRunAttempt,
      workflowPath: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW,
      sourceCommitSha: applicationCommitSha,
    },
    publicationRunId: "89",
    releaseId,
    applicationCommitSha,
    applicationManifestSha256: digest("6"),
    applicationImageDigest: lifecycle.target.imageDigest,
    bundledManifestSha256: digest("7"),
    compatibilityVersion: 1,
    startedAt: "2026-07-20T14:00:00.000Z",
    completedAt: "2026-07-20T14:30:00.000Z",
  };
  return {
    stage: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE,
    runId: bundledRunId,
    runAttempt: bundledRunAttempt,
    workflowPath: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW,
    workflowCommitSha: applicationCommitSha,
    artifactName: `flowcordia-bundled-clean-install-${bundledRunId}-${bundledRunAttempt}`,
    artifactArchiveSha256: digest("8"),
    evidenceSha256: flowcordiaReleaseEvidenceSha256(evidence),
    evidence,
    ...overrides,
  };
}

describe("Flowcordia bundled launch manifest", () => {
  it("wraps the proven nine-source dossier with exact bundle identity", () => {
    const manifest = assembleFlowcordiaBundledLaunchManifest({
      releaseId,
      applicationCommitSha,
      workflowId,
      proposalId,
      assembledAt: "2026-07-20T18:00:00.000Z",
      sources: [bundledSource(), ...selfHostLaunchEvidenceSources()],
    });

    expect(manifest.schemaVersion).toBe("0.6");
    expect(manifest.sourceRuns).toHaveLength(10);
    expect(manifest.sourceRuns[0]?.stage).toBe("bundled_clean_install");
    expect(manifest.bundledSelfHost).toMatchObject({
      publicationRunId: "89",
      compatibilityVersion: 1,
      applicationImageDigest: selfHostLifecycleEvidence().target.imageDigest,
      bundledManifestSha256: digest("7"),
    });
    expect(manifest.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects duplicate runs, wrong images, and lifecycle before clean install", () => {
    expect(() =>
      assembleFlowcordiaBundledLaunchManifest({
        releaseId,
        applicationCommitSha,
        workflowId,
        proposalId,
        assembledAt: "2026-07-20T18:00:00.000Z",
        sources: [
          bundledSource({ runId: "100" }),
          ...selfHostLaunchEvidenceSources(),
        ],
      })
    ).toThrow();

    expect(() =>
      assembleFlowcordiaBundledLaunchManifest({
        releaseId,
        applicationCommitSha,
        workflowId,
        proposalId,
        assembledAt: "2026-07-20T18:00:00.000Z",
        sources: [
          bundledSource({
            evidence: {
              ...bundledSource().evidence,
              applicationImageDigest: digest("9"),
            },
          }),
          ...selfHostLaunchEvidenceSources(),
        ],
      })
    ).toThrow("applicationImageDigest");

    expect(() =>
      assembleFlowcordiaBundledLaunchManifest({
        releaseId,
        applicationCommitSha,
        workflowId,
        proposalId,
        assembledAt: "2026-07-20T18:00:00.000Z",
        sources: [
          bundledSource({
            evidence: {
              ...bundledSource().evidence,
              completedAt: new Date(Date.parse(selfHostLifecycleStartedAt) + 1_000).toISOString(),
            },
          }),
          ...selfHostLaunchEvidenceSources(),
        ],
      })
    ).toThrow("before bundled clean installation completed");
  });
});
