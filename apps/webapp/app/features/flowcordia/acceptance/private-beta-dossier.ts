import { createHash } from "node:crypto";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DECIMAL_ID = /^[1-9][0-9]{0,19}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const PUBLIC_ID = /^[A-Za-z0-9._:/-]{1,512}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const FLOWCORDIA_PRIVATE_BETA_DOSSIER_WORKFLOW =
  ".github/workflows/flowcordia-private-beta-dossier.yml" as const;

export const FLOWCORDIA_PRIVATE_BETA_SOURCE_CONFIG = {
  launch_dossier: {
    workflowPath: ".github/workflows/flowcordia-assemble-release-evidence.yml",
  },
  bundled_execution: {
    workflowPath: ".github/workflows/flowcordia-bundled-execution-acceptance.yml",
  },
  api_reliability: {
    workflowPath: ".github/workflows/flowcordia-api-trigger-reliability-acceptance.yml",
  },
  promotion_recovery: {
    workflowPath: ".github/workflows/flowcordia-beta-promotion-recovery.yml",
  },
  failure_campaign: {
    workflowPath: ".github/workflows/flowcordia-beta-failure-acceptance.yml",
  },
  canvas_manual: {
    workflowPath: ".github/workflows/flowcordia-canvas-manual-acceptance.yml",
  },
} as const;

export type FlowcordiaPrivateBetaSourceStage = keyof typeof FLOWCORDIA_PRIVATE_BETA_SOURCE_CONFIG;

export interface FlowcordiaPrivateBetaSourceInput {
  stage: FlowcordiaPrivateBetaSourceStage;
  runId: string;
  runAttempt: number;
  workflowPath: string;
  workflowCommitSha: string;
  artifactName: string;
  artifactArchiveSha256: string;
  rawEvidenceSha256: string;
  evidence: unknown;
}

export interface FlowcordiaPrivateBetaSourceIdentity {
  stage: FlowcordiaPrivateBetaSourceStage;
  runId: string;
  runAttempt: number;
  workflowPath: string;
  workflowCommitSha: string;
  artifactName: string;
  artifactArchiveSha256: string;
  rawEvidenceSha256: string;
  canonicalEvidenceSha256: string;
  completedAt: string;
}

export interface FlowcordiaPrivateBetaDossier {
  schemaVersion: "0.1";
  kind: "flowcordia-private-beta-dossier";
  state: "READY";
  maturity: "PRIVATE_BETA";
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  repository: string;
  assembledAt: string;
  assembler: {
    workflowPath: typeof FLOWCORDIA_PRIVATE_BETA_DOSSIER_WORKFLOW;
    runId: string;
    runAttempt: number;
    sourceSha: string;
  };
  sources: [
    FlowcordiaPrivateBetaSourceIdentity,
    FlowcordiaPrivateBetaSourceIdentity,
    FlowcordiaPrivateBetaSourceIdentity,
    FlowcordiaPrivateBetaSourceIdentity,
    FlowcordiaPrivateBetaSourceIdentity,
    FlowcordiaPrivateBetaSourceIdentity,
  ];
  proof: {
    connectedReleaseDossier: true;
    cleanBundledSupervisorAndS2Execution: true;
    apiDuplicateExpiryQueueAndFailureRelease: true;
    promotionRollbackBackupAndRestore: true;
    loadQueueWorkerAndProviderRecovery: true;
    browserAccessibilityTouchAndScale: true;
  };
  limitations: {
    publicBeta: false;
    generalAvailability: false;
    highAvailability: false;
    pointInTimeRecovery: false;
    crossRegionDisasterRecovery: false;
    unlimitedGraphScale: false;
    unlimitedThroughput: false;
    publicServiceLevelObjective: false;
  };
  evidenceSha256: string;
}

const forbiddenKey =
  /(authorization|browserStorage|cookie|credential|databaseContents|decrypted|header|password|payload|privatePath|providerResponse|rawError|secret|token)/i;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function text(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function positiveInteger(value: unknown, label: string, maximum = 1000): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return Number(value);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a timestamp.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical timestamp.`);
  }
  return value;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label} does not match the exact Beta lineage.`);
}

