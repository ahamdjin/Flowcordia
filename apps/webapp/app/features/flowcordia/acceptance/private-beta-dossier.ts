import { createHash } from "node:crypto";
import { z } from "zod";

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

const sourceStages = [
  "launch_dossier",
  "bundled_execution",
  "api_reliability",
  "promotion_recovery",
  "failure_campaign",
  "canvas_manual",
] as const;

export type FlowcordiaPrivateBetaSourceStage = (typeof sourceStages)[number];

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

const timestampSchema = z.string().refine((value) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}, "must be a canonical timestamp");
const shaSchema = z.string().regex(SHA);
const digestSchema = z.string().regex(SHA256);
const decimalIdSchema = z.string().regex(DECIMAL_ID);
const releaseIdSchema = z.string().regex(RELEASE_ID);
const workflowIdSchema = z.string().regex(WORKFLOW_ID);
const publicIdSchema = z.string().regex(PUBLIC_ID);
const repositorySchema = z.string().regex(REPOSITORY);
const positiveIntegerSchema = z.number().int().min(1).max(1000);

const sourceInputSchema = z
  .object({
    stage: z.enum(sourceStages),
    runId: decimalIdSchema,
    runAttempt: positiveIntegerSchema,
    workflowPath: z.string().min(1).max(512),
    workflowCommitSha: shaSchema,
    artifactName: publicIdSchema,
    artifactArchiveSha256: digestSchema,
    rawEvidenceSha256: digestSchema,
    evidence: z.unknown(),
  })
  .strict();

const forbiddenKey =
  /(authorization|browserStorage|cookie|credential|databaseContents|decrypted|header|password|payload|privatePath|providerResponse|rawError|secret|token)/i;

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

