import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SUCCESS = new Set(["COMPLETED", "COMPLETED_SUCCESSFULLY"]);
const FAILURE = new Set([
  "CANCELED",
  "CANCELLED",
  "COMPLETED_WITH_ERRORS",
  "CRASHED",
  "FAILED",
  "INTERRUPTED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
]);
const ACTIVE = new Set([
  "DEQUEUED",
  "EXECUTING",
  "EXECUTING_WITH_WAITPOINTS",
  "PENDING_EXECUTING",
]);

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

function bounded(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._/-]{1,256}$/.test(value)) {
    throw new Error(`${label} is unavailable or malformed.`);
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The connected API response is malformed.");
  }
  return value as Record<string, unknown>;
}

function runId(value: unknown): string {
  const response = record(value);
  const nested = response.run && typeof response.run === "object" ? record(response.run) : {};
  return bounded(response.id ?? response.runId ?? nested.id ?? nested.friendlyId, "Run identity");
}

function runStatus(value: unknown): string {
  const response = record(value);
  const nested = response.run && typeof response.run === "object" ? record(response.run) : {};
  return bounded(response.status ?? nested.status, "Run status").toUpperCase();
}

async function requestJson(url: URL, apiKey: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Connected API returned non-JSON status ${response.status}.`);
  }
  if (!response.ok) throw new Error(`Connected API request failed with status ${response.status}.`);
  return body;
}

async function trigger(input: {
  baseUrl: URL;
  apiKey: string;
  taskId: string;
  payload: Record<string, unknown>;
  options: Record<string, unknown>;
}): Promise<string> {
  return runId(
    await requestJson(
      new URL(`/api/v1/tasks/${encodeURIComponent(input.taskId)}/trigger`, input.baseUrl),
      input.apiKey,
      {
        method: "POST",
        body: JSON.stringify({ payload: input.payload, options: input.options }),
      }
    )
  );
}

async function retrieve(baseUrl: URL, apiKey: string, id: string): Promise<string> {
  return runStatus(
    await requestJson(new URL(`/api/v3/runs/${encodeURIComponent(id)}`, baseUrl), apiKey)
  );
}

async function waitFor(input: {
  baseUrl: URL;
  apiKey: string;
  id: string;
  accepted: Set<string>;
  timeoutAt: number;
}): Promise<string> {
  let status = "PENDING";
  while (Date.now() < input.timeoutAt) {
    status = await retrieve(input.baseUrl, input.apiKey, input.id);
    if (input.accepted.has(status)) return status;
    if (FAILURE.has(status) && !input.accepted.has(status)) {
      throw new Error(`Run ${input.id} ended unexpectedly in ${status}.`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new Error(`Run ${input.id} did not reach the required state from ${status}.`);
}

async function main() {
  const baseUrl = new URL(argument("--base-url"));
  const apiKey = argument("--api-key");
  const output = resolve(argument("--output"));
  const deploymentVersion = bounded(argument("--deployment-version"), "Deployment version");
  const timeoutSeconds = Number(argument("--timeout-seconds"));
  if (!/^tr_(dev|prod|stg|preview)_[A-Za-z0-9]{20}$/.test(apiKey)) {
    throw new Error("The connected environment API key is malformed.");
  }
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 150 || timeoutSeconds > 900) {
    throw new Error("The reliability timeout must be between 150 and 900 seconds.");
  }

  const startedAt = new Date().toISOString();
  const campaign = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const timeoutAt = Date.now() + timeoutSeconds * 1_000;

  const duplicateKey = `duplicate-${campaign}`;
  const duplicatePayload = { nonce: `duplicate-${campaign}` };
  const originalRunId = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-idempotency",
    payload: duplicatePayload,
    options: { idempotencyKey: duplicateKey, idempotencyKeyTTL: "60s", ttl: "5m" },
  });
  const duplicateRunId = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-idempotency",
    payload: duplicatePayload,
    options: { idempotencyKey: duplicateKey, idempotencyKeyTTL: "60s", ttl: "5m" },
  });
  if (duplicateRunId !== originalRunId) {
    throw new Error("The duplicate request created a second run inside the idempotency window.");
  }

  const blockerRunId = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-queue-ttl",
    payload: { nonce: `blocker-${campaign}`, holdMilliseconds: 90_000 },
    options: { idempotencyKey: `blocker-${campaign}`, idempotencyKeyTTL: "5m", ttl: "5m" },
  });
  await waitFor({ baseUrl, apiKey, id: blockerRunId, accepted: ACTIVE, timeoutAt });
  const expiringRunId = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-queue-ttl",
    payload: { nonce: `expiring-${campaign}`, holdMilliseconds: 0 },
    options: { idempotencyKey: `expiring-${campaign}`, idempotencyKeyTTL: "5m", ttl: "60s" },
  });
  if (expiringRunId === blockerRunId) throw new Error("The queued TTL probe reused the blocker run.");

  const failureKey = `failure-${campaign}`;
  const firstFailureRunId = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-failure-release",
    payload: { nonce: `failure-${campaign}` },
    options: { idempotencyKey: failureKey, idempotencyKeyTTL: "5m", ttl: "5m" },
  });
  await waitFor({ baseUrl, apiKey, id: firstFailureRunId, accepted: FAILURE, timeoutAt });
  const secondFailureRunId = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-failure-release",
    payload: { nonce: `failure-${campaign}` },
    options: { idempotencyKey: failureKey, idempotencyKeyTTL: "5m", ttl: "5m" },
  });
  if (secondFailureRunId === firstFailureRunId) {
    throw new Error("The failed run retained its idempotency key.");
  }
  await waitFor({ baseUrl, apiKey, id: secondFailureRunId, accepted: FAILURE, timeoutAt });

  await waitFor({ baseUrl, apiKey, id: originalRunId, accepted: SUCCESS, timeoutAt });
  const expiryDeadline = Date.now() + 67_000;
  while (Date.now() < expiryDeadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  const afterExpiryRunId = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-idempotency",
    payload: duplicatePayload,
    options: { idempotencyKey: duplicateKey, idempotencyKeyTTL: "60s", ttl: "5m" },
  });
  if (afterExpiryRunId === originalRunId) {
    throw new Error("The idempotency key did not expire after its configured window.");
  }
  await waitFor({ baseUrl, apiKey, id: afterExpiryRunId, accepted: SUCCESS, timeoutAt });

  const expiredStatus = await waitFor({
    baseUrl,
    apiKey,
    id: expiringRunId,
    accepted: new Set(["EXPIRED"]),
    timeoutAt,
  });
  await waitFor({ baseUrl, apiKey, id: blockerRunId, accepted: SUCCESS, timeoutAt });

  const completedAt = new Date().toISOString();
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(
    output,
    `${JSON.stringify(
      {
        schemaVersion: "0.1",
        deploymentVersion,
        startedAt,
        completedAt,
        duplicateSuppression: {
          state: "READY",
          originalRunId,
          duplicateRunId,
        },
        idempotencyExpiry: {
          state: "READY",
          originalRunId,
          afterExpiryRunId,
          ttlSeconds: 60,
        },
        queueExpiry: {
          state: "READY",
          blockerRunId,
          expiredRunId: expiringRunId,
          expiredStatus,
          ttlSeconds: 60,
        },
        failedRunKeyRelease: {
          state: "READY",
          firstFailureRunId,
          secondFailureRunId,
        },
      },
      null,
      2
    )}\n`,
    { mode: 0o600, flag: "wx" }
  );
  await chmod(output, 0o600);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "API trigger reliability failed.");
  process.exitCode = 1;
});
