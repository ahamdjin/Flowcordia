import {
  assembleFlowcordiaReleaseManifest,
  flowcordiaReleaseEvidenceSha256,
  type FlowcordiaReleaseEvidenceSource,
  type FlowcordiaReleaseManifest,
} from "./release-manifest.server";

export const FLOWCORDIA_WEBHOOK_RELEASE_STAGE = "webhook_production" as const;
export const FLOWCORDIA_WEBHOOK_RELEASE_WORKFLOW =
  ".github/workflows/flowcordia-webhook-production-acceptance.yml" as const;

export interface FlowcordiaWebhookReleaseEvidenceSource {
  stage: typeof FLOWCORDIA_WEBHOOK_RELEASE_STAGE;
  runId: string;
  runAttempt: number;
  workflowPath: string;
  workflowCommitSha: string;
  artifactName: string;
  artifactArchiveSha256: string;
  evidenceSha256: string;
  evidence: Record<string, unknown>;
}

export type FlowcordiaLaunchEvidenceSource =
  | FlowcordiaReleaseEvidenceSource
  | FlowcordiaWebhookReleaseEvidenceSource;

type BaseSourceIdentity = FlowcordiaReleaseManifest["sourceRuns"][number];
export type FlowcordiaLaunchSourceIdentity = Omit<BaseSourceIdentity, "stage"> & {
  stage: BaseSourceIdentity["stage"] | typeof FLOWCORDIA_WEBHOOK_RELEASE_STAGE;
};

export interface FlowcordiaWebhookReleaseSummary {
  originalGeneration: number;
  originalRevision: number;
  firstDeliveryStatus: 200 | 202;
  replayStatus: 200 | 202;
  invalidSignatureStatus: 401;
  revokedPredecessorStatus: 404;
  replacementGeneration: number;
  replacementRevision: number;
  successorDeliveryStatus: 200 | 202;
  predecessorAfterSuccessorStatus: 404;
}

export interface FlowcordiaLaunchManifest
  extends Omit<
    FlowcordiaReleaseManifest,
    "schemaVersion" | "sourceRuns" | "assembledAt" | "manifestSha256"
  > {
  schemaVersion: "0.4";
  webhook: FlowcordiaWebhookReleaseSummary;
  sourceRuns: FlowcordiaLaunchSourceIdentity[];
  assembledAt: string;
  manifestSha256: string;
}

export class FlowcordiaWebhookReleaseEvidenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaWebhookReleaseEvidenceError";
  }
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,14}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const ARTIFACT = /^[A-Za-z0-9._:-]{1,512}$/;
const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|installation|workerId|databaseId|provider|stack|rawError|url|publicId|deliveryId|runId/i;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaWebhookReleaseEvidenceError("invalid_evidence", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactObject(value: unknown, label: string, expectedKeys: readonly string[]) {
  const result = record(value, label);
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify([...expectedKeys].sort())) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "invalid_evidence",
      `${label} contains unexpected or missing fields.`
    );
  }
  return result;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "evidence_mismatch",
      `${label} does not match the exact release lineage.`
    );
  }
}

function boundedString(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new FlowcordiaWebhookReleaseEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new FlowcordiaWebhookReleaseEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return Number(value);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new FlowcordiaWebhookReleaseEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "invalid_evidence",
      `${label} must be a canonical timestamp.`
    );
  }
  return value;
}

function rejectSensitiveKeys(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectSensitiveKeys(child, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new FlowcordiaWebhookReleaseEvidenceError(
        "sensitive_evidence",
        `Webhook release evidence contains forbidden field ${[...path, key].join(".")}.`
      );
    }
    rejectSensitiveKeys(child, [...path, key]);
  }
}

function acceptedStatus(value: unknown, label: string): 200 | 202 {
  if (value !== 200 && value !== 202) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "invalid_evidence",
      `${label} must be a bounded accepted status.`
    );
  }
  return value;
}

