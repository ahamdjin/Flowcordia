import { createHash } from "node:crypto";

const RUN_ID = /^run_[A-Za-z0-9_-]{4,252}$/;
const VERSION = /^[A-Za-z0-9._/-]{1,256}$/;
const SHA = /^[0-9a-f]{40}$/;
const forbiddenKey =
  /(apiKey|authorization|cookie|credential|header|idempotencyKey|payload|secret|token|url)/i;

export type FlowcordiaApiTriggerReliabilityObservation = {
  schemaVersion: "0.1";
  deploymentVersion: string;
  startedAt: string;
  completedAt: string;
  duplicateSuppression: {
    state: "READY";
    originalRunId: string;
    duplicateRunId: string;
  };
  idempotencyExpiry: {
    state: "READY";
    originalRunId: string;
    afterExpiryRunId: string;
    ttlSeconds: 60;
  };
  queueExpiry: {
    state: "READY";
    blockerRunId: string;
    expiredRunId: string;
    expiredStatus: "EXPIRED";
    ttlSeconds: 60;
  };
  failedRunKeyRelease: {
    state: "READY";
    firstFailureRunId: string;
    secondFailureRunId: string;
  };
};

export type FlowcordiaApiTriggerReliabilityEvidence = {
  schemaVersion: "0.1";
  kind: "flowcordia-api-trigger-reliability";
  state: "READY";
  repository: string;
  applicationCommitSha: string;
  workflow: {
    runId: string;
    runAttempt: number;
  };
  deploymentVersion: string;
  duplicateSuppression: {
    originalRunId: string;
    duplicateRunId: string;
  };
  idempotencyExpiry: {
    originalRunId: string;
    afterExpiryRunId: string;
    ttlSeconds: 60;
  };
  queueExpiry: {
    blockerRunId: string;
    expiredRunId: string;
    status: "EXPIRED";
    ttlSeconds: 60;
  };
  failedRunKeyRelease: {
    firstFailureRunId: string;
    secondFailureRunId: string;
  };
  startedAt: string;
  completedAt: string;
  evidenceSha256: string;
};

function assertNoForbiddenKeys(value: unknown, path = "observation"): void {
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

function runId(value: unknown, label: string): string {
  if (typeof value !== "string" || !RUN_ID.test(value)) throw new Error(`${label} is malformed.`);
  return value;
}

function iso(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return new Date(value).toISOString();
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

export function createFlowcordiaApiTriggerReliabilityEvidence(input: {
  repository: string;
  applicationCommitSha: string;
  runId: string;
  runAttempt: number;
  observation: FlowcordiaApiTriggerReliabilityObservation;
}): FlowcordiaApiTriggerReliabilityEvidence {
  assertNoForbiddenKeys(input.observation);
  if (input.observation.schemaVersion !== "0.1") throw new Error("Unsupported observation schema.");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository)) {
    throw new Error("Repository identity is malformed.");
  }
  if (!SHA.test(input.applicationCommitSha)) throw new Error("Application commit is malformed.");
  if (!/^[1-9][0-9]{0,19}$/.test(input.runId)) throw new Error("Workflow run is malformed.");
  if (!Number.isSafeInteger(input.runAttempt) || input.runAttempt < 1 || input.runAttempt > 100) {
    throw new Error("Workflow attempt is malformed.");
  }
  if (!VERSION.test(input.observation.deploymentVersion)) {
    throw new Error("Deployment version is malformed.");
  }

  const duplicateOriginal = runId(
    input.observation.duplicateSuppression.originalRunId,
    "Duplicate original run"
  );
  const duplicateReturned = runId(
    input.observation.duplicateSuppression.duplicateRunId,
    "Duplicate returned run"
  );
  if (
    input.observation.duplicateSuppression.state !== "READY" ||
    duplicateOriginal !== duplicateReturned
  ) {
    throw new Error("Duplicate suppression evidence is invalid.");
  }

  const expiryOriginal = runId(
    input.observation.idempotencyExpiry.originalRunId,
    "TTL original run"
  );
  const afterExpiry = runId(
    input.observation.idempotencyExpiry.afterExpiryRunId,
    "TTL replacement run"
  );
  if (
    input.observation.idempotencyExpiry.state !== "READY" ||
    input.observation.idempotencyExpiry.ttlSeconds !== 60 ||
    expiryOriginal !== duplicateOriginal ||
    afterExpiry === expiryOriginal
  ) {
    throw new Error("Idempotency expiry evidence is invalid.");
  }

  const blockerRunId = runId(input.observation.queueExpiry.blockerRunId, "Queue blocker run");
  const expiredRunId = runId(input.observation.queueExpiry.expiredRunId, "Expired queue run");
  if (
    input.observation.queueExpiry.state !== "READY" ||
    input.observation.queueExpiry.expiredStatus !== "EXPIRED" ||
    input.observation.queueExpiry.ttlSeconds !== 60 ||
    blockerRunId === expiredRunId
  ) {
    throw new Error("Queue expiry evidence is invalid.");
  }

  const firstFailure = runId(
    input.observation.failedRunKeyRelease.firstFailureRunId,
    "First failed run"
  );
  const secondFailure = runId(
    input.observation.failedRunKeyRelease.secondFailureRunId,
    "Second failed run"
  );
  if (input.observation.failedRunKeyRelease.state !== "READY" || firstFailure === secondFailure) {
    throw new Error("Failed-run key-release evidence is invalid.");
  }

  const startedAt = iso(input.observation.startedAt, "Started timestamp");
  const completedAt = iso(input.observation.completedAt, "Completed timestamp");
  if (Date.parse(completedAt) <= Date.parse(startedAt))
    throw new Error("Evidence chronology is invalid.");

  const unsigned = {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-api-trigger-reliability" as const,
    state: "READY" as const,
    repository: input.repository.toLowerCase(),
    applicationCommitSha: input.applicationCommitSha,
    workflow: { runId: input.runId, runAttempt: input.runAttempt },
    deploymentVersion: input.observation.deploymentVersion,
    duplicateSuppression: {
      originalRunId: duplicateOriginal,
      duplicateRunId: duplicateReturned,
    },
    idempotencyExpiry: {
      originalRunId: expiryOriginal,
      afterExpiryRunId: afterExpiry,
      ttlSeconds: 60 as const,
    },
    queueExpiry: {
      blockerRunId,
      expiredRunId,
      status: "EXPIRED" as const,
      ttlSeconds: 60 as const,
    },
    failedRunKeyRelease: {
      firstFailureRunId: firstFailure,
      secondFailureRunId: secondFailure,
    },
    startedAt,
    completedAt,
  };
  return {
    ...unsigned,
    evidenceSha256: createHash("sha256").update(canonical(unsigned)).digest("hex"),
  };
}
