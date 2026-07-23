import {
  FLOWCORDIA_SELF_HOST_RELEASE_STAGE,
  type FlowcordiaSelfHostLaunchEvidenceSource,
  type FlowcordiaSelfHostReleaseEvidenceSource,
} from "../../app/features/flowcordia/acceptance/release-self-host-launch-manifest.server";
import { flowcordiaReleaseEvidenceSha256 } from "../../app/features/flowcordia/acceptance/release-manifest.server";
import {
  FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES,
  FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW,
  flowcordiaSelfHostLifecycleSha256,
  type FlowcordiaSelfHostLifecycleEvidence,
} from "../../app/features/flowcordia/operations/self-host-lifecycle";
import {
  applicationCommitSha,
  releaseId,
} from "./releaseEvidenceFixture";
import { launchEvidenceSources } from "./releaseLaunchEvidenceFixture";

export const selfHostLifecycleRunId = "100";
export const selfHostLifecycleRunAttempt = 1;
export const selfHostLifecycleStartedAt = "2026-07-20T14:40:00.000Z";
export const selfHostLifecycleCompletedAt = "2026-07-20T14:57:00.000Z";
export const currentSelfHostApplicationCommitSha =
  "0123456789abcdef0123456789abcdef01234567";

function digest(character: string): string {
  return character.repeat(64);
}

export function selfHostLifecycleEvidence(): FlowcordiaSelfHostLifecycleEvidence {
  const phases = FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES.map((key, index) => ({
    key,
    state: "READY" as const,
    observedAt: new Date(Date.parse(selfHostLifecycleStartedAt) + index * 60_000).toISOString(),
  }));
  const withoutDigest: Omit<FlowcordiaSelfHostLifecycleEvidence, "evidenceSha256"> = {
    schemaVersion: "0.1",
    kind: "flowcordia-self-host-lifecycle",
    state: "READY",
    checkedAt: selfHostLifecycleCompletedAt,
    current: {
      releaseId: "flowcordia-0.4.0",
      version: "0.4.0",
      applicationCommitSha: currentSelfHostApplicationCommitSha,
      imageDigest: digest("1"),
      manifestSha256: digest("2"),
      publicationEvidenceSha256: digest("3"),
      migrationEvidenceSha256: digest("4"),
      installDiagnosticsSha256: digest("5"),
      restartDiagnosticsSha256: digest("6"),
    },
    target: {
      releaseId,
      version: "0.5.0",
      applicationCommitSha,
      imageDigest: digest("7"),
      manifestSha256: digest("8"),
      publicationEvidenceSha256: digest("9"),
      migrationEvidenceSha256: digest("a"),
      diagnosticsSha256: digest("b"),
    },
    installation: {
      identityEvidenceSha256: digest("c"),
      installationSha256: digest("d"),
      cleanDependenciesEvidenceSha256: digest("e"),
    },
    recovery: {
      backupManifestSha256: digest("f"),
      restoreEvidenceSha256: digest("1"),
      archiveSha256: digest("2"),
      postgresMajor: 16,
    },
    upgrade: {
      kind: "application_only",
      evidenceSha256: digest("3"),
      currentMigrationCount: 1,
      targetMigrationCount: 1,
      pendingMigrationCount: 0,
    },
    rollback: {
      mode: "application_rollback",
      restoredReleaseId: "flowcordia-0.4.0",
      diagnosticsSha256: digest("4"),
      recoveryRequired: false,
    },
    phases,
    source: {
      repository: "ahamdjin/flowcordia",
      workflowPath: FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW,
      runId: selfHostLifecycleRunId,
      runAttempt: selfHostLifecycleRunAttempt,
      sourceRef: "refs/heads/main",
      sourceCommitSha: applicationCommitSha,
      runner: "self-hosted",
    },
  };
  return {
    ...withoutDigest,
    evidenceSha256: flowcordiaSelfHostLifecycleSha256(withoutDigest),
  };
}

export function selfHostLifecycleSource(
  evidence = selfHostLifecycleEvidence()
): FlowcordiaSelfHostReleaseEvidenceSource {
  return {
    stage: FLOWCORDIA_SELF_HOST_RELEASE_STAGE,
    runId: selfHostLifecycleRunId,
    runAttempt: selfHostLifecycleRunAttempt,
    workflowPath: FLOWCORDIA_SELF_HOST_LIFECYCLE_WORKFLOW,
    workflowCommitSha: applicationCommitSha,
    artifactName: `flowcordia-self-host-lifecycle-${selfHostLifecycleRunId}-${selfHostLifecycleRunAttempt}`,
    artifactArchiveSha256: digest("5"),
    evidenceSha256: flowcordiaReleaseEvidenceSha256(evidence),
    evidence,
  };
}

export function selfHostLaunchEvidenceSources(): FlowcordiaSelfHostLaunchEvidenceSource[] {
  return [selfHostLifecycleSource(), ...launchEvidenceSources()];
}
