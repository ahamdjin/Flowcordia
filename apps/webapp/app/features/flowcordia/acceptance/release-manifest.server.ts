import { createHash } from "node:crypto";

export const FLOWCORDIA_RELEASE_EVIDENCE_STAGES = [
  "preview",
  "promotion",
  "production",
  "rollback_proposal",
  "rollback_production",
] as const;

export type FlowcordiaReleaseEvidenceStage = (typeof FLOWCORDIA_RELEASE_EVIDENCE_STAGES)[number];

export const FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS = {
  preview: ".github/workflows/flowcordia-connected-acceptance.yml",
  promotion: ".github/workflows/flowcordia-promotion-acceptance.yml",
  production: ".github/workflows/flowcordia-production-acceptance.yml",
  rollback_proposal: ".github/workflows/flowcordia-rollback-acceptance.yml",
  rollback_production: ".github/workflows/flowcordia-production-acceptance.yml",
} as const satisfies Record<FlowcordiaReleaseEvidenceStage, string>;

export interface FlowcordiaReleaseEvidenceSource {
  stage: FlowcordiaReleaseEvidenceStage;
  runId: string;
  runAttempt: number;
  workflowPath: string;
  workflowCommitSha: string;
  artifactName: string;
  artifactArchiveSha256: string;
  evidenceSha256: string;
  evidence: Record<string, unknown>;
}

interface ReleaseSourceIdentity {
  stage: FlowcordiaReleaseEvidenceStage;
  runId: string;
  runAttempt: number;
  workflowPath: string;
  workflowCommitSha: string;
  artifactName: string;
  artifactArchiveSha256: string;
  evidenceSha256: string;
  startedAt: string;
  completedAt: string;
}

export interface FlowcordiaReleaseManifest {
  schemaVersion: "0.2";
  releaseId: string;
  result: "ACCEPTED";
  applicationCommitSha: string;
  workflowId: string;
  repository: {
    owner: string;
    name: string;
    branch: string;
    readinessCommitSha: string;
  };
  proposal: {
    id: string;
    headSha: string;
    mergeCommitSha: string;
  };
  capabilities: {
    httpNodes: number;
    mappingNodes: number;
    readyCredentialBindings: number;
  };
  preview: {
    deploymentVersion: string;
    runFriendlyId: string;
  };
  production: {
    deploymentCommitSha: string;
    deploymentVersion: string;
    runFriendlyId: string;
  };
  rollback: {
    currentBaseCommitSha: string;
    currentBaseBlobSha: string;
    target: {
      proposalId: string;
      headSha: string;
      mergeCommitSha: string;
    };
    proposal: {
      id: string;
      headSha: string;
      pullRequestNumber: number;
      mergeCommitSha: string;
    };
    production: {
      deploymentCommitSha: string;
      deploymentVersion: string;
      runFriendlyId: string;
    };
  };
  sourceRuns: ReleaseSourceIdentity[];
  assembledAt: string;
  manifestSha256: string;
}

export class FlowcordiaReleaseEvidenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaReleaseEvidenceError";
  }
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,14}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;
const PUBLIC_NAME = /^[A-Za-z0-9._:/-]{1,512}$/;
const REPOSITORY_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|policyId|installationId|workerId|databaseId|provider|stack|rawError|reason/i;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaReleaseEvidenceError("invalid_evidence", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactObject(value: unknown, label: string, expectedKeys: readonly string[]) {
  const result = record(value, label);
  const actual = Object.keys(result).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new FlowcordiaReleaseEvidenceError(
      "invalid_evidence",
      `${label} must contain exactly ${expected.join(", ")}.`
    );
  }
  return result;
}

function boundedString(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new FlowcordiaReleaseEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  return value;
}

function sha(value: unknown, label: string): string {
  return boundedString(value, label, SHA);
}

