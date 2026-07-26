import { flowcordiaRecoverySha256 } from "~/features/flowcordia/operations/database-recovery";
import type { FlowcordiaProductionAcceptanceEvidence } from "./production-contract";
import type { FlowcordiaSelfHostLifecycleEvidence } from "~/features/flowcordia/operations/self-host-lifecycle";

export const FLOWCORDIA_BETA_PROMOTION_RECOVERY_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_BETA_PROMOTION_RECOVERY_WORKFLOW =
  ".github/workflows/flowcordia-beta-promotion-recovery.yml" as const;

export interface FlowcordiaBetaRecoverySource {
  stage: "self_host_lifecycle" | "production" | "rollback_production";
  runId: string;
  runAttempt: number;
  workflowPath: string;
  workflowCommitSha: string;
  artifactName: string;
  artifactArchiveSha256: string;
  evidenceSha256: string;
}

export interface FlowcordiaBetaPromotionRecoveryEvidence {
  schemaVersion: typeof FLOWCORDIA_BETA_PROMOTION_RECOVERY_SCHEMA_VERSION;
  kind: "flowcordia-beta-promotion-recovery";
  state: "READY";
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  checkedAt: string;
  lifecycle: {
    currentReleaseId: string;
    targetReleaseId: string;
    targetImageDigest: string;
    backupManifestSha256: string;
    restoreEvidenceSha256: string;
    archiveSha256: string;
    rollbackMode: "application_rollback" | "restore_required";
    recoveryRequired: boolean;
    lifecycleEvidenceSha256: string;
  };
  production: {
    proposalId: string;
    headSha: string;
    mergeCommitSha: string;
    deploymentVersion: string;
    closureDigest: string;
    closureWorkflowCount: number;
    runFriendlyId: string;
    completedAt: string;
  };
  rollbackProduction: {
    proposalId: string;
    headSha: string;
    mergeCommitSha: string;
    deploymentVersion: string;
    closureDigest: string;
    closureWorkflowCount: number;
    runFriendlyId: string;
    completedAt: string;
  };
  chronology: {
    lifecycleCheckedAt: string;
    productionStartedAt: string;
    productionCompletedAt: string;
    rollbackStartedAt: string;
    rollbackCompletedAt: string;
  };
  sources: [
    FlowcordiaBetaRecoverySource,
    FlowcordiaBetaRecoverySource,
    FlowcordiaBetaRecoverySource,
  ];
  evidenceSha256: string;
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DECIMAL_ID = /^[1-9][0-9]{0,19}$/;
const PUBLIC_ID = /^[A-Za-z0-9._:-]{1,255}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;

export class FlowcordiaBetaPromotionRecoveryError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaBetaPromotionRecoveryError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_object", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_time", `${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_time", `${label} is invalid.`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_digest", `${label} is invalid.`);
  }
  return value;
}

function applicationSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA.test(value) || /^([0-9a-f])\1{39}$/.test(value)) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_application", `${label} is invalid.`);
  }
  return value;
}

function publicId(value: unknown, label: string): string {
  if (typeof value !== "string" || !PUBLIC_ID.test(value)) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_identity", `${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_number", `${label} is invalid.`);
  }
  return Number(value);
}

function source(
  value: FlowcordiaBetaRecoverySource,
  stage: FlowcordiaBetaRecoverySource["stage"],
  expectedWorkflow: string,
  expectedApplicationSha: string
): FlowcordiaBetaRecoverySource {
  if (
    value.stage !== stage ||
    !DECIMAL_ID.test(value.runId) ||
    !Number.isSafeInteger(value.runAttempt) ||
    value.runAttempt < 1 ||
    value.workflowPath !== expectedWorkflow ||
    value.workflowCommitSha !== expectedApplicationSha ||
    !value.artifactName ||
    value.artifactName.length > 255 ||
    !SHA256.test(value.artifactArchiveSha256) ||
    !SHA256.test(value.evidenceSha256)
  ) {
    throw new FlowcordiaBetaPromotionRecoveryError(
      "invalid_source",
      `${stage} source identity is invalid.`
    );
  }
  return value;
}