function assertNoForbiddenKeys(value: unknown, path = "source evidence"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKey.test(key)) throw new Error(`${path} contains forbidden field ${key}.`);
    assertNoForbiddenKeys(entry, `${path}.${key}`);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sourceArtifactName(input: {
  stage: FlowcordiaPrivateBetaSourceStage;
  releaseId: string;
  workflowId: string;
  runId: string;
  runAttempt: number;
}): string {
  switch (input.stage) {
    case "launch_dossier":
      return `flowcordia-release-manifest-${input.releaseId}-${input.runId}`;
    case "bundled_execution":
      return `flowcordia-bundled-execution-${input.runId}-${input.runAttempt}`;
    case "api_reliability":
      return `flowcordia-api-trigger-reliability-${input.runId}-${input.runAttempt}`;
    case "promotion_recovery":
      return `flowcordia-beta-promotion-recovery-${input.releaseId}-${input.runId}`;
    case "failure_campaign":
      return `flowcordia-beta-failure-${input.runId}-${input.runAttempt}`;
    case "canvas_manual":
      return `flowcordia-canvas-manual-${input.runId}-${input.runAttempt}`;
  }
}

function validateSourceEnvelope(input: {
  source: FlowcordiaPrivateBetaSourceInput;
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
}): {
  source: FlowcordiaPrivateBetaSourceInput;
  evidence: Record<string, unknown>;
  identityBase: Omit<FlowcordiaPrivateBetaSourceIdentity, "canonicalEvidenceSha256" | "completedAt">;
} {
  const source = input.source;
  const config = FLOWCORDIA_PRIVATE_BETA_SOURCE_CONFIG[source.stage];
  if (!config) throw new Error("Private Beta source stage is unsupported.");
  const runId = text(source.runId, DECIMAL_ID, `${source.stage}.runId`);
  const runAttempt = positiveInteger(source.runAttempt, `${source.stage}.runAttempt`);
  exact(source.workflowPath, config.workflowPath, `${source.stage}.workflowPath`);
  exact(source.workflowCommitSha, input.applicationCommitSha, `${source.stage}.workflowCommitSha`);
  const expectedArtifact = sourceArtifactName({
    stage: source.stage,
    releaseId: input.releaseId,
    workflowId: input.workflowId,
    runId,
    runAttempt,
  });
  exact(source.artifactName, expectedArtifact, `${source.stage}.artifactName`);
  const artifactArchiveSha256 = text(
    source.artifactArchiveSha256,
    SHA256,
    `${source.stage}.artifactArchiveSha256`
  );
  const rawEvidenceSha256 = text(source.rawEvidenceSha256, SHA256, `${source.stage}.rawEvidenceSha256`);
  assertNoForbiddenKeys(source.evidence, source.stage);
  const evidence = record(source.evidence, `${source.stage}.evidence`);
  return {
    source,
    evidence,
    identityBase: {
      stage: source.stage,
      runId,
      runAttempt,
      workflowPath: source.workflowPath,
      workflowCommitSha: source.workflowCommitSha,
      artifactName: source.artifactName,
      artifactArchiveSha256,
      rawEvidenceSha256,
    },
  };
}

function validateLaunchDossier(input: {
  source: FlowcordiaPrivateBetaSourceInput;
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
}): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const evidence = validated.evidence;
  exact(evidence.schemaVersion, "0.5", "launch dossier schema");
  exact(evidence.releaseId, input.releaseId, "launch dossier release");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "launch dossier application");
  exact(evidence.workflowId, input.workflowId, "launch dossier workflow");
  const sourceRuns = array(evidence.sourceRuns, "launch dossier source runs");
  if (sourceRuns.length !== 9) throw new Error("Launch dossier must contain nine official source runs.");
  if (new Set(sourceRuns.map((entry) => record(entry, "launch source").runId)).size !== 9) {
    throw new Error("Launch dossier source runs must be distinct.");
  }
  const selfHost = record(evidence.selfHost, "launch dossier self-host summary");
  exact(selfHost.targetReleaseId, input.releaseId, "launch dossier target release");
  exact(
    selfHost.targetApplicationCommitSha,
    input.applicationCommitSha,
    "launch dossier target application"
  );
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256: text(evidence.manifestSha256, SHA256, "launch dossier digest"),
    completedAt: timestamp(evidence.assembledAt, "launch dossier assembly"),
  };
}