function sha256(value: unknown, label: string): string {
  return boundedString(value, label, SHA256);
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) {
    throw new FlowcordiaReleaseEvidenceError(
      "evidence_mismatch",
      `${label} does not match the exact release lineage.`
    );
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new FlowcordiaReleaseEvidenceError(
      "invalid_evidence",
      `${label} must be a positive safe integer.`
    );
  }
  return Number(value);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new FlowcordiaReleaseEvidenceError("invalid_evidence", `${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new FlowcordiaReleaseEvidenceError(
      "invalid_evidence",
      `${label} must be a canonical ISO timestamp.`
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
      throw new FlowcordiaReleaseEvidenceError(
        "sensitive_evidence",
        `Release evidence contains forbidden field ${[...path, key].join(".")}.`
      );
    }
    rejectSensitiveKeys(child, [...path, key]);
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
}

export function flowcordiaReleaseEvidenceSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function flowcordiaReleaseArtifactName(input: {
  stage: FlowcordiaReleaseEvidenceStage;
  workflowId: string;
  proposalId: string;
  runId: string;
}): string {
  switch (input.stage) {
    case "preview":
      return `flowcordia-connected-preview-${input.workflowId}-${input.runId}`;
    case "promotion":
      return `flowcordia-promotion-${input.proposalId}-${input.runId}`;
    case "production":
      return `flowcordia-production-${input.workflowId}-${input.runId}`;
    case "rollback_proposal":
      return `flowcordia-rollback-${input.workflowId}-${input.runId}`;
    case "rollback_production":
      return `flowcordia-rollback_production-${input.workflowId}-${input.runId}`;
  }
}

function sourceByStage(
  sources: readonly FlowcordiaReleaseEvidenceSource[],
  stage: FlowcordiaReleaseEvidenceStage,
  identity: { workflowId: string; proposalId: string }
): FlowcordiaReleaseEvidenceSource {
  const matching = sources.filter((source) => source.stage === stage);
  if (matching.length !== 1) {
    throw new FlowcordiaReleaseEvidenceError(
      "missing_stage",
      `Release evidence requires exactly one ${stage} artifact.`
    );
  }
  const source = matching[0]!;
  const runId = boundedString(source.runId, `${stage}.runId`, RUN_ID);
  positiveInteger(source.runAttempt, `${stage}.runAttempt`);
  exact(source.workflowPath, FLOWCORDIA_RELEASE_SOURCE_WORKFLOWS[stage], `${stage}.workflowPath`);
  sha(source.workflowCommitSha, `${stage}.workflowCommitSha`);
  const expectedArtifactName = flowcordiaReleaseArtifactName({ stage, runId, ...identity });
  boundedString(source.artifactName, `${stage}.artifactName`, PUBLIC_NAME);
  exact(source.artifactName, expectedArtifactName, `${stage}.artifactName`);
  sha256(source.artifactArchiveSha256, `${stage}.artifactArchiveSha256`);
  sha256(source.evidenceSha256, `${stage}.evidenceSha256`);
  rejectSensitiveKeys(source.evidence, [stage]);
  return source;
}

function validateCommonEvidence(input: {
  evidence: Record<string, unknown>;
  label: string;
  mode: string;
  workflowId: string;
  applicationCommitSha: string;
  schemaVersion?: "0.1" | "0.2";
}) {
  exact(input.evidence.schemaVersion, input.schemaVersion ?? "0.1", `${input.label}.schemaVersion`);
  exact(input.evidence.mode, input.mode, `${input.label}.mode`);
  exact(input.evidence.result, "PASSED", `${input.label}.result`);
  exact(input.evidence.stage, "complete", `${input.label}.stage`);
  exact(input.evidence.workflowId, input.workflowId, `${input.label}.workflowId`);
  exact(
    input.evidence.applicationCommitSha,
    input.applicationCommitSha,
    `${input.label}.applicationCommitSha`
  );
  const startedAt = timestamp(input.evidence.startedAt, `${input.label}.startedAt`);
  const completedAt = timestamp(input.evidence.completedAt, `${input.label}.completedAt`);
  if (Date.parse(startedAt) > Date.parse(completedAt)) {
    throw new FlowcordiaReleaseEvidenceError(
      "invalid_evidence",
      `${input.label} completed before it started.`
    );
  }
  return { startedAt, completedAt };
}

function validateReadiness(value: unknown, label: string) {
  const readiness = exactObject(value, label, [
    "state",
    "passed",
    "blocked",
    "unavailable",
    "repository",
  ]);
  exact(readiness.state, "READY", `${label}.state`);
  positiveInteger(readiness.passed, `${label}.passed`);
  exact(readiness.blocked, 0, `${label}.blocked`);
  exact(readiness.unavailable, 0, `${label}.unavailable`);
  const repository = exactObject(readiness.repository, `${label}.repository`, [
    "owner",
    "name",
    "branch",
    "commitSha",
  ]);
  return {
    owner: boundedString(repository.owner, `${label}.repository.owner`, REPOSITORY_NAME),
    name: boundedString(repository.name, `${label}.repository.name`, REPOSITORY_NAME),
    branch: boundedString(repository.branch, `${label}.repository.branch`, PUBLIC_NAME),
    commitSha: sha(repository.commitSha, `${label}.repository.commitSha`),
  };
}

function validateVerifiedRun(value: unknown, label: string) {
  const run = exactObject(value, label, ["friendlyId", "status", "proof"]);
  exact(run.status, "COMPLETED_SUCCESSFULLY", `${label}.status`);
  exact(run.proof, "VERIFIED", `${label}.proof`);
  return {
    friendlyId: boundedString(run.friendlyId, `${label}.friendlyId`, PUBLIC_NAME),
  };
}

function sourceIdentity(
  source: FlowcordiaReleaseEvidenceSource,
  timing: { startedAt: string; completedAt: string }
): ReleaseSourceIdentity {
  return {
    stage: source.stage,
    runId: source.runId,
    runAttempt: source.runAttempt,
    workflowPath: source.workflowPath,
    workflowCommitSha: source.workflowCommitSha,
    artifactName: source.artifactName,
    artifactArchiveSha256: source.artifactArchiveSha256,
    evidenceSha256: source.evidenceSha256,
    ...timing,
  };
}

function requireChronologicalJourney(
  sources: ReadonlyArray<{ stage: string; startedAt: string; completedAt: string }>,
  assembledAt: string
) {
  for (let index = 1; index < sources.length; index += 1) {
    const previous = sources[index - 1]!;
    const current = sources[index]!;
    if (Date.parse(previous.completedAt) > Date.parse(current.startedAt)) {
      throw new FlowcordiaReleaseEvidenceError(
        "evidence_mismatch",
        `${current.stage} started before ${previous.stage} completed.`
      );
    }
  }
  if (Date.parse(sources.at(-1)!.completedAt) > Date.parse(assembledAt)) {
    throw new FlowcordiaReleaseEvidenceError(
      "invalid_input",
      "assembledAt precedes the completed release journey."
    );
  }
}

export function assembleFlowcordiaReleaseManifest(input: {
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  proposalId: string;
  assembledAt: string;
  sources: readonly FlowcordiaReleaseEvidenceSource[];
}): FlowcordiaReleaseManifest {
  const releaseId = boundedString(input.releaseId, "releaseId", RELEASE_ID);
  const applicationCommitSha = sha(input.applicationCommitSha, "applicationCommitSha");
  const workflowId = boundedString(input.workflowId, "workflowId", WORKFLOW_ID);
  const proposalId = boundedString(input.proposalId, "proposalId", PUBLIC_ID);
  const assembledAt = timestamp(input.assembledAt, "assembledAt");

  if (input.sources.length !== FLOWCORDIA_RELEASE_EVIDENCE_STAGES.length) {
    throw new FlowcordiaReleaseEvidenceError(
      "missing_stage",
      "Release evidence requires exactly five source artifacts."
    );
  }

  const sourceRuns = new Map<FlowcordiaReleaseEvidenceStage, FlowcordiaReleaseEvidenceSource>();
  for (const stage of FLOWCORDIA_RELEASE_EVIDENCE_STAGES) {
    sourceRuns.set(
      stage,
      sourceByStage(input.sources, stage, {
        workflowId,
        proposalId,
      })
    );
  }
  if (new Set(input.sources.map((source) => source.runId)).size !== input.sources.length) {
    throw new FlowcordiaReleaseEvidenceError(
      "evidence_mismatch",
      "Every release evidence stage must come from a distinct workflow run."
    );
  }

  const previewSource = sourceRuns.get("preview")!;
  const previewEvidence = exactObject(previewSource.evidence, "preview", [
    "schemaVersion",
    "mode",
    "result",
    "stage",
    "workflowId",
    "applicationCommitSha",
    "startedAt",
    "completedAt",
    "readiness",
    "capabilities",
    "preview",
  ]);
  const previewTiming = validateCommonEvidence({
    evidence: previewEvidence,
    label: "preview",
    mode: "preview",
    workflowId,
    applicationCommitSha,
    schemaVersion: "0.2",
  });
  const repository = validateReadiness(previewEvidence.readiness, "preview.readiness");
  const capabilityProof = exactObject(previewEvidence.capabilities, "preview.capabilities", [
    "httpNodes",
    "mappingNodes",
    "readyCredentialBindings",
  ]);
  const capabilities = {
    httpNodes: positiveInteger(capabilityProof.httpNodes, "preview.capabilities.httpNodes"),
    mappingNodes: positiveInteger(
      capabilityProof.mappingNodes,
      "preview.capabilities.mappingNodes"
    ),
    readyCredentialBindings: positiveInteger(
      capabilityProof.readyCredentialBindings,
      "preview.capabilities.readyCredentialBindings"
    ),
  };
  const previewProof = exactObject(previewEvidence.preview, "preview.preview", [
    "state",
    "expectedHeadSha",
    "observedHeadSha",
    "deploymentVersion",
    "run",
  ]);
  exact(previewProof.state, "READY", "preview.preview.state");
  const proposalHeadSha = sha(previewProof.observedHeadSha, "preview.preview.observedHeadSha");
  exact(previewProof.expectedHeadSha, proposalHeadSha, "preview.preview.expectedHeadSha");
  const previewDeploymentVersion = boundedString(
    previewProof.deploymentVersion,
    "preview.preview.deploymentVersion",
    PUBLIC_NAME
  );
  const previewRun = validateVerifiedRun(previewProof.run, "preview.preview.run");

  const promotionSource = sourceRuns.get("promotion")!;
  const promotionEvidence = exactObject(promotionSource.evidence, "promotion", [
    "schemaVersion",
    "mode",
    "result",
    "stage",
    "workflowId",
    "proposalId",
    "applicationCommitSha",
    "startedAt",
    "completedAt",
    "readiness",
    "governance",
    "promotion",
  ]);
  const promotionTiming = validateCommonEvidence({
    evidence: promotionEvidence,
    label: "promotion",
    mode: "promotion",
    workflowId,
    applicationCommitSha,
  });
  exact(promotionEvidence.proposalId, proposalId, "promotion.proposalId");
  const promotionRepository = validateReadiness(promotionEvidence.readiness, "promotion.readiness");
  for (const key of ["owner", "name", "branch", "commitSha"] as const) {
    exact(promotionRepository[key], repository[key], `promotion.readiness.repository.${key}`);
  }
  const governance = exactObject(promotionEvidence.governance, "promotion.governance", [
    "state",
    "evaluatedHeadSha",
  ]);
  exact(governance.state, "SATISFIED", "promotion.governance.state");
  exact(governance.evaluatedHeadSha, proposalHeadSha, "promotion.governance.evaluatedHeadSha");
  const promotionProof = exactObject(promotionEvidence.promotion, "promotion.promotion", [
    "expectedHeadSha",
    "mergeMethod",
    "mergeCommitSha",
  ]);
  exact(promotionProof.expectedHeadSha, proposalHeadSha, "promotion.promotion.expectedHeadSha");
  if (!["squash", "merge", "rebase"].includes(String(promotionProof.mergeMethod))) {
    throw new FlowcordiaReleaseEvidenceError(
      "invalid_evidence",
      "promotion.promotion.mergeMethod is invalid."
    );
  }
  const mergeCommitSha = sha(promotionProof.mergeCommitSha, "promotion.promotion.mergeCommitSha");

  const productionSource = sourceRuns.get("production")!;
  const productionEvidence = exactObject(productionSource.evidence, "production", [
    "schemaVersion",
    "mode",
    "result",
    "stage",
    "workflowId",
    "proposalId",
    "applicationCommitSha",
    "startedAt",
    "completedAt",
    "production",
  ]);
  const productionTiming = validateCommonEvidence({
    evidence: productionEvidence,
    label: "production",
    mode: "production",
    workflowId,
    applicationCommitSha,
  });
  exact(productionEvidence.proposalId, proposalId, "production.proposalId");
  const productionProof = exactObject(productionEvidence.production, "production.production", [
    "expectedHeadSha",
    "observedHeadSha",
    "mergeCommitSha",
    "deploymentCommitSha",
    "deploymentVersion",
    "run",
  ]);
  exact(productionProof.expectedHeadSha, proposalHeadSha, "production.production.expectedHeadSha");
  exact(productionProof.observedHeadSha, proposalHeadSha, "production.production.observedHeadSha");
  exact(productionProof.mergeCommitSha, mergeCommitSha, "production.production.mergeCommitSha");
  exact(
    productionProof.deploymentCommitSha,
    mergeCommitSha,
    "production.production.deploymentCommitSha"
  );
  const productionDeploymentVersion = boundedString(
    productionProof.deploymentVersion,
    "production.production.deploymentVersion",
    PUBLIC_NAME
  );
  const productionRun = validateVerifiedRun(productionProof.run, "production.production.run");

  const rollbackProposalSource = sourceRuns.get("rollback_proposal")!;
  const rollbackProposalEvidence = exactObject(
    rollbackProposalSource.evidence,
    "rollback_proposal",
    [
      "schemaVersion",
      "mode",
      "result",
      "stage",
      "workflowId",
      "applicationCommitSha",
      "startedAt",
      "completedAt",
      "rollback",
    ]
  );
  const rollbackProposalTiming = validateCommonEvidence({
    evidence: rollbackProposalEvidence,
    label: "rollback_proposal",
    mode: "rollback_proposal",
    workflowId,
    applicationCommitSha,
  });
  const rollbackProposalProof = exactObject(
    rollbackProposalEvidence.rollback,
    "rollback_proposal.rollback",
    [
      "currentProposalId",
      "currentHeadSha",
      "currentMergeCommitSha",
      "baseCommitSha",
      "baseBlobSha",
      "targetProposalId",
      "targetHeadSha",
      "targetMergeCommitSha",
      "rollbackProposalId",
      "rollbackProposalHeadSha",
      "pullRequestNumber",
    ]
  );
  exact(rollbackProposalProof.currentProposalId, proposalId, "rollback.currentProposalId");
  exact(rollbackProposalProof.currentHeadSha, proposalHeadSha, "rollback.currentHeadSha");
  exact(
    rollbackProposalProof.currentMergeCommitSha,
    mergeCommitSha,
    "rollback.currentMergeCommitSha"
  );
  const currentBaseCommitSha = sha(rollbackProposalProof.baseCommitSha, "rollback.baseCommitSha");
  const currentBaseBlobSha = sha(rollbackProposalProof.baseBlobSha, "rollback.baseBlobSha");
  const targetProposalId = boundedString(
    rollbackProposalProof.targetProposalId,
    "rollback.targetProposalId",
    PUBLIC_ID
  );
  const targetHeadSha = sha(rollbackProposalProof.targetHeadSha, "rollback.targetHeadSha");
  const targetMergeCommitSha = sha(
    rollbackProposalProof.targetMergeCommitSha,
    "rollback.targetMergeCommitSha"
  );
  const rollbackProposalId = boundedString(
    rollbackProposalProof.rollbackProposalId,
    "rollback.rollbackProposalId",
    PUBLIC_ID
  );
  const rollbackProposalHeadSha = sha(
    rollbackProposalProof.rollbackProposalHeadSha,
    "rollback.rollbackProposalHeadSha"
  );
  const rollbackPullRequestNumber = positiveInteger(
    rollbackProposalProof.pullRequestNumber,
    "rollback.pullRequestNumber"
  );
  if (
    new Set([proposalId, targetProposalId, rollbackProposalId]).size !== 3 ||
    targetHeadSha === proposalHeadSha ||
    rollbackProposalHeadSha === proposalHeadSha ||
    rollbackProposalHeadSha === targetHeadSha ||
    targetMergeCommitSha === mergeCommitSha
  ) {
    throw new FlowcordiaReleaseEvidenceError(
      "evidence_mismatch",
      "Rollback current, target, and proposal identities must be distinct."
    );
  }

  const rollbackProductionSource = sourceRuns.get("rollback_production")!;
  const rollbackProductionEvidence = exactObject(
    rollbackProductionSource.evidence,
    "rollback_production",
    [
      "schemaVersion",
      "mode",
      "result",
      "stage",
      "workflowId",
      "proposalId",
      "applicationCommitSha",
      "startedAt",
      "completedAt",
      "production",
    ]
  );
  const rollbackProductionTiming = validateCommonEvidence({
    evidence: rollbackProductionEvidence,
    label: "rollback_production",
    mode: "rollback_production",
    workflowId,
    applicationCommitSha,
  });
  exact(
    rollbackProductionEvidence.proposalId,
    rollbackProposalId,
    "rollback_production.proposalId"
  );
  const rollbackProductionProof = exactObject(
    rollbackProductionEvidence.production,
    "rollback_production.production",
    [
      "expectedHeadSha",
      "observedHeadSha",
      "mergeCommitSha",
      "deploymentCommitSha",
      "deploymentVersion",
      "run",
    ]
  );
  exact(
    rollbackProductionProof.expectedHeadSha,
    rollbackProposalHeadSha,
    "rollback_production.production.expectedHeadSha"
  );
  exact(
    rollbackProductionProof.observedHeadSha,
    rollbackProposalHeadSha,
    "rollback_production.production.observedHeadSha"
  );
  const rollbackMergeCommitSha = sha(
    rollbackProductionProof.mergeCommitSha,
    "rollback_production.production.mergeCommitSha"
  );
  exact(
    rollbackProductionProof.deploymentCommitSha,
    rollbackMergeCommitSha,
    "rollback_production.production.deploymentCommitSha"
  );
  if (
    rollbackMergeCommitSha === mergeCommitSha ||
    rollbackMergeCommitSha === targetMergeCommitSha
  ) {
    throw new FlowcordiaReleaseEvidenceError(
      "evidence_mismatch",
      "Rollback deployment must use the newly merged rollback proposal."
    );
  }
  const rollbackDeploymentVersion = boundedString(
    rollbackProductionProof.deploymentVersion,
    "rollback_production.production.deploymentVersion",
    PUBLIC_NAME
  );
  const rollbackRun = validateVerifiedRun(
    rollbackProductionProof.run,
    "rollback_production.production.run"
  );
  if (
    rollbackDeploymentVersion === productionDeploymentVersion ||
    rollbackRun.friendlyId === productionRun.friendlyId
  ) {
    throw new FlowcordiaReleaseEvidenceError(
      "evidence_mismatch",
      "Rollback deployment and execution identities must be new."
    );
  }

  const orderedSources = [
    sourceIdentity(previewSource, previewTiming),
    sourceIdentity(promotionSource, promotionTiming),
    sourceIdentity(productionSource, productionTiming),
    sourceIdentity(rollbackProposalSource, rollbackProposalTiming),
    sourceIdentity(rollbackProductionSource, rollbackProductionTiming),
  ];
  requireChronologicalJourney(orderedSources, assembledAt);

  const withoutDigest = {
    schemaVersion: "0.2" as const,
    releaseId,
    result: "ACCEPTED" as const,
    applicationCommitSha,
    workflowId,
    repository: {
      owner: repository.owner,
      name: repository.name,
      branch: repository.branch,
      readinessCommitSha: repository.commitSha,
    },
    proposal: {
      id: proposalId,
      headSha: proposalHeadSha,
      mergeCommitSha,
    },
    capabilities,
    preview: {
      deploymentVersion: previewDeploymentVersion,
      runFriendlyId: previewRun.friendlyId,
    },
    production: {
      deploymentCommitSha: mergeCommitSha,
      deploymentVersion: productionDeploymentVersion,
      runFriendlyId: productionRun.friendlyId,
    },
    rollback: {
      currentBaseCommitSha,
      currentBaseBlobSha,
      target: {
        proposalId: targetProposalId,
        headSha: targetHeadSha,
        mergeCommitSha: targetMergeCommitSha,
      },
      proposal: {
        id: rollbackProposalId,
        headSha: rollbackProposalHeadSha,
        pullRequestNumber: rollbackPullRequestNumber,
        mergeCommitSha: rollbackMergeCommitSha,
      },
      production: {
        deploymentCommitSha: rollbackMergeCommitSha,
        deploymentVersion: rollbackDeploymentVersion,
        runFriendlyId: rollbackRun.friendlyId,
      },
    },
    sourceRuns: orderedSources,
    assembledAt,
  };

  return {
    ...withoutDigest,
    manifestSha256: flowcordiaReleaseEvidenceSha256(withoutDigest),
  };
}