function lifecycle(
  value: unknown,
  releaseId: string,
  applicationCommitSha: string
): FlowcordiaSelfHostLifecycleEvidence {
  const evidence = record(value, "Self-host lifecycle evidence") as unknown as FlowcordiaSelfHostLifecycleEvidence;
  if (
    evidence.schemaVersion !== "0.1" ||
    evidence.kind !== "flowcordia-self-host-lifecycle" ||
    evidence.state !== "READY" ||
    evidence.target.releaseId !== releaseId ||
    evidence.target.applicationCommitSha !== applicationCommitSha ||
    evidence.source.workflowPath !== ".github/workflows/flowcordia-self-host-lifecycle.yml" ||
    evidence.source.sourceRef !== "refs/heads/main" ||
    evidence.source.sourceCommitSha !== applicationCommitSha ||
    (evidence.rollback.mode !== "application_rollback" &&
      evidence.rollback.mode !== "restore_required") ||
    (evidence.rollback.mode === "restore_required" && evidence.rollback.recoveryRequired !== true) ||
    !Array.isArray(evidence.phases)
  ) {
    throw new FlowcordiaBetaPromotionRecoveryError(
      "invalid_lifecycle",
      "Lifecycle evidence does not prove the exact target release and recovery boundary."
    );
  }
  for (const required of ["recovery_rehearsal", "rollback_boundary", "teardown"] as const) {
    if (!evidence.phases.some((phase) => phase.key === required && phase.state === "READY")) {
      throw new FlowcordiaBetaPromotionRecoveryError(
        "incomplete_lifecycle",
        `Lifecycle evidence is missing ${required}.`
      );
    }
  }
  for (const [label, value] of [
    ["backup manifest", evidence.recovery.backupManifestSha256],
    ["restore evidence", evidence.recovery.restoreEvidenceSha256],
    ["backup archive", evidence.recovery.archiveSha256],
    ["lifecycle", evidence.evidenceSha256],
  ] as const) {
    digest(value, label);
  }
  const withoutDigest = { ...evidence } as Omit<FlowcordiaSelfHostLifecycleEvidence, "evidenceSha256"> & {
    evidenceSha256?: string;
  };
  delete withoutDigest.evidenceSha256;
  if (flowcordiaRecoverySha256(withoutDigest) !== evidence.evidenceSha256) {
    throw new FlowcordiaBetaPromotionRecoveryError(
      "invalid_lifecycle_digest",
      "Lifecycle evidence digest is invalid."
    );
  }
  return evidence;
}

function production(
  value: unknown,
  mode: "production" | "rollback_production",
  applicationCommitSha: string,
  workflowId: string
): FlowcordiaProductionAcceptanceEvidence & {
  production: NonNullable<FlowcordiaProductionAcceptanceEvidence["production"]>;
} {
  const evidence = record(value, `${mode} evidence`) as unknown as FlowcordiaProductionAcceptanceEvidence;
  if (
    evidence.schemaVersion !== "0.2" ||
    evidence.mode !== mode ||
    evidence.result !== "PASSED" ||
    evidence.stage !== "complete" ||
    evidence.workflowId !== workflowId ||
    evidence.applicationCommitSha !== applicationCommitSha ||
    !evidence.production ||
    evidence.production.expectedHeadSha !== evidence.production.observedHeadSha ||
    evidence.production.deploymentCommitSha !== evidence.production.mergeCommitSha ||
    evidence.production.closure.state !== "READY" ||
    evidence.production.closure.expectedCount !== evidence.production.closure.installedCount ||
    evidence.production.run.status !== "COMPLETED_SUCCESSFULLY" ||
    evidence.production.run.proof !== "VERIFIED"
  ) {
    throw new FlowcordiaBetaPromotionRecoveryError(
      "invalid_production",
      `${mode} evidence is not a complete exact-closure production proof.`
    );
  }
  applicationSha(evidence.production.expectedHeadSha, `${mode} head`);
  applicationSha(evidence.production.mergeCommitSha, `${mode} merge`);
  digest(evidence.production.closure.digest, `${mode} closure`);
  positiveInteger(evidence.production.closure.expectedCount, `${mode} closure count`);
  publicId(evidence.proposalId, `${mode} proposal`);
  publicId(evidence.production.deploymentVersion, `${mode} deployment`);
  publicId(evidence.production.run.friendlyId, `${mode} run`);
  timestamp(evidence.startedAt, `${mode} start`);
  timestamp(evidence.completedAt, `${mode} completion`);
  if (Date.parse(evidence.completedAt) < Date.parse(evidence.startedAt)) {
    throw new FlowcordiaBetaPromotionRecoveryError(
      "invalid_chronology",
      `${mode} completion precedes its start.`
    );
  }
  return evidence as FlowcordiaProductionAcceptanceEvidence & {
    production: NonNullable<FlowcordiaProductionAcceptanceEvidence["production"]>;
  };
}