function validateBundledExecution(input: {
  source: FlowcordiaPrivateBetaSourceInput;
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
}): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const evidence = validated.evidence;
  exact(evidence.schemaVersion, "0.1", "bundled schema");
  exact(evidence.kind, "flowcordia-bundled-execution", "bundled kind");
  exact(evidence.state, "READY", "bundled state");
  exact(evidence.releaseId, input.releaseId, "bundled release");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "bundled application");
  const workflow = record(evidence.workflow, "bundled workflow");
  exact(workflow.runId, validated.identityBase.runId, "bundled workflow run");
  exact(workflow.runAttempt, validated.identityBase.runAttempt, "bundled workflow attempt");
  exact(workflow.sourceSha, input.applicationCommitSha, "bundled source commit");
  const installation = record(evidence.installation, "bundled installation");
  exact(installation.clean, true, "bundled clean install");
  exact(installation.doctor, "READY", "bundled doctor");
  exact(installation.restart, "READY", "bundled restart");
  const execution = record(evidence.execution, "bundled execution");
  exact(execution.status, "COMPLETED_SUCCESSFULLY", "bundled execution status");
  exact(execution.supervisorWorkloadObserved, true, "bundled supervisor proof");
  exact(execution.s2StateChanged, true, "bundled S2 proof");
  const teardown = record(evidence.teardown, "bundled teardown");
  exact(teardown.containersAbsent, true, "bundled container teardown");
  exact(teardown.networksAbsent, true, "bundled network teardown");
  exact(teardown.volumesAbsent, true, "bundled volume teardown");
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256: text(evidence.evidenceSha256, SHA256, "bundled evidence digest"),
    completedAt: timestamp(evidence.completedAt, "bundled completion"),
  };
}

function validateApiReliability(input: {
  source: FlowcordiaPrivateBetaSourceInput;
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
}): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const evidence = validated.evidence;
  exact(evidence.schemaVersion, "0.1", "API reliability schema");
  exact(evidence.kind, "flowcordia-api-trigger-reliability", "API reliability kind");
  exact(evidence.state, "READY", "API reliability state");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "API reliability application");
  const workflow = record(evidence.workflow, "API reliability workflow");
  exact(workflow.runId, validated.identityBase.runId, "API reliability run");
  exact(workflow.runAttempt, validated.identityBase.runAttempt, "API reliability attempt");
  const duplicate = record(evidence.duplicateSuppression, "duplicate suppression");
  exact(duplicate.originalRunId, duplicate.duplicateRunId, "duplicate suppression identity");
  const expiry = record(evidence.idempotencyExpiry, "idempotency expiry");
  exact(expiry.ttlSeconds, 60, "idempotency TTL");
  if (expiry.originalRunId === expiry.afterExpiryRunId) {
    throw new Error("Idempotency expiry did not produce a new run.");
  }
  const queue = record(evidence.queueExpiry, "queue expiry");
  exact(queue.status, "EXPIRED", "queue expiry status");
  exact(queue.ttlSeconds, 60, "queue expiry TTL");
  const failure = record(evidence.failedRunKeyRelease, "failed-run key release");
  if (failure.firstFailureRunId === failure.secondFailureRunId) {
    throw new Error("Failed-run key release did not produce a distinct retry run.");
  }
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256: text(evidence.evidenceSha256, SHA256, "API reliability digest"),
    completedAt: timestamp(evidence.completedAt, "API reliability completion"),
  };
}

function validatePromotionRecovery(input: {
  source: FlowcordiaPrivateBetaSourceInput;
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
}): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const evidence = validated.evidence;
  exact(evidence.schemaVersion, "0.1", "promotion recovery schema");
  exact(evidence.kind, "flowcordia-beta-promotion-recovery", "promotion recovery kind");
  exact(evidence.state, "READY", "promotion recovery state");
  exact(evidence.releaseId, input.releaseId, "promotion recovery release");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "promotion recovery application");
  exact(evidence.workflowId, input.workflowId, "promotion recovery workflow");
  const sources = array(evidence.sources, "promotion recovery sources");
  if (sources.length !== 3 || new Set(sources.map((entry) => record(entry, "recovery source").runId)).size !== 3) {
    throw new Error("Promotion recovery must contain three distinct official source runs.");
  }
  const production = record(evidence.production, "promoted production");
  const rollback = record(evidence.rollbackProduction, "rollback production");
  if (
    production.proposalId === rollback.proposalId ||
    production.mergeCommitSha === rollback.mergeCommitSha ||
    production.deploymentVersion === rollback.deploymentVersion ||
    production.runFriendlyId === rollback.runFriendlyId
  ) {
    throw new Error("Promotion and rollback-production identities must be distinct.");
  }
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256: text(evidence.evidenceSha256, SHA256, "promotion recovery digest"),
    completedAt: timestamp(evidence.checkedAt, "promotion recovery completion"),
  };
}