function record(value: unknown, label: string): Record<string, unknown> {
  const parsed = z.record(z.unknown()).safeParse(value);
  if (!parsed.success || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return parsed.data;
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

function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label} does not match the exact Beta lineage.`);
}

function verifyEvidenceDigest(
  evidence: Record<string, unknown>,
  digestField: "manifestSha256" | "evidenceSha256",
  label: string
): string {
  const expected = digestSchema.parse(evidence[digestField]);
  const unsigned = { ...evidence };
  delete unsigned[digestField];
  const observed = canonicalDigest(unsigned);
  if (observed !== expected) throw new Error(`${label} canonical digest is invalid.`);
  return observed;
}

function sourceArtifactName(input: {
  stage: FlowcordiaPrivateBetaSourceStage;
  releaseId: string;
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
}): {
  source: FlowcordiaPrivateBetaSourceInput;
  evidence: Record<string, unknown>;
  identityBase: Omit<FlowcordiaPrivateBetaSourceIdentity, "canonicalEvidenceSha256" | "completedAt">;
} {
  const source = sourceInputSchema.parse(input.source);
  const config = FLOWCORDIA_PRIVATE_BETA_SOURCE_CONFIG[source.stage];
  exact(source.workflowPath, config.workflowPath, `${source.stage}.workflowPath`);
  exact(source.workflowCommitSha, input.applicationCommitSha, `${source.stage}.workflowCommitSha`);
  exact(
    source.artifactName,
    sourceArtifactName({
      stage: source.stage,
      releaseId: input.releaseId,
      runId: source.runId,
      runAttempt: source.runAttempt,
    }),
    `${source.stage}.artifactName`
  );
  assertNoForbiddenKeys(source.evidence, source.stage);
  const evidence = record(source.evidence, `${source.stage}.evidence`);
  return {
    source,
    evidence,
    identityBase: {
      stage: source.stage,
      runId: source.runId,
      runAttempt: source.runAttempt,
      workflowPath: source.workflowPath,
      workflowCommitSha: source.workflowCommitSha,
      artifactName: source.artifactName,
      artifactArchiveSha256: source.artifactArchiveSha256,
      rawEvidenceSha256: source.rawEvidenceSha256,
    },
  };
}

const launchDossierSchema = z
  .object({
    schemaVersion: z.literal("0.5"),
    releaseId: releaseIdSchema,
    applicationCommitSha: shaSchema,
    workflowId: workflowIdSchema,
    sourceRuns: z
      .array(
        z
          .object({
            stage: z.string().min(1).max(128),
            runId: decimalIdSchema,
            workflowCommitSha: shaSchema,
          })
          .passthrough()
      )
      .length(9),
    selfHost: z
      .object({
        targetReleaseId: releaseIdSchema,
        targetApplicationCommitSha: shaSchema,
      })
      .passthrough(),
    assembledAt: timestampSchema,
    manifestSha256: digestSchema,
  })
  .passthrough();

const bundledExecutionSchema = z
  .object({
    schemaVersion: z.literal("0.1"),
    kind: z.literal("flowcordia-bundled-execution"),
    state: z.literal("READY"),
    repository: repositorySchema,
    applicationCommitSha: shaSchema,
    releaseId: releaseIdSchema,
    imageDigest: digestSchema,
    workflow: z.object({
      runId: decimalIdSchema,
      runAttempt: positiveIntegerSchema,
      sourceSha: shaSchema,
    }),
    installation: z.object({
      clean: z.literal(true),
      serviceCount: z.number().int().min(11),
      doctor: z.literal("READY"),
      restart: z.literal("READY"),
    }),
    deployment: z.object({
      version: publicIdSchema,
      taskId: z.literal("flowcordia-beta-reference"),
      taskCount: z.number().int().min(1),
    }),
    execution: z.object({
      friendlyId: publicIdSchema,
      status: z.literal("COMPLETED_SUCCESSFULLY"),
      supervisorWorkloadObserved: z.literal(true),
      s2StateChanged: z.literal(true),
    }),
    teardown: z.object({
      containersAbsent: z.literal(true),
      networksAbsent: z.literal(true),
      volumesAbsent: z.literal(true),
    }),
    startedAt: timestampSchema,
    completedAt: timestampSchema,
    evidenceSha256: digestSchema,
  })
  .passthrough();

const apiReliabilitySchema = z
  .object({
    schemaVersion: z.literal("0.1"),
    kind: z.literal("flowcordia-api-trigger-reliability"),
    state: z.literal("READY"),
    repository: repositorySchema,
    applicationCommitSha: shaSchema,
    workflow: z.object({
      runId: decimalIdSchema,
      runAttempt: positiveIntegerSchema,
    }),
    deploymentVersion: publicIdSchema,
    duplicateSuppression: z.object({
      originalRunId: publicIdSchema,
      duplicateRunId: publicIdSchema,
    }),
    idempotencyExpiry: z.object({
      originalRunId: publicIdSchema,
      afterExpiryRunId: publicIdSchema,
      ttlSeconds: z.literal(60),
    }),
    queueExpiry: z.object({
      blockerRunId: publicIdSchema,
      expiredRunId: publicIdSchema,
      status: z.literal("EXPIRED"),
      ttlSeconds: z.literal(60),
    }),
    failedRunKeyRelease: z.object({
      firstFailureRunId: publicIdSchema,
      secondFailureRunId: publicIdSchema,
    }),
    startedAt: timestampSchema,
    completedAt: timestampSchema,
    evidenceSha256: digestSchema,
  })
  .passthrough();

const recoverySourceSchema = z
  .object({
    stage: z.enum(["self_host_lifecycle", "production", "rollback_production"]),
    runId: decimalIdSchema,
    runAttempt: positiveIntegerSchema,
    workflowPath: z.string().min(1).max(512),
    workflowCommitSha: shaSchema,
    artifactName: publicIdSchema,
    artifactArchiveSha256: digestSchema,
    evidenceSha256: digestSchema,
  })
  .passthrough();

const promotionRecoverySchema = z
  .object({
    schemaVersion: z.literal("0.1"),
    kind: z.literal("flowcordia-beta-promotion-recovery"),
    state: z.literal("READY"),
    releaseId: releaseIdSchema,
    applicationCommitSha: shaSchema,
    workflowId: workflowIdSchema,
    checkedAt: timestampSchema,
    lifecycle: z
      .object({
        targetReleaseId: releaseIdSchema,
        targetImageDigest: digestSchema,
        backupManifestSha256: digestSchema,
        restoreEvidenceSha256: digestSchema,
        archiveSha256: digestSchema,
        rollbackMode: z.enum(["application_rollback", "restore_required"]),
        recoveryRequired: z.boolean(),
        lifecycleEvidenceSha256: digestSchema,
      })
      .passthrough(),
    production: z
      .object({
        proposalId: publicIdSchema,
        mergeCommitSha: shaSchema,
        deploymentVersion: publicIdSchema,
        runFriendlyId: publicIdSchema,
        completedAt: timestampSchema,
      })
      .passthrough(),
    rollbackProduction: z
      .object({
        proposalId: publicIdSchema,
        mergeCommitSha: shaSchema,
        deploymentVersion: publicIdSchema,
        runFriendlyId: publicIdSchema,
        completedAt: timestampSchema,
      })
      .passthrough(),
    chronology: z.object({
      lifecycleCheckedAt: timestampSchema,
      productionStartedAt: timestampSchema,
      productionCompletedAt: timestampSchema,
      rollbackStartedAt: timestampSchema,
      rollbackCompletedAt: timestampSchema,
    }),
    sources: z.array(recoverySourceSchema).length(3),
    evidenceSha256: digestSchema,
  })
  .passthrough();

const failureCampaignSchema = z
  .object({
    schemaVersion: z.literal("0.1"),
    kind: z.literal("flowcordia-beta-failure-campaign"),
    state: z.literal("READY"),
    repository: repositorySchema,
    applicationCommitSha: shaSchema,
    releaseId: releaseIdSchema,
    imageDigest: digestSchema,
    workflow: z.object({
      runId: decimalIdSchema,
      runAttempt: positiveIntegerSchema,
      sourceSha: shaSchema,
    }),
    load: z.object({
      submitted: z.number().int().min(20),
      completed: z.number().int().min(20),
      failed: z.literal(0),
      peakInFlight: z.number().int().min(10),
      p95TriggerMilliseconds: z.number().min(0).max(30_000),
    }),
    queueSaturation: z.object({
      blockerRunId: publicIdSchema,
      submitted: z.number().int().min(8),
      expired: z.number().int().min(8),
      terminalStatus: z.literal("EXPIRED"),
      recoveredRunId: publicIdSchema,
      recoveryStatus: z.literal("COMPLETED_SUCCESSFULLY"),
    }),
    workerLoss: z.object({
      deliveryId: publicIdSchema,
      lostLeaseAttempt: positiveIntegerSchema,
      reclaimedAttempt: positiveIntegerSchema,
      terminalStatus: z.literal("SENT"),
    }),
    providerOutage: z.object({
      deliveryId: publicIdSchema,
      firstStatus: z.literal("PENDING"),
      firstFailureCode: z.literal("PROVIDER_REJECTED"),
      recoveryStatus: z.literal("SENT"),
      attempts: z.literal(2),
      stableDeliveryId: z.literal(true),
    }),
    disasterRecovery: z.object({
      lifecycleRunId: decimalIdSchema,
      lifecycleEvidenceSha256: digestSchema,
      backupManifestSha256: digestSchema,
      restoreEvidenceSha256: digestSchema,
      rollbackMode: z.enum(["application_rollback", "restore_required"]),
    }),
    postFailureDiagnostics: z.literal("READY"),
    teardown: z.object({
      containersAbsent: z.literal(true),
      networksAbsent: z.literal(true),
      volumesAbsent: z.literal(true),
    }),
    startedAt: timestampSchema,
    completedAt: timestampSchema,
    evidenceSha256: digestSchema,
  })
  .passthrough();

const passedCheckSchema = z.object({ key: z.string().min(1).max(128), state: z.literal("PASSED") });
const canvasManualSchema = z
  .object({
    schemaVersion: z.literal("0.1"),
    kind: z.literal("flowcordia-canvas-manual-acceptance"),
    state: z.literal("READY"),
    applicationCommitSha: shaSchema,
    referenceRepository: repositorySchema,
    referenceCommitSha: shaSchema,
    startedAt: timestampSchema,
    completedAt: timestampSchema,
    source: z.object({
      repository: repositorySchema,
      workflowPath: z.literal(".github/workflows/flowcordia-canvas-manual-acceptance.yml"),
      runId: decimalIdSchema,
      runAttempt: positiveIntegerSchema,
    }),
    sessions: z.array(
      z
        .object({
          id: z.enum(["nvda_chrome_windows", "nvda_firefox_windows", "voiceover_safari_macos"]),
          checks: z.array(passedCheckSchema).min(1),
        })
        .passthrough()
    ),
    viewports: z.array(
      z
        .object({
          id: z.enum([
            "desktop_1280x720",
            "tablet_landscape_1024x768",
            "tablet_portrait_768x1024",
            "phone_390x844",
          ]),
          checks: z.array(passedCheckSchema).min(1),
        })
        .passthrough()
    ),
    measurements: z.array(
      z
        .object({
          graph: z.enum(["production_70", "stress_300"]),
          browserCrash: z.literal(false),
          freeze: z.literal(false),
          lostEdits: z.literal(0),
          announcementsOrdered: z.literal(true),
        })
        .passthrough()
    ),
    limitations: z.object({
      multiTouchPinchAdvertised: z.literal(false),
      unlimitedGraphScaleAdvertised: z.literal(false),
      virtualizationAdvertised: z.literal(false),
    }),
    sensitiveDataRecorded: z.literal(false),
    evidenceSha256: digestSchema,
  })
  .passthrough();

interface ValidatorInput {
  source: FlowcordiaPrivateBetaSourceInput;
  releaseId: string;
  applicationCommitSha: string;
  workflowId: string;
  repository: string;
}

function validateLaunchDossier(input: ValidatorInput): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const canonicalEvidenceSha256 = verifyEvidenceDigest(
    validated.evidence,
    "manifestSha256",
    "launch dossier"
  );
  const evidence = launchDossierSchema.parse(validated.evidence);
  exact(evidence.releaseId, input.releaseId, "launch dossier release");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "launch dossier application");
  exact(evidence.workflowId, input.workflowId, "launch dossier workflow");
  exact(evidence.selfHost.targetReleaseId, input.releaseId, "launch dossier target release");
  exact(
    evidence.selfHost.targetApplicationCommitSha,
    input.applicationCommitSha,
    "launch dossier target application"
  );
  if (new Set(evidence.sourceRuns.map((entry) => entry.runId)).size !== 9) {
    throw new Error("Launch dossier source runs must be distinct.");
  }
  if (new Set(evidence.sourceRuns.map((entry) => entry.stage)).size !== 9) {
    throw new Error("Launch dossier source stages must be distinct.");
  }
  for (const source of evidence.sourceRuns) {
    exact(source.workflowCommitSha, input.applicationCommitSha, "launch dossier source commit");
  }
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256,
    completedAt: evidence.assembledAt,
  };
}

function validateBundledExecution(input: ValidatorInput): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const canonicalEvidenceSha256 = verifyEvidenceDigest(
    validated.evidence,
    "evidenceSha256",
    "bundled execution"
  );
  const evidence = bundledExecutionSchema.parse(validated.evidence);
  exact(evidence.repository, input.repository, "bundled repository");
  exact(evidence.releaseId, input.releaseId, "bundled release");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "bundled application");
  exact(evidence.workflow.runId, validated.identityBase.runId, "bundled workflow run");
  exact(evidence.workflow.runAttempt, validated.identityBase.runAttempt, "bundled workflow attempt");
  exact(evidence.workflow.sourceSha, input.applicationCommitSha, "bundled source commit");
  if (Date.parse(evidence.completedAt) <= Date.parse(evidence.startedAt)) {
    throw new Error("Bundled execution chronology is invalid.");
  }
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256,
    completedAt: evidence.completedAt,
  };
}

function validateApiReliability(input: ValidatorInput): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const canonicalEvidenceSha256 = verifyEvidenceDigest(
    validated.evidence,
    "evidenceSha256",
    "API reliability"
  );
  const evidence = apiReliabilitySchema.parse(validated.evidence);
  exact(evidence.repository, input.repository, "API reliability repository");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "API reliability application");
  exact(evidence.workflow.runId, validated.identityBase.runId, "API reliability run");
  exact(evidence.workflow.runAttempt, validated.identityBase.runAttempt, "API reliability attempt");
  exact(
    evidence.duplicateSuppression.originalRunId,
    evidence.duplicateSuppression.duplicateRunId,
    "duplicate suppression identity"
  );
  exact(
    evidence.idempotencyExpiry.originalRunId,
    evidence.duplicateSuppression.originalRunId,
    "idempotency original run"
  );
  if (evidence.idempotencyExpiry.afterExpiryRunId === evidence.idempotencyExpiry.originalRunId) {
    throw new Error("Idempotency expiry did not produce a new run.");
  }
  if (evidence.queueExpiry.blockerRunId === evidence.queueExpiry.expiredRunId) {
    throw new Error("Queue expiry did not preserve distinct run identities.");
  }
  if (
    evidence.failedRunKeyRelease.firstFailureRunId ===
    evidence.failedRunKeyRelease.secondFailureRunId
  ) {
    throw new Error("Failed-run key release did not produce a distinct retry run.");
  }
  if (Date.parse(evidence.completedAt) <= Date.parse(evidence.startedAt)) {
    throw new Error("API reliability chronology is invalid.");
  }
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256,
    completedAt: evidence.completedAt,
  };
}

function validatePromotionRecovery(input: ValidatorInput): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const canonicalEvidenceSha256 = verifyEvidenceDigest(
    validated.evidence,
    "evidenceSha256",
    "promotion recovery"
  );
  const evidence = promotionRecoverySchema.parse(validated.evidence);
  exact(evidence.releaseId, input.releaseId, "promotion recovery release");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "promotion recovery application");
  exact(evidence.workflowId, input.workflowId, "promotion recovery workflow");
  exact(evidence.lifecycle.targetReleaseId, input.releaseId, "promotion recovery target release");
  if (new Set(evidence.sources.map((entry) => entry.runId)).size !== 3) {
    throw new Error("Promotion recovery source runs must be distinct.");
  }
  if (new Set(evidence.sources.map((entry) => entry.stage)).size !== 3) {
    throw new Error("Promotion recovery source stages must be distinct.");
  }
  for (const source of evidence.sources) {
    exact(source.workflowCommitSha, input.applicationCommitSha, "promotion recovery source commit");
  }
  if (
    evidence.production.proposalId === evidence.rollbackProduction.proposalId ||
    evidence.production.mergeCommitSha === evidence.rollbackProduction.mergeCommitSha ||
    evidence.production.deploymentVersion === evidence.rollbackProduction.deploymentVersion ||
    evidence.production.runFriendlyId === evidence.rollbackProduction.runFriendlyId
  ) {
    throw new Error("Promotion and rollback-production identities must be distinct.");
  }
  const chronology = [
    evidence.chronology.lifecycleCheckedAt,
    evidence.chronology.productionStartedAt,
    evidence.chronology.productionCompletedAt,
    evidence.chronology.rollbackStartedAt,
    evidence.chronology.rollbackCompletedAt,
    evidence.checkedAt,
  ].map(Date.parse);
  if (chronology.some((value, index) => index > 0 && value < chronology[index - 1]!)) {
    throw new Error("Promotion and recovery chronology is invalid.");
  }
  exact(
    evidence.production.completedAt,
    evidence.chronology.productionCompletedAt,
    "promotion completion chronology"
  );
  exact(
    evidence.rollbackProduction.completedAt,
    evidence.chronology.rollbackCompletedAt,
    "rollback completion chronology"
  );
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256,
    completedAt: evidence.checkedAt,
  };
}

function validateFailureCampaign(input: ValidatorInput): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const canonicalEvidenceSha256 = verifyEvidenceDigest(
    validated.evidence,
    "evidenceSha256",
    "failure campaign"
  );
  const evidence = failureCampaignSchema.parse(validated.evidence);
  exact(evidence.repository, input.repository, "failure campaign repository");
  exact(evidence.releaseId, input.releaseId, "failure campaign release");
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "failure campaign application");
  exact(evidence.workflow.runId, validated.identityBase.runId, "failure campaign run");
  exact(evidence.workflow.runAttempt, validated.identityBase.runAttempt, "failure campaign attempt");
  exact(evidence.workflow.sourceSha, input.applicationCommitSha, "failure campaign source commit");
  exact(evidence.load.completed, evidence.load.submitted, "failure campaign completed load");
  exact(
    evidence.queueSaturation.expired,
    evidence.queueSaturation.submitted,
    "failure campaign expired queue count"
  );
  if (evidence.queueSaturation.blockerRunId === evidence.queueSaturation.recoveredRunId) {
    throw new Error("Failure campaign queue recovery reused the blocker run.");
  }
  if (evidence.workerLoss.reclaimedAttempt !== evidence.workerLoss.lostLeaseAttempt + 1) {
    throw new Error("Failure campaign did not reclaim the expired delivery lease exactly once.");
  }
  if (Date.parse(evidence.completedAt) <= Date.parse(evidence.startedAt)) {
    throw new Error("Failure campaign chronology is invalid.");
  }
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256,
    completedAt: evidence.completedAt,
  };
}

function validateCanvasManual(input: ValidatorInput): FlowcordiaPrivateBetaSourceIdentity {
  const validated = validateSourceEnvelope(input);
  const canonicalEvidenceSha256 = verifyEvidenceDigest(
    validated.evidence,
    "evidenceSha256",
    "canvas manual"
  );
  const evidence = canvasManualSchema.parse(validated.evidence);
  exact(evidence.applicationCommitSha, input.applicationCommitSha, "canvas manual application");
  exact(evidence.source.repository, input.repository, "canvas manual repository");
  exact(evidence.source.runId, validated.identityBase.runId, "canvas manual run");
  exact(evidence.source.runAttempt, validated.identityBase.runAttempt, "canvas manual attempt");
  if (new Set(evidence.sessions.map((entry) => entry.id)).size !== 3) {
    throw new Error("Canvas manual assistive-technology matrix is incomplete.");
  }
  if (new Set(evidence.viewports.map((entry) => entry.id)).size !== 4) {
    throw new Error("Canvas manual viewport matrix is incomplete.");
  }
  if (new Set(evidence.measurements.map((entry) => entry.graph)).size !== 2) {
    throw new Error("Canvas manual graph measurement matrix is incomplete.");
  }
  if (Date.parse(evidence.completedAt) <= Date.parse(evidence.startedAt)) {
    throw new Error("Canvas manual chronology is invalid.");
  }
  return {
    ...validated.identityBase,
    canonicalEvidenceSha256,
    completedAt: evidence.completedAt,
  };
}

const validators: Record<
  FlowcordiaPrivateBetaSourceStage,
  (input: ValidatorInput) => FlowcordiaPrivateBetaSourceIdentity
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
  const releaseId = releaseIdSchema.parse(input.releaseId);
  const applicationCommitSha = shaSchema.parse(input.applicationCommitSha);
  const workflowId = workflowIdSchema.parse(input.workflowId);
  const repository = repositorySchema.parse(input.repository.toLowerCase());
  const assembledAt = timestampSchema.parse(input.assembledAt);
  const assemblerRunId = decimalIdSchema.parse(input.assemblerRunId);
  const assemblerRunAttempt = positiveIntegerSchema.parse(input.assemblerRunAttempt);
  if (input.sources.length !== 6) {
    throw new Error("Private Beta dossier requires exactly six source artifacts.");
  }
  const byStage = new Map(input.sources.map((source) => [source.stage, source]));
  if (byStage.size !== 6) throw new Error("Private Beta dossier source stages must be unique.");

  const identities = sourceStages.map((stage) => {
    const source = byStage.get(stage);
    if (!source) throw new Error(`Private Beta dossier is missing ${stage}.`);
    return validators[stage]({
      source,
      releaseId,
      applicationCommitSha,
      workflowId,
      repository,
    });
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
    evidenceSha256: canonicalDigest(unsigned),
  };
}