export function createFlowcordiaBetaPromotionRecoveryEvidence(input: {
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  lifecycleEvidence: unknown;
  productionEvidence: unknown;
  rollbackProductionEvidence: unknown;
  sources: FlowcordiaBetaPromotionRecoveryEvidence["sources"];
  checkedAt: Date;
}): FlowcordiaBetaPromotionRecoveryEvidence {
  if (!RELEASE_ID.test(input.releaseId)) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_release", "Release ID is invalid.");
  }
  applicationSha(input.applicationCommitSha, "Application commit");
  if (!WORKFLOW_ID.test(input.workflowId)) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_workflow", "Workflow ID is invalid.");
  }
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new FlowcordiaBetaPromotionRecoveryError("invalid_time", "Evidence time is invalid.");
  }

  const lifecycleEvidence = lifecycle(
    input.lifecycleEvidence,
    input.releaseId,
    input.applicationCommitSha
  );
  const productionEvidence = production(
    input.productionEvidence,
    "production",
    input.applicationCommitSha,
    input.workflowId
  );
  const rollbackEvidence = production(
    input.rollbackProductionEvidence,
    "rollback_production",
    input.applicationCommitSha,
    input.workflowId
  );
  if (
    productionEvidence.proposalId === rollbackEvidence.proposalId ||
    productionEvidence.production.mergeCommitSha === rollbackEvidence.production.mergeCommitSha ||
    productionEvidence.production.deploymentVersion === rollbackEvidence.production.deploymentVersion ||
    productionEvidence.production.run.friendlyId === rollbackEvidence.production.run.friendlyId
  ) {
    throw new FlowcordiaBetaPromotionRecoveryError(
      "reused_rollback_identity",
      "Rollback production must use a distinct proposal, merge, deployment, and run."
    );
  }

  const lifecycleCheckedAt = timestamp(lifecycleEvidence.checkedAt, "Lifecycle completion");
  const productionStartedAt = timestamp(productionEvidence.startedAt, "Production start");
  const productionCompletedAt = timestamp(productionEvidence.completedAt, "Production completion");
  const rollbackStartedAt = timestamp(rollbackEvidence.startedAt, "Rollback start");
  const rollbackCompletedAt = timestamp(rollbackEvidence.completedAt, "Rollback completion");
  const ordered = [
    lifecycleCheckedAt,
    productionStartedAt,
    productionCompletedAt,
    rollbackStartedAt,
    rollbackCompletedAt,
    input.checkedAt.toISOString(),
  ].map(Date.parse);
  if (ordered.slice(1).some((value, index) => value < ordered[index]!)) {
    throw new FlowcordiaBetaPromotionRecoveryError(
      "invalid_chronology",
      "Lifecycle, promotion, rollback, and assembly chronology is invalid."
    );
  }

  const sources = [
    source(
      input.sources[0],
      "self_host_lifecycle",
      ".github/workflows/flowcordia-self-host-lifecycle.yml",
      input.applicationCommitSha
    ),
    source(
      input.sources[1],
      "production",
      ".github/workflows/flowcordia-production-acceptance.yml",
      input.applicationCommitSha
    ),
    source(
      input.sources[2],
      "rollback_production",
      ".github/workflows/flowcordia-production-acceptance.yml",
      input.applicationCommitSha
    ),
  ] as FlowcordiaBetaPromotionRecoveryEvidence["sources"];
  if (new Set(sources.map((entry) => entry.runId)).size !== sources.length) {
    throw new FlowcordiaBetaPromotionRecoveryError(
      "reused_run",
      "Lifecycle, production, and rollback evidence require distinct workflow runs."
    );
  }

  const evidenceWithoutDigest: Omit<FlowcordiaBetaPromotionRecoveryEvidence, "evidenceSha256"> = {
    schemaVersion: FLOWCORDIA_BETA_PROMOTION_RECOVERY_SCHEMA_VERSION,
    kind: "flowcordia-beta-promotion-recovery",
    state: "READY",
    releaseId: input.releaseId,
    applicationCommitSha: input.applicationCommitSha,
    workflowId: input.workflowId,
    checkedAt: input.checkedAt.toISOString(),
    lifecycle: {
      currentReleaseId: lifecycleEvidence.current.releaseId,
      targetReleaseId: lifecycleEvidence.target.releaseId,
      targetImageDigest: lifecycleEvidence.target.imageDigest,
      backupManifestSha256: lifecycleEvidence.recovery.backupManifestSha256,
      restoreEvidenceSha256: lifecycleEvidence.recovery.restoreEvidenceSha256,
      archiveSha256: lifecycleEvidence.recovery.archiveSha256,
      rollbackMode: lifecycleEvidence.rollback.mode,
      recoveryRequired: lifecycleEvidence.rollback.recoveryRequired,
      lifecycleEvidenceSha256: lifecycleEvidence.evidenceSha256,
    },
    production: {
      proposalId: productionEvidence.proposalId,
      headSha: productionEvidence.production.expectedHeadSha,
      mergeCommitSha: productionEvidence.production.mergeCommitSha,
      deploymentVersion: productionEvidence.production.deploymentVersion,
      closureDigest: productionEvidence.production.closure.digest,
      closureWorkflowCount: productionEvidence.production.closure.expectedCount,
      runFriendlyId: productionEvidence.production.run.friendlyId,
      completedAt: productionCompletedAt,
    },
    rollbackProduction: {
      proposalId: rollbackEvidence.proposalId,
      headSha: rollbackEvidence.production.expectedHeadSha,
      mergeCommitSha: rollbackEvidence.production.mergeCommitSha,
      deploymentVersion: rollbackEvidence.production.deploymentVersion,
      closureDigest: rollbackEvidence.production.closure.digest,
      closureWorkflowCount: rollbackEvidence.production.closure.expectedCount,
      runFriendlyId: rollbackEvidence.production.run.friendlyId,
      completedAt: rollbackCompletedAt,
    },
    chronology: {
      lifecycleCheckedAt,
      productionStartedAt,
      productionCompletedAt,
      rollbackStartedAt,
      rollbackCompletedAt,
    },
    sources,
  };
  return {
    ...evidenceWithoutDigest,
    evidenceSha256: flowcordiaRecoverySha256(evidenceWithoutDigest),
  };
}
