import {
  assembleFlowcordiaReleaseManifest,
  FLOWCORDIA_RELEASE_EVIDENCE_STAGES,
  FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS,
  flowcordiaReleaseArtifactName,
  flowcordiaReleaseEvidenceSha256,
  type FlowcordiaReleaseEvidenceSource,
  type FlowcordiaReleaseEvidenceStage,
} from "../../app/features/flowcordia/acceptance/release-manifest.server";

export const applicationCommitSha = "1234567890abcdef1234567890abcdef12345678";
export const proposalHeadSha = "a".repeat(40);
export const mergeCommitSha = "b".repeat(40);
export const targetHeadSha = "c".repeat(40);
export const targetMergeCommitSha = "d".repeat(40);
export const baseCommitSha = "e".repeat(40);
export const baseBlobSha = "f".repeat(40);
export const rollbackProposalHeadSha = "2".repeat(40);
export const rollbackMergeCommitSha = "3".repeat(40);
export const workflowCommitSha = "4".repeat(40);
export const workflowId = "reference_workflow";
export const proposalId = "proposal_reference";
export const releaseId = "release-2026-07-20-reference";
export const assembledAt = "2026-07-20T15:10:00.000Z";

const installationChecks = [
  "runtime",
  "database",
  "application",
  "github_app",
  "environment",
  "web_secrets",
  "origins",
  "studio_rollout",
  "worker",
  "worker_delivery",
  "worker_limits",
];
const providerChecks = [
  "application_identity",
  "email_configuration",
  "object_store_configuration",
  "email_confirmation",
  "object_store_access",
  "email_acceptance",
];
const alertChecks = [
  "release_identity",
  "application_identity",
  "worker_configuration",
  "target_selection",
  "backlog_policy",
  "canary_confirmation",
  "worker_redis",
  "channel_selection",
  "production_coverage",
  "failure_coverage",
  "channel_configuration",
  "backlog_health",
  "canary_delivery",
];

function readyChecks(keys: readonly string[]) {
  return keys.map((key) => ({ key, state: "READY", message: `${key} is ready.` }));
}

export function releaseEvidenceByStage(): Record<
  FlowcordiaReleaseEvidenceStage,
  Record<string, unknown>