function validateWebhookSource(input: {
  source: FlowcordiaWebhookReleaseEvidenceSource;
  releaseId: string;
  workflowId: string;
  applicationCommitSha: string;
}): {
  summary: FlowcordiaWebhookReleaseSummary;
  identity: FlowcordiaLaunchSourceIdentity;
} {
  const source = input.source;
  const runId = boundedString(source.runId, RUN_ID, "webhook.runId");
  const runAttempt = positiveInteger(source.runAttempt, "webhook.runAttempt");
  exact(source.workflowPath, FLOWCORDIA_WEBHOOK_RELEASE_WORKFLOW, "webhook.workflowPath");
  const workflowCommitSha = boundedString(
    source.workflowCommitSha,
    SHA,
    "webhook.workflowCommitSha"
  );
  exact(workflowCommitSha, input.applicationCommitSha, "webhook.workflowCommitSha");
  const expectedArtifact = `flowcordia-webhook-production-${input.workflowId}-${runId}`;
  const artifactName = boundedString(source.artifactName, ARTIFACT, "webhook.artifactName");
  exact(artifactName, expectedArtifact, "webhook.artifactName");
  const artifactArchiveSha256 = boundedString(
    source.artifactArchiveSha256,
    SHA256,
    "webhook.artifactArchiveSha256"
  );
  const evidenceSha256 = boundedString(source.evidenceSha256, SHA256, "webhook.evidenceSha256");
  rejectSensitiveKeys(source.evidence, [FLOWCORDIA_WEBHOOK_RELEASE_STAGE]);

  const evidence = exactObject(source.evidence, "webhook.evidence", [
    "schemaVersion",
    "mode",
    "result",
    "stage",
    "workflowId",
    "applicationCommitSha",
    "startedAt",
    "completedAt",
    "webhook",
  ]);
  exact(evidence.schemaVersion, "0.1", "webhook.evidence.schemaVersion");
  exact(evidence.mode, "webhook_production", "webhook.evidence.mode");
  exact(evidence.result, "PASSED", "webhook.evidence.result");
  exact(evidence.stage, "complete", "webhook.evidence.stage");
  exact(
    boundedString(evidence.workflowId, WORKFLOW_ID, "webhook.evidence.workflowId"),
    input.workflowId,
    "webhook.evidence.workflowId"
  );
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "webhook.applicationCommitSha");
  const startedAt = timestamp(evidence.startedAt, "webhook.startedAt");
  const completedAt = timestamp(evidence.completedAt, "webhook.completedAt");
  if (Date.parse(startedAt) > Date.parse(completedAt)) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "invalid_evidence",
      "Webhook acceptance completed before it started."
    );
  }

  const webhook = exactObject(evidence.webhook, "webhook.webhook", [
    "originalGeneration",
    "originalRevision",
    "firstDeliveryStatus",
    "replayStatus",
    "invalidSignatureStatus",
    "revokedPredecessorStatus",
    "replacementGeneration",
    "replacementRevision",
    "successorDeliveryStatus",
    "predecessorAfterSuccessorStatus",
  ]);
  const originalGeneration = positiveInteger(
    webhook.originalGeneration,
    "webhook.originalGeneration"
  );
  const replacementGeneration = positiveInteger(
    webhook.replacementGeneration,
    "webhook.replacementGeneration"
  );
  if (replacementGeneration !== originalGeneration + 1) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "evidence_mismatch",
      "Webhook replacement must be exactly the next endpoint generation."
    );
  }
  exact(webhook.invalidSignatureStatus, 401, "webhook.invalidSignatureStatus");
  exact(webhook.revokedPredecessorStatus, 404, "webhook.revokedPredecessorStatus");
  exact(
    webhook.predecessorAfterSuccessorStatus,
    404,
    "webhook.predecessorAfterSuccessorStatus"
  );

  return {
    summary: {
      originalGeneration,
      originalRevision: positiveInteger(webhook.originalRevision, "webhook.originalRevision"),
      firstDeliveryStatus: acceptedStatus(
        webhook.firstDeliveryStatus,
        "webhook.firstDeliveryStatus"
      ),
      replayStatus: acceptedStatus(webhook.replayStatus, "webhook.replayStatus"),
      invalidSignatureStatus: 401,
      revokedPredecessorStatus: 404,
      replacementGeneration,
      replacementRevision: positiveInteger(
        webhook.replacementRevision,
        "webhook.replacementRevision"
      ),
      successorDeliveryStatus: acceptedStatus(
        webhook.successorDeliveryStatus,
        "webhook.successorDeliveryStatus"
      ),
      predecessorAfterSuccessorStatus: 404,
    },
    identity: {
      stage: FLOWCORDIA_WEBHOOK_RELEASE_STAGE,
      runId,
      runAttempt,
      workflowPath: source.workflowPath,
      workflowCommitSha,
      artifactName,
      artifactArchiveSha256,
      evidenceSha256,
      startedAt,
      completedAt,
    },
  };
}

