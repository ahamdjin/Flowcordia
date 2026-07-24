import { createHash } from "node:crypto";
import { chmod, link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const FLOWCORDIA_SLACK_ACTION_SCHEMA_VERSION = "0.1";
export const FLOWCORDIA_SLACK_ACTION_WORKFLOW =
  ".github/workflows/flowcordia-slack-action-compatibility.yml";
export const FLOWCORDIA_SLACK_ACTION_CONFIRMATION = "CHECK_FLOWCORDIA_SLACK_ACTION_COMPATIBILITY";
export const FLOWCORDIA_SLACK_ACTION_ENVIRONMENT = "dependabot-summary";
export const FLOWCORDIA_SLACK_ACTION_CANDIDATE = {
  action: "slackapi/slack-github-action",
  version: "v4.0.0",
  sha: "dcb1066f776dd043e64d0e8ba94ca15cc7e1875d",
  method: "auth.test",
};

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const FORBIDDEN_KEY =
  /token|secret|password|authorization|cookie|header|credential|private|payload|channel|team|user|bot|url|email|recipient|raw|stack|response/i;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
}

export function flowcordiaSlackActionSha256(value) {
  return createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))
    )
    .digest("hex");
}

function repeatedPlaceholder(value) {
  return new Set(value).size === 1;
}

function validApplicationSha(value) {
  return typeof value === "string" && SHA.test(value) && !repeatedPlaceholder(value);
}

function canonicalTimestamp(value, label) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical timestamp.`);
  }
  return value;
}

function bounded(value, maximum = 256) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    !value.includes("\0")
  );
}

function integer(value, label, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const serialized = String(value);
  if (!/^[0-9]+$/.test(serialized)) {
    throw new Error(`${label} must be an integer.`);
  }
  const parsed = Number(serialized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} is outside its supported range.`);
  }
  return parsed;
}

function assertSafeEvidence(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertSafeEvidence(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(`${path}.${key} is not allowed in Slack compatibility evidence.`);
    }
    assertSafeEvidence(child, `${path}.${key}`);
  }
}

async function writeNoOverwrite(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    await link(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error(`Refusing to overwrite existing evidence: ${path}`);
    }
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

function evidenceWithoutDigest({
  applicationCommitSha,
  runId,
  runAttempt,
  runnerOs,
  runnerArch,
  checkedAt,
}) {
  if (!validApplicationSha(applicationCommitSha)) {
    throw new Error("applicationCommitSha must be an exact non-placeholder commit SHA.");
  }
  if (!RUN_ID.test(String(runId))) throw new Error("runId is invalid.");
  if (!bounded(runnerOs, 32)) throw new Error("runnerOs is invalid.");
  if (!bounded(runnerArch, 32)) throw new Error("runnerArch is invalid.");

  const evidence = {
    schemaVersion: FLOWCORDIA_SLACK_ACTION_SCHEMA_VERSION,
    kind: "flowcordia-slack-action-compatibility",
    state: "READY",
    applicationCommitSha,
    checkedAt: canonicalTimestamp(checkedAt.toISOString(), "checkedAt"),
    source: {
      workflow: FLOWCORDIA_SLACK_ACTION_WORKFLOW,
      runId: String(runId),
      runAttempt: integer(runAttempt, "runAttempt"),
      sourceRef: "refs/heads/main",
      sourceCommitSha: applicationCommitSha,
      protectedEnvironment: FLOWCORDIA_SLACK_ACTION_ENVIRONMENT,
    },
    candidate: FLOWCORDIA_SLACK_ACTION_CANDIDATE,
    runner: {
      os: runnerOs,
      arch: runnerArch,
    },
    verification: {
      authentication: "VERIFIED",
      mutation: "NONE",
    },
  };
  assertSafeEvidence(evidence);
  return evidence;
}

export function createFlowcordiaSlackActionEvidence(input) {
  const withoutDigest = evidenceWithoutDigest(input);
  return {
    ...withoutDigest,
    evidenceSha256: flowcordiaSlackActionSha256(withoutDigest),
  };
}

export function parseFlowcordiaSlackActionEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Slack compatibility evidence must be an object.");
  }
  const { evidenceSha256, ...withoutDigest } = value;
  if (!SHA256.test(evidenceSha256 ?? "")) {
    throw new Error("Slack compatibility evidence digest is invalid.");
  }
  if (flowcordiaSlackActionSha256(withoutDigest) !== evidenceSha256) {
    throw new Error("Slack compatibility evidence digest is invalid.");
  }
  const rebuilt = evidenceWithoutDigest({
    applicationCommitSha: withoutDigest.applicationCommitSha,
    runId: withoutDigest.source?.runId,
    runAttempt: withoutDigest.source?.runAttempt,
    runnerOs: withoutDigest.runner?.os,
    runnerArch: withoutDigest.runner?.arch,
    checkedAt: new Date(withoutDigest.checkedAt),
  });
  if (JSON.stringify(canonical(rebuilt)) !== JSON.stringify(canonical(withoutDigest))) {
    throw new Error("Slack compatibility evidence shape is invalid.");
  }
  return value;
}

export async function writeFlowcordiaSlackActionEvidence(path, evidence) {
  parseFlowcordiaSlackActionEvidence(evidence);
  await writeNoOverwrite(path, evidence);
}

function argumentsFrom(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Arguments must be provided as --key value pairs.");
    }
    result[key.slice(2)] = value;
  }
  return result;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = argumentsFrom(rest);
  if (command === "create") {
    const evidence = createFlowcordiaSlackActionEvidence({
      applicationCommitSha: args["application-sha"],
      runId: args["run-id"],
      runAttempt: args["run-attempt"],
      runnerOs: args["runner-os"],
      runnerArch: args["runner-arch"],
      checkedAt: new Date(args["checked-at"]),
    });
    await writeFlowcordiaSlackActionEvidence(args.output, evidence);
    console.log(
      JSON.stringify({ state: evidence.state, mutation: evidence.verification.mutation })
    );
    return;
  }
  if (command === "verify") {
    const evidence = parseFlowcordiaSlackActionEvidence(
      JSON.parse(await readFile(args.input, "utf8"))
    );
    console.log(
      JSON.stringify({ state: evidence.state, mutation: evidence.verification.mutation })
    );
    return;
  }
  throw new Error("Expected command: create or verify.");
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