function validateFailureCampaign(input: {
  source: FlowcordiaPrivateBetaSourceInput;
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
}): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const evidence = validated.evidence;
  exact(evidence.schemaVersion, "0.1", "failure campaign schema");
  exact(evidence.kind, "flowcordia-beta-failure-campaign", "failure campaign kind");
  exact(evidence.state, "READY", "failure campaign state");
  exact(evidence.releaseId, input.releaseId, "failure campaign release");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "failure campaign application");
  const workflow = record(evidence.workflow, "failure campaign workflow");
  exact(workflow.runId, validated.identityBase.runId, "failure campaign run");
  exact(workflow.runAttempt, validated.identityBase.runAttempt, "failure campaign attempt");
  const load = record(evidence.load, "failure campaign load");
  exact(load.completed, load.submitted, "failure campaign completed load");
  exact(load.failed, 0, "failure campaign failed load");
  const queue = record(evidence.queueSaturation, "failure campaign queue");
  exact(queue.expired, queue.submitted, "failure campaign expired queue count");
  exact(queue.terminalStatus, "EXPIRED", "failure campaign queue terminal state");
  exact(queue.recoveryStatus, "COMPLETED_SUCCESSFULLY", "failure campaign queue recovery");
  const workerLoss = record(evidence.workerLoss, "failure campaign worker loss");
  exact(workerLoss.terminalStatus, "SENT", "failure campaign worker recovery");
  if (Number(workerLoss.reclaimedAttempt) !== Number(workerLoss.lostLeaseAttempt) + 1) {
    throw new Error("Failure campaign did not reclaim the expired delivery lease exactly once.");
  }
  const providerOutage = record(evidence.providerOutage, "failure campaign provider outage");
  exact(providerOutage.firstStatus, "PENDING", "provider outage retry state");
  exact(providerOutage.firstFailureCode, "PROVIDER_REJECTED", "provider outage failure code");
  exact(providerOutage.recoveryStatus, "SENT", "provider outage recovery state");
  exact(providerOutage.stableDeliveryId, true, "provider outage stable delivery identity");
  exact(evidence.postFailureDiagnostics, "READY", "post-failure diagnostics");
  const teardown = record(evidence.teardown, "failure campaign teardown");
  exact(teardown.containersAbsent, true, "failure campaign container teardown");
  exact(teardown.networksAbsent, true, "failure campaign network teardown");
  exact(teardown.volumesAbsent, true, "failure campaign volume teardown");
  const recovery = record(evidence.disasterRecovery, "failure campaign recovery binding");
  text(recovery.backupManifestSha256, SHA256, "failure campaign backup digest");
  text(recovery.restoreEvidenceSha256, SHA256, "failure campaign restore digest");
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256: text(evidence.evidenceSha256, SHA256, "failure campaign digest"),
    completedAt: timestamp(evidence.completedAt, "failure campaign completion"),
  };
}

function validateCanvasManual(input: {
  source: FlowcordiaPrivateBetaSourceInput;
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
}): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const evidence = validated.evidence;
  exact(evidence.schemaVersion, "0.1", "canvas manual schema");
  exact(evidence.kind, "flowcordia-canvas-manual-acceptance", "canvas manual kind");
  exact(evidence.state, "READY", "canvas manual state");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "canvas manual application");
  const source = record(evidence.source, "canvas manual source");
  exact(source.runId, validated.identityBase.runId, "canvas manual run");
  exact(source.runAttempt, validated.identityBase.runAttempt, "canvas manual attempt");
  const sessions = array(evidence.sessions, "canvas manual sessions");
  exact(sessions.length, 3, "canvas manual session count");
  const sessionIds = new Set(sessions.map((entry) => record(entry, "canvas session").id));
  for (const required of [
    "nvda_chrome_windows",
    "nvda_firefox_windows",
    "voiceover_safari_macos",
  ]) {
    if (!sessionIds.has(required)) throw new Error(`Canvas manual evidence is missing ${required}.`);
  }
  const viewports = array(evidence.viewports, "canvas manual viewports");
  exact(viewports.length, 4, "canvas manual viewport count");
  const viewportIds = new Set(viewports.map((entry) => record(entry, "canvas viewport").id));
  for (const required of [
    "desktop_1280x720",
    "tablet_landscape_1024x768",
    "tablet_portrait_768x1024",
    "phone_390x844",
  ]) {
    if (!viewportIds.has(required)) throw new Error(`Canvas manual evidence is missing ${required}.`);
  }
  const measurements = array(evidence.measurements, "canvas manual measurements");
  exact(measurements.length, 2, "canvas manual measurement count");
  const graphs = new Set(measurements.map((entry) => record(entry, "canvas measurement").graph));
  if (!graphs.has("production_70") || !graphs.has("stress_300")) {
    throw new Error("Canvas manual evidence is missing the production or stress graph measurement.");
  }
  const limitations = record(evidence.limitations, "canvas manual limitations");
  exact(limitations.multiTouchPinchAdvertised, false, "canvas pinch claim");
  exact(limitations.unlimitedGraphScaleAdvertised, false, "canvas unlimited-scale claim");
  exact(limitations.virtualizationAdvertised, false, "canvas virtualization claim");
  exact(evidence.sensitiveDataRecorded, false, "canvas evidence privacy confirmation");
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256: text(evidence.evidenceSha256, SHA256, "canvas manual digest"),
    completedAt: timestamp(evidence.completedAt, "canvas manual completion"),
  };
}

