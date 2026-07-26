import { createHash } from "node:crypto";
import {
  parseFlowcordiaSelfHostLifecycleEvidence,
  type FlowcordiaSelfHostLifecycleEvidence,
} from "../operations/self-host-lifecycle";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BOUNDED = /^[A-Za-z0-9._/-]{1,256}$/;

export type FlowcordiaBetaFailureObservation = {
  schemaVersion: "0.1";
  startedAt: string;
  completedAt: string;
  load: {
    submitted: number;
    completed: number;
    failed: number;
    peakInFlight: number;
    p95TriggerMilliseconds: number;
  };
  queueSaturation: {
    blockerRunId: string;
    submitted: number;
    expired: number;
    terminalStatus: "EXPIRED";
    recoveredRunId: string;
    recoveryStatus: "COMPLETED_SUCCESSFULLY";
  };
  workerLoss: {
    deliveryId: string;
    lostLeaseAttempt: number;
    reclaimedAttempt: number;
    terminalStatus: "SENT";
  };
  providerOutage: {
    deliveryId: string;
    firstStatus: "PENDING";
    firstFailureCode: "PROVIDER_REJECTED";
    recoveryStatus: "SENT";
    attempts: number;
    stableDeliveryId: true;
  };
  postFailureDiagnostics: "READY";
  teardown: {
    containersAbsent: true;
    networksAbsent: true;
    volumesAbsent: true;
  };
};

export type FlowcordiaBetaFailureEvidence = {
  schemaVersion: "0.1";
  kind: "flowcordia-beta-failure-campaign";
  state: "READY";
  repository: string;
  applicationCommitSha: string;
  releaseId: string;
  imageDigest: string;
  workflow: {
    runId: string;
    runAttempt: number;
    sourceSha: string;
  };
  load: FlowcordiaBetaFailureObservation["load"];
  queueSaturation: FlowcordiaBetaFailureObservation["queueSaturation"];
  workerLoss: FlowcordiaBetaFailureObservation["workerLoss"];
  providerOutage: FlowcordiaBetaFailureObservation["providerOutage"];
  disasterRecovery: {
    lifecycleRunId: string;
    lifecycleEvidenceSha256: string;
    backupManifestSha256: string;
    restoreEvidenceSha256: string;
    rollbackMode: "application_rollback" | "restore_required";
  };
  postFailureDiagnostics: "READY";
  teardown: FlowcordiaBetaFailureObservation["teardown"];
  startedAt: string;
  completedAt: string;
  evidenceSha256: string;
};

const forbiddenKey =
  /(authorization|browser|cookie|credential|database|header|password|payload|private|providerResponse|secret|token|url|workerId)/i;

function assertNoForbiddenKeys(value: unknown, path = "evidence input"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKey.test(key)) throw new Error(`${path} contains forbidden field ${key}.`);
    assertNoForbiddenKeys(entry, `${path}.${key}`);
  }
}

function bounded(value: unknown, label: string): string {
  if (typeof value !== "string" || !BOUNDED.test(value)) {
    throw new Error(`${label} is malformed.`);
  }
  return value;
}