> {
  const common = {
    schemaVersion: "0.1",
    result: "PASSED",
    stage: "complete",
    workflowId,
    applicationCommitSha,
  };
  const readiness = {
    state: "READY",
    passed: 5,
    blocked: 0,
    unavailable: 0,
    repository: {
      owner: "flowcordia-reference",
      name: "workflow-fixtures",
      branch: "main",
      commitSha: "5".repeat(40),
    },
  };
  return {
    provider: {
      schemaVersion: "0.1",
      state: "READY",
      phase: "provider",
      checkedAt: "2026-07-20T14:58:00.000Z",
      installation: {
        schemaVersion: "0.1",
        profile: "release",
        state: "READY",
        message: "Release installation is ready.",
        checkedAt: "2026-07-20T14:58:00.000Z",
        checks: readyChecks(installationChecks),
      },
      providers: {
        schemaVersion: "0.1",
        state: "READY",
        phase: "complete",
        checkedAt: "2026-07-20T14:58:00.000Z",
        applicationCommitSha,
        emailTransport: "resend",
        objectStoreMode: "static_credentials",
        checks: readyChecks(providerChecks),
        message: "Providers accepted the bounded checks.",
      },
      message: "Provider readiness passed.",
    },
    alert: {
      schemaVersion: "0.1",
      state: "READY",
      phase: "complete",
      releaseId,
      checkedAt: "2026-07-20T14:59:00.000Z",
      applicationCommitSha,
      channelType: "SLACK",
      backlog: { pendingCount: 0, oldestPendingAgeMs: null },
      checks: readyChecks(alertChecks),
      message: "Alert readiness passed.",
    },
    preview: {
      ...common,
      schemaVersion: "0.2",
      mode: "preview",
      startedAt: "2026-07-20T15:00:00.000Z",
      completedAt: "2026-07-20T15:01:00.000Z",
      readiness,
      capabilities: {
        httpNodes: 1,
        mappingNodes: 1,
        readyCredentialBindings: 1,
      },
      preview: {
        state: "READY",
        expectedHeadSha: proposalHeadSha,
        observedHeadSha: proposalHeadSha,
        deploymentVersion: "preview-20260720.1",
        run: {
          friendlyId: "run_preview_123",
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    },
    promotion: {
      ...common,
      mode: "promotion",
      proposalId,
      startedAt: "2026-07-20T15:02:00.000Z",
      completedAt: "2026-07-20T15:03:00.000Z",
      readiness: structuredClone(readiness),
      governance: {
        state: "SATISFIED",
        evaluatedHeadSha: proposalHeadSha,
      },
      promotion: {
        expectedHeadSha: proposalHeadSha,
        mergeMethod: "squash",
        mergeCommitSha,
      },
    },
    production: {
      ...common,
      mode: "production",
      proposalId,
      startedAt: "2026-07-20T15:04:00.000Z",
      completedAt: "2026-07-20T15:05:00.000Z",
      production: {
        expectedHeadSha: proposalHeadSha,
        observedHeadSha: proposalHeadSha,
        mergeCommitSha,
        deploymentCommitSha: mergeCommitSha,
        deploymentVersion: "20260720.1",
        run: {
          friendlyId: "run_prod_123",
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    },
    rollback_proposal: {
      ...common,
      mode: "rollback_proposal",
      startedAt: "2026-07-20T15:06:00.000Z",
      completedAt: "2026-07-20T15:07:00.000Z",
      rollback: {
        currentProposalId: proposalId,
        currentHeadSha: proposalHeadSha,
        currentMergeCommitSha: mergeCommitSha,
        baseCommitSha,
        baseBlobSha,
        targetProposalId: "proposal_previous",
        targetHeadSha,
        targetMergeCommitSha,
        rollbackProposalId: "rollback_reference",
        rollbackProposalHeadSha,
        pullRequestNumber: 87,
      },
    },
    rollback_production: {
      ...common,
      mode: "rollback_production",
      proposalId: "rollback_reference",
      startedAt: "2026-07-20T15:08:00.000Z",
      completedAt: "2026-07-20T15:09:00.000Z",
      production: {
        expectedHeadSha: rollbackProposalHeadSha,
        observedHeadSha: rollbackProposalHeadSha,
        mergeCommitSha: rollbackMergeCommitSha,
        deploymentCommitSha: rollbackMergeCommitSha,
        deploymentVersion: "20260720.2",
        run: {
          friendlyId: "run_rollback_123",
          status: "COMPLETED_SUCCESSFULLY",
          proof: "VERIFIED",
        },
      },
    },
  };
}

export function releaseEvidenceSources(): FlowcordiaReleaseEvidenceSource[] {
  const evidence = releaseEvidenceByStage();
  return FLOWCORDIA_RELEASE_EVIDENCE_STAGES.map((stage, index) => {
    const runId = String(101 + index);
    return {
      stage,
      runId,
      runAttempt: 1,
      workflowPath: FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS[stage],
      workflowCommitSha,
      artifactName: flowcordiaReleaseArtifactName({
        stage,
        releaseId,
        workflowId,
        proposalId,
        runId,
      }),
      artifactArchiveSha256: String(index + 3).repeat(64),
      evidenceSha256: flowcordiaReleaseEvidenceSha256(evidence[stage]),
      evidence: evidence[stage],
    };
  });
}

export function assembleReleaseEvidence(sourceEvidence = releaseEvidenceSources()) {
  return assembleFlowcordiaReleaseManifest({
    releaseId,
    applicationCommitSha,
    workflowId,
    proposalId,
    assembledAt,
    sources: sourceEvidence,
  });
}
