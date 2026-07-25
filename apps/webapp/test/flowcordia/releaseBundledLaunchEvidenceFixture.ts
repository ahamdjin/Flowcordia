import {
  FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE,
  type FlowcordiaBundledCleanInstallEvidenceSource,
  type FlowcordiaBundledLaunchEvidenceSource,
} from "../../app/features/flowcordia/acceptance/release-bundled-launch-manifest.server";
import { flowcordiaReleaseEvidenceSha256 } from "../../app/features/flowcordia/acceptance/release-manifest.server";
import { FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW } from "../../app/features/flowcordia/operations/bundled-clean-install";
import { applicationCommitSha, releaseId } from "./releaseEvidenceFixture";
import {
  selfHostLaunchEvidenceSources,
  selfHostLifecycleEvidence,
} from "./releaseSelfHostLaunchEvidenceFixture";

export const bundledCleanInstallRunId = "90";
export const bundledCleanInstallRunAttempt = 1;
export const bundledCleanInstallStartedAt = "2026-07-20T14:00:00.000Z";
export const bundledCleanInstallCompletedAt = "2026-07-20T14:30:00.000Z";

function digest(character: string): string {
  return character.repeat(64);
}

export function bundledCleanInstallEvidence() {
  return {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-bundled-clean-install" as const,
    result: "READY" as const,
    phase: "complete" as const,
    cleanup: "READY" as const,
    source: {
      runId: bundledCleanInstallRunId,
      runAttempt: bundledCleanInstallRunAttempt,
      workflowPath: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW,
      sourceCommitSha: applicationCommitSha,
    },
    publicationRunId: "89",
    releaseId,
    applicationCommitSha,
    applicationManifestSha256: digest("6"),
    applicationImageDigest: selfHostLifecycleEvidence().target.imageDigest,
    bundledManifestSha256: digest("7"),
    compatibilityVersion: 1,
    startedAt: bundledCleanInstallStartedAt,
    completedAt: bundledCleanInstallCompletedAt,
  };
}

export function bundledCleanInstallSource(
  evidence = bundledCleanInstallEvidence()
): FlowcordiaBundledCleanInstallEvidenceSource {
  return {
    stage: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_STAGE,
    runId: bundledCleanInstallRunId,
    runAttempt: bundledCleanInstallRunAttempt,
    workflowPath: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW,
    workflowCommitSha: applicationCommitSha,
    artifactName: `flowcordia-bundled-clean-install-${bundledCleanInstallRunId}-${bundledCleanInstallRunAttempt}`,
    artifactArchiveSha256: digest("8"),
    evidenceSha256: flowcordiaReleaseEvidenceSha256(evidence),
    evidence: { ...evidence },
  };
}

export function bundledLaunchEvidenceSources(): FlowcordiaBundledLaunchEvidenceSource[] {
  return [bundledCleanInstallSource(), ...selfHostLaunchEvidenceSources()];
}