function iso(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return new Date(value).toISOString();
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
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

export function createFlowcordiaBetaFailureEvidence(input: {
  repository: string;
  runId: string;
  runAttempt: number;
  sourceSha: string;
  observation: FlowcordiaBetaFailureObservation;
  lifecycle: unknown;
}): FlowcordiaBetaFailureEvidence {
  assertNoForbiddenKeys(input.observation);
  const lifecycle: FlowcordiaSelfHostLifecycleEvidence =
    parseFlowcordiaSelfHostLifecycleEvidence(input.lifecycle);
  const applicationCommitSha = bounded(input.sourceSha, "Application commit");
  if (!SHA.test(applicationCommitSha) || lifecycle.target.applicationCommitSha !== applicationCommitSha) {
    throw new Error("The failure campaign and lifecycle evidence do not belong to one application commit.");
  }
  if (input.observation.schemaVersion !== "0.1") {
    throw new Error("The failure observation schema is unsupported.");
  }

  const submitted = positive(input.observation.load.submitted, "Submitted load count");
  const completed = positive(input.observation.load.completed, "Completed load count");
  const peakInFlight = positive(input.observation.load.peakInFlight, "Peak in-flight count");
  if (
    submitted < 20 ||
    completed !== submitted ||
    input.observation.load.failed !== 0 ||
    peakInFlight < 10 ||
    !Number.isFinite(input.observation.load.p95TriggerMilliseconds) ||
    input.observation.load.p95TriggerMilliseconds < 0 ||
    input.observation.load.p95TriggerMilliseconds > 30_000
  ) {
    throw new Error("The connected load observation is incomplete or outside the bounded Beta objective.");
  }

  const saturatedSubmitted = positive(
    input.observation.queueSaturation.submitted,
    "Saturated queue submission count"
  );
  if (
    saturatedSubmitted < 8 ||
    input.observation.queueSaturation.expired !== saturatedSubmitted ||
    input.observation.queueSaturation.terminalStatus !== "EXPIRED" ||
    input.observation.queueSaturation.recoveryStatus !== "COMPLETED_SUCCESSFULLY" ||
    input.observation.queueSaturation.blockerRunId === input.observation.queueSaturation.recoveredRunId
  ) {
    throw new Error("Queue saturation and recovery were not proved.");
  }

  if (
    input.observation.workerLoss.terminalStatus !== "SENT" ||
    positive(input.observation.workerLoss.reclaimedAttempt, "Reclaimed delivery attempt") !==
      positive(input.observation.workerLoss.lostLeaseAttempt, "Lost delivery attempt") + 1
  ) {
    throw new Error("Expired delivery ownership was not reclaimed after simulated worker loss.");
  }

  if (
    input.observation.providerOutage.firstStatus !== "PENDING" ||
    input.observation.providerOutage.firstFailureCode !== "PROVIDER_REJECTED" ||
    input.observation.providerOutage.recoveryStatus !== "SENT" ||
    input.observation.providerOutage.attempts !== 2 ||
    input.observation.providerOutage.stableDeliveryId !== true
  ) {
    throw new Error("Provider outage redrive was not proved.");
  }

  if (
    input.observation.postFailureDiagnostics !== "READY" ||
    input.observation.teardown.containersAbsent !== true ||
    input.observation.teardown.networksAbsent !== true ||
    input.observation.teardown.volumesAbsent !== true
  ) {
    throw new Error("Post-failure health or teardown is incomplete.");
  }

  if (!Number.isSafeInteger(input.runAttempt) || input.runAttempt < 1 || input.runAttempt > 1000) {
    throw new Error("The failure workflow attempt is invalid.");
  }
  const startedAt = iso(input.observation.startedAt, "Failure campaign start");
  const completedAt = iso(input.observation.completedAt, "Failure campaign completion");
  if (Date.parse(completedAt) <= Date.parse(startedAt)) {
    throw new Error("Failure campaign chronology is invalid.");
  }
  if (Date.parse(startedAt) <= Date.parse(lifecycle.checkedAt)) {
    throw new Error("The failure campaign must run after the candidate lifecycle rehearsal.");
  }

  const unsigned = {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-beta-failure-campaign" as const,
    state: "READY" as const,
    repository: bounded(input.repository.toLowerCase(), "Repository"),
    applicationCommitSha,
    releaseId: bounded(lifecycle.target.releaseId, "Release ID"),
    imageDigest: bounded(lifecycle.target.imageDigest, "Image digest"),
    workflow: {
      runId: bounded(input.runId, "Workflow run"),
      runAttempt: input.runAttempt,
      sourceSha: applicationCommitSha,
    },
    load: input.observation.load,
    queueSaturation: input.observation.queueSaturation,
    workerLoss: input.observation.workerLoss,
    providerOutage: input.observation.providerOutage,
    disasterRecovery: {
      lifecycleRunId: bounded(lifecycle.source.runId, "Lifecycle workflow run"),
      lifecycleEvidenceSha256: lifecycle.evidenceSha256,
      backupManifestSha256: lifecycle.recovery.backupManifestSha256,
      restoreEvidenceSha256: lifecycle.recovery.restoreEvidenceSha256,
      rollbackMode: lifecycle.rollback.mode,
    },
    postFailureDiagnostics: input.observation.postFailureDiagnostics,
    teardown: input.observation.teardown,
    startedAt,
    completedAt,
  };
  for (const digest of [
    unsigned.imageDigest,
    unsigned.disasterRecovery.lifecycleEvidenceSha256,
    unsigned.disasterRecovery.backupManifestSha256,
    unsigned.disasterRecovery.restoreEvidenceSha256,
  ]) {
    if (!SHA256.test(digest)) throw new Error("Failure evidence contains a malformed digest.");
  }
  const evidenceSha256 = createHash("sha256").update(canonical(unsigned)).digest("hex");
  return { ...unsigned, evidenceSha256 };
}