const validators: Record<
  FlowcordiaPrivateBetaSourceStage,
  (input: {
    source: FlowcordiaPrivateBetaSourceInput;
    releaseId: string;
    applicationCommitSha: string;
    workflowId: string;
  }) => FlowcordiaPrivateBetaSourceIdentity
> = {
  launch_dossier: validateLaunchDossier,
  bundled_execution: validateBundledExecution,
  api_reliability: validateApiReliability,
  promotion_recovery: validatePromotionRecovery,
  failure_campaign: validateFailureCampaign,
  canvas_manual: validateCanvasManual,
};

export function createFlowcordiaPrivateBetaDossier(input: {
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  repository: string;
  assembledAt: string;
  assemblerRunId: string;
  assemblerRunAttempt: number;
  sources: readonly FlowcordiaPrivateBetaSourceInput[];
}): FlowcordiaPrivateBetaDossier {
  const releaseId = text(input.releaseId, RELEASE_ID, "Private Beta release");
  const applicationCommitSha = text(
    input.applicationCommitSha,
    SHA,
    "Private Beta application commit"
  );
  const workflowId = text(input.workflowId, WORKFLOW_ID, "Private Beta workflow");
  const repository = text(input.repository.toLowerCase(), REPOSITORY, "Private Beta repository");
  const assembledAt = timestamp(input.assembledAt, "Private Beta assembly time");
  const assemblerRunId = text(input.assemblerRunId, DECIMAL_ID, "Private Beta assembler run");
  const assemblerRunAttempt = positiveInteger(
    input.assemblerRunAttempt,
    "Private Beta assembler attempt"
  );
  if (input.sources.length !== 6) throw new Error("Private Beta dossier requires exactly six source artifacts.");
  const byStage = new Map(input.sources.map((source) => [source.stage, source]));
  if (byStage.size !== 6) throw new Error("Private Beta dossier source stages must be unique.");

  const orderedStages = Object.keys(
    FLOWCORDIA_PRIVATE_BETA_SOURCE_CONFIG
  ) as FlowcordiaPrivateBetaSourceStage[];
  const identities = orderedStages.map((stage) => {
    const source = byStage.get(stage);
    if (!source) throw new Error(`Private Beta dossier is missing ${stage}.`);
    return validators[stage]({ source, releaseId, applicationCommitSha, workflowId });
  });
  const runIds = identities.map((identity) => identity.runId);
  if (new Set(runIds).size !== runIds.length || runIds.includes(assemblerRunId)) {
    throw new Error("Private Beta dossier and source workflow runs must all be distinct.");
  }
  for (const identity of identities) {
    if (Date.parse(identity.completedAt) >= Date.parse(assembledAt)) {
      throw new Error(`${identity.stage} did not complete before final Private Beta assembly.`);
    }
  }

  const unsigned = {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-private-beta-dossier" as const,
    state: "READY" as const,
    maturity: "PRIVATE_BETA" as const,
    releaseId,
    applicationCommitSha,
    workflowId,
    repository,
    assembledAt,
    assembler: {
      workflowPath: FLOWCORDIA_PRIVATE_BETA_DOSSIER_WORKFLOW,
      runId: assemblerRunId,
      runAttempt: assemblerRunAttempt,
      sourceSha: applicationCommitSha,
    },
    sources: identities as FlowcordiaPrivateBetaDossier["sources"],
    proof: {
      connectedReleaseDossier: true as const,
      cleanBundledSupervisorAndS2Execution: true as const,
      apiDuplicateExpiryQueueAndFailureRelease: true as const,
      promotionRollbackBackupAndRestore: true as const,
      loadQueueWorkerAndProviderRecovery: true as const,
      browserAccessibilityTouchAndScale: true as const,
    },
    limitations: {
      publicBeta: false as const,
      generalAvailability: false as const,
      highAvailability: false as const,
      pointInTimeRecovery: false as const,
      crossRegionDisasterRecovery: false as const,
      unlimitedGraphScale: false as const,
      unlimitedThroughput: false as const,
      publicServiceLevelObjective: false as const,
    },
  };
  return {
    ...unsigned,
    evidenceSha256: createHash("sha256").update(canonical(unsigned)).digest("hex"),
  };
}
