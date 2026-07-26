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
const ACTIVE = new Set(["DEQUEUED", "EXECUTING", "EXECUTING_WITH_WAITPOINTS", "PENDING_EXECUTING"]);

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The connected API response is malformed.");
  }
  return value as Record<string, unknown>;
}

function bounded(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._/-]{1,256}$/.test(value)) {
    throw new Error(`${label} is unavailable or malformed.`);
  }
  return value;
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
}): Promise<{ id: string; milliseconds: number }> {
  const started = performance.now();
  const id = runId(
    await requestJson(
      new URL(`/api/v1/tasks/${encodeURIComponent(input.taskId)}/trigger`, input.baseUrl),
      input.apiKey,
      {
        method: "POST",
        body: JSON.stringify({ payload: input.payload, options: input.options }),
      }
    )
  );
  return { id, milliseconds: performance.now() - started };
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

function percentile(values: number[], percentileValue: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * ordered.length) - 1);
  return Math.round(ordered[index] ?? 0);
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
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 180 || timeoutSeconds > 1_200) {
    throw new Error("The Beta failure timeout must be between 180 and 1200 seconds.");
  }

  const loadCount = 24;
  const saturationCount = 8;
  const startedAt = new Date().toISOString();
  const campaign = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const timeoutAt = Date.now() + timeoutSeconds * 1_000;

  const loadTriggers = await Promise.all(
    Array.from({ length: loadCount }, async (_, index) =>
      trigger({
        baseUrl,
        apiKey,
        taskId: "flowcordia-api-idempotency",
        payload: { nonce: `load-${campaign}-${index}` },
        options: {
          idempotencyKey: `load-${campaign}-${index}`,
          idempotencyKeyTTL: "5m",
          ttl: "5m",
        },
      })
    )
  );
  const loadStatuses = await Promise.all(
    loadTriggers.map((entry) =>
      waitFor({ baseUrl, apiKey, id: entry.id, accepted: SUCCESS, timeoutAt })
    )
  );
  const completed = loadStatuses.filter((status) => SUCCESS.has(status)).length;

  const blocker = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-queue-ttl",
    payload: { nonce: `saturation-blocker-${campaign}`, holdMilliseconds: 90_000 },
    options: { idempotencyKey: `saturation-blocker-${campaign}`, idempotencyKeyTTL: "5m", ttl: "5m" },
  });
  await waitFor({ baseUrl, apiKey, id: blocker.id, accepted: ACTIVE, timeoutAt });

  const saturated = await Promise.all(
    Array.from({ length: saturationCount }, async (_, index) =>
      trigger({
        baseUrl,
        apiKey,
        taskId: "flowcordia-api-queue-ttl",
        payload: { nonce: `saturation-${campaign}-${index}`, holdMilliseconds: 0 },
        options: {
          idempotencyKey: `saturation-${campaign}-${index}`,
          idempotencyKeyTTL: "5m",
          ttl: "60s",
        },
      })
    )
  );
  const saturatedStatuses = await Promise.all(
    saturated.map((entry) =>
      waitFor({ baseUrl, apiKey, id: entry.id, accepted: new Set(["EXPIRED"]), timeoutAt })
    )
  );
  await waitFor({ baseUrl, apiKey, id: blocker.id, accepted: SUCCESS, timeoutAt });

  const recovered = await trigger({
    baseUrl,
    apiKey,
    taskId: "flowcordia-api-queue-ttl",
    payload: { nonce: `saturation-recovery-${campaign}`, holdMilliseconds: 0 },
    options: { idempotencyKey: `saturation-recovery-${campaign}`, idempotencyKeyTTL: "5m", ttl: "5m" },
  });
  const recoveryStatus = await waitFor({
    baseUrl,
    apiKey,
    id: recovered.id,
    accepted: SUCCESS,
    timeoutAt,
  });

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
        load: {
          submitted: loadCount,
          completed,
          failed: loadCount - completed,
          peakInFlight: loadCount,
          p95TriggerMilliseconds: percentile(
            loadTriggers.map((entry) => entry.milliseconds),
            95
          ),
        },
        queueSaturation: {
          blockerRunId: blocker.id,
          submitted: saturationCount,
          expired: saturatedStatuses.filter((status) => status === "EXPIRED").length,
          terminalStatus: "EXPIRED",
          recoveredRunId: recovered.id,
          recoveryStatus:
            recoveryStatus === "COMPLETED" ? "COMPLETED_SUCCESSFULLY" : recoveryStatus,
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
  console.error(error instanceof Error ? error.message : "Beta load campaign failed.");
  process.exitCode = 1;
});
