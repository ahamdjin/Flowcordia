import {
  FLOWCORDIA_WEBHOOK_RELEASE_STAGE,
  FLOWCORDIA_WEBHOOK_RELEASE_WORKFLOW,
  type FlowcordiaLaunchEvidenceSource,
  type FlowcordiaWebhookReleaseEvidenceSource,
} from "../../app/features/flowcordia/acceptance/release-launch-manifest.server";
import { flowcordiaReleaseEvidenceSha256 } from "../../app/features/flowcordia/acceptance/release-manifest.server";
import {
  applicationCommitSha,
  proposalId,
  releaseEvidenceSources,
  workflowId,
} from "./releaseEvidenceFixture";

export const webhookStartedAt = "2026-07-20T15:05:10.000Z";
export const webhookCompletedAt = "2026-07-20T15:05:50.000Z";

export function webhookReleaseEvidence(): Record<string, unknown> {
  return {
    schemaVersion: "0.1",
    mode: "webhook_production",
    result: "PASSED",
    stage: "complete",
    workflowId,
    applicationCommitSha,
    startedAt: webhookStartedAt,
    completedAt: webhookCompletedAt,
    webhook: {
      originalGeneration: 1,
      originalRevision: 2,
      firstDeliveryStatus: 202,
      replayStatus: 200,
      invalidSignatureStatus: 401,
      revokedPredecessorStatus: 404,
      replacementGeneration: 2,
      replacementRevision: 1,
      successorDeliveryStatus: 202,
      predecessorAfterSuccessorStatus: 404,
    },
  };
}

export function webhookReleaseSource(
  evidence = webhookReleaseEvidence()
): FlowcordiaWebhookReleaseEvidenceSource {
  const runId = "108";
  return {
    stage: FLOWCORDIA_WEBHOOK_RELEASE_STAGE,
    runId,
    runAttempt: 1,
    workflowPath: FLOWCORDIA_WEBHOOK_RELEASE_WORKFLOW,
    workflowCommitSha: applicationCommitSha,
    artifactName: `flowcordia-webhook-production-${workflowId}-${runId}`,
    artifactArchiveSha256: "a".repeat(64),
    evidenceSha256: flowcordiaReleaseEvidenceSha256(evidence),
    evidence,
  };
}

export function launchEvidenceSources(): FlowcordiaLaunchEvidenceSource[] {
  return [...releaseEvidenceSources(), webhookReleaseSource()];
}

export const launchIdentity = { applicationCommitSha, proposalId, workflowId };