export function assembleFlowcordiaLaunchManifest(input: {
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  proposalId: string;
  assembledAt: string;
  sources: readonly FlowcordiaLaunchEvidenceSource[];
}): FlowcordiaLaunchManifest {
  if (input.sources.length !== 8) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "missing_stage",
      "Launch evidence requires exactly eight source artifacts."
    );
  }
  const webhookSources = input.sources.filter(
    (source): source is FlowcordiaWebhookReleaseEvidenceSource =>
      source.stage === FLOWCORDIA_WEBHOOK_RELEASE_STAGE
  );
  if (webhookSources.length !== 1) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "missing_stage",
      "Launch evidence requires exactly one production webhook artifact."
    );
  }
  const baseSources = input.sources.filter(
    (source): source is FlowcordiaReleaseEvidenceSource =>
      source.stage !== FLOWCORDIA_WEBHOOK_RELEASE_STAGE
  );
  const base = assembleFlowcordiaReleaseManifest({
    releaseId: input.releaseId,
    applicationCommitSha: input.applicationCommitSha,
    workflowId: input.workflowId,
    proposalId: input.proposalId,
    assembledAt: input.assembledAt,
    sources: baseSources,
  });
  const webhook = validateWebhookSource({
    source: webhookSources[0]!,
    releaseId: input.releaseId,
    workflowId: input.workflowId,
    applicationCommitSha: input.applicationCommitSha,
  });
  if (new Set(input.sources.map((source) => source.runId)).size !== input.sources.length) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "evidence_mismatch",
      "Every launch evidence stage must come from a distinct workflow run."
    );
  }

  const productionIndex = base.sourceRuns.findIndex((source) => source.stage === "production");
  const rollbackIndex = base.sourceRuns.findIndex((source) => source.stage === "rollback_proposal");
  if (productionIndex < 0 || rollbackIndex !== productionIndex + 1) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "invalid_evidence",
      "Base release evidence has an unexpected production-to-rollback order."
    );
  }
  const productionSource = base.sourceRuns[productionIndex]!;
  const rollbackSource = base.sourceRuns[rollbackIndex]!;
  if (Date.parse(productionSource.completedAt) > Date.parse(webhook.identity.startedAt)) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "evidence_mismatch",
      "Webhook acceptance started before production acceptance completed."
    );
  }
  if (Date.parse(webhook.identity.completedAt) > Date.parse(rollbackSource.startedAt)) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "evidence_mismatch",
      "Rollback started before webhook acceptance completed."
    );
  }
  if (Date.parse(webhook.identity.completedAt) > Date.parse(base.assembledAt)) {
    throw new FlowcordiaWebhookReleaseEvidenceError(
      "invalid_input",
      "Launch manifest assembly precedes webhook acceptance completion."
    );
  }

  const sourceRuns: FlowcordiaLaunchSourceIdentity[] = [
    ...base.sourceRuns.slice(0, rollbackIndex),
    webhook.identity,
    ...base.sourceRuns.slice(rollbackIndex),
  ];
  const { manifestSha256: _baseDigest, schemaVersion: _baseSchema, ...baseWithoutDigest } = base;
  const withoutDigest = {
    ...baseWithoutDigest,
    schemaVersion: "0.4" as const,
    webhook: webhook.summary,
    sourceRuns,
  };
  return {
    ...withoutDigest,
    manifestSha256: flowcordiaReleaseEvidenceSha256(withoutDigest),
  };
}
