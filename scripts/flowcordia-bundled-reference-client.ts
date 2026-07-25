import { mkdir, readFile, writeFile } from "node:fs/promises";
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

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

function boundedIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._/-]{1,256}$/.test(value)) {
    throw new Error(`${label} is unavailable or malformed.`);
  }
  return value;
}

function runIdentity(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("Trigger response is malformed.");
  const record = value as Record<string, unknown>;
  const nested = record.run && typeof record.run === "object" ? (record.run as Record<string, unknown>) : {};
  return boundedIdentifier(record.id ?? record.runId ?? nested.id ?? nested.friendlyId, "Run identity");
}

function runStatus(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("Run response is malformed.");
  const record = value as Record<string, unknown>;
  const nested = record.run && typeof record.run === "object" ? (record.run as Record<string, unknown>) : {};
  return boundedIdentifier(record.status ?? nested.status, "Run status");
}

async function fetchJson(url: URL, apiKey: string, init?: RequestInit): Promise<unknown> {
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
    throw new Error(`Flowcordia reference request returned non-JSON status ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(`Flowcordia reference request failed with status ${response.status}.`);
  }
  return body;
}

async function main() {
  const bootstrapPath = resolve(argument("--bootstrap"));
  const outputPath = resolve(argument("--output"));
  const baseUrl = new URL(argument("--base-url"));
  const timeoutSeconds = Number(argument("--timeout-seconds"));
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 1_800) {
    throw new Error("Execution timeout must be an integer between 30 and 1800 seconds.");
  }

  const bootstrap = JSON.parse(await readFile(bootstrapPath, "utf8")) as Record<string, unknown>;
  const apiKey = typeof bootstrap.environmentApiKey === "string" ? bootstrap.environmentApiKey : "";
  if (!/^tr_prod_[A-Za-z0-9]{20}$/.test(apiKey)) {
    throw new Error("Bundled reference production API key is unavailable.");
  }

  const nonce = `beta-${Date.now().toString(36)}`;
  const triggerUrl = new URL("/api/v1/tasks/flowcordia-beta-reference/trigger", baseUrl);
  const triggered = await fetchJson(triggerUrl, apiKey, {
    method: "POST",
    body: JSON.stringify({ payload: { nonce } }),
  });
  const friendlyId = runIdentity(triggered);
  const deadline = Date.now() + timeoutSeconds * 1_000;
  let status = "PENDING";

  while (Date.now() < deadline) {
    const run = await fetchJson(new URL(`/api/v3/runs/${encodeURIComponent(friendlyId)}`, baseUrl), apiKey);
    status = runStatus(run);
    if (SUCCESS.has(status)) break;
    if (FAILURE.has(status)) throw new Error(`Flowcordia reference run ended in ${status}.`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  if (!SUCCESS.has(status)) throw new Error("Flowcordia reference run did not complete in time.");

  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        schemaVersion: "0.1",
        taskId: "flowcordia-beta-reference",
        friendlyId,
        status: "COMPLETED_SUCCESSFULLY",
      },
      null,
      2
    )}\n`,
    { mode: 0o600, flag: "wx" }
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Bundled reference execution failed.");
  process.exitCode = 1;
});
