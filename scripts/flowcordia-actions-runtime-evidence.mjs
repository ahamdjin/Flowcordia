import { createHash } from "node:crypto";
import { chmod, link, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FLOWCORDIA_ACTIONS_RUNTIME_SCHEMA_VERSION = "0.1";
export const FLOWCORDIA_ACTIONS_RUNTIME_WORKFLOW =
  ".github/workflows/flowcordia-actions-runtime-compatibility.yml";
export const FLOWCORDIA_ACTIONS_RUNTIME_CONFIRMATION =
  "CHECK_FLOWCORDIA_ACTIONS_RUNTIME_COMPATIBILITY";

export const FLOWCORDIA_ACTIONS_RUNTIME_PROFILES = [
  "hosted-linux",
  "hosted-windows",
  "configured-small",
  "configured-medium",
  "configured-large",
  "release-linux",
];

export const FLOWCORDIA_ACTIONS_RUNTIME_CANDIDATES = {
  checkout: {
    version: "v7.0.0",
    sha: "9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
  },
  pnpmSetup: {
    version: "v6.0.9",
    sha: "0ebf47130e4866e96fce0953f49152a61190b271",
  },
  setupNode: {
    version: "v7.0.0",
    sha: "820762786026740c76f36085b0efc47a31fe5020",
  },
  cache: {
    version: "v6.1.0",
    sha: "55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  },
};

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+() /:-]{0,127}$/;
const FORBIDDEN_KEY =
  /token|secret|password|authorization|cookie|header|credential|private|payload|path|url|email|recipient|raw|stack/i;

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

export function flowcordiaActionsRuntimeSha256(value) {
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

function profile(value) {
  if (!FLOWCORDIA_ACTIONS_RUNTIME_PROFILES.includes(value)) {
    throw new Error(`Unsupported runner profile: ${value}`);
  }
  return value;
}

function booleanString(value, label) {
  if (value !== "true" && value !== "false") {
    throw new Error(`${label} must be true or false.`);
  }
  return value === "true";
}

function integer(value, label, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} is outside its supported range.`);
  }
  return parsed;
}

function safeVersion(value, label) {
  if (!bounded(value, 128) || !VERSION.test(value)) {
    throw new Error(`${label} must be a bounded version string.`);
  }
  return value;
}

function assertSafeEvidence(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertSafeEvidence(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(`${path}.${key} is not allowed in runtime evidence.`);
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

function stageWithoutDigest({
  profileName,
  applicationCommitSha,
  runId,
  runAttempt,
  configured,
  runnerOs,
  runnerArch,
  runnerName,
  nodeVersion,
  pnpmVersion,
  gitVersion,
  cacheKey,
  cacheDigest,
  checkedAt,
}) {
  if (!validApplicationSha(applicationCommitSha)) {
    throw new Error("applicationCommitSha must be an exact non-placeholder commit SHA.");
  }
  if (!RUN_ID.test(runId)) throw new Error("runId is invalid.");
  const attempt = integer(String(runAttempt), "runAttempt");
  if (!bounded(runnerName, 256)) throw new Error("runnerName is invalid.");
  if (!bounded(runnerOs, 32)) throw new Error("runnerOs is invalid.");
  if (!bounded(runnerArch, 32)) throw new Error("runnerArch is invalid.");
  if (!bounded(cacheKey, 512)) throw new Error("cacheKey is invalid.");
  if (!SHA256.test(cacheDigest)) throw new Error("cacheDigest is invalid.");

  const evidence = {
    schemaVersion: FLOWCORDIA_ACTIONS_RUNTIME_SCHEMA_VERSION,
    kind: "flowcordia-actions-runtime-stage",
    state: "READY",
    profile: profile(profileName),
    configured: Boolean(configured),
    applicationCommitSha,
    checkedAt: canonicalTimestamp(checkedAt.toISOString(), "checkedAt"),
    source: {
      workflow: FLOWCORDIA_ACTIONS_RUNTIME_WORKFLOW,
      runId,
      runAttempt: attempt,
      sourceRef: "refs/heads/main",
      sourceCommitSha: applicationCommitSha,
    },
    runner: {
      os: runnerOs,
      arch: runnerArch,
      nameSha256: flowcordiaActionsRuntimeSha256(runnerName),
    },
    toolchain: {
      node: safeVersion(nodeVersion, "nodeVersion"),
      pnpm: safeVersion(pnpmVersion, "pnpmVersion"),
      git: safeVersion(gitVersion, "gitVersion"),
    },
    cache: {
      keySha256: flowcordiaActionsRuntimeSha256(cacheKey),
      contentSha256: cacheDigest,
      roundTrip: "VERIFIED",
    },
    candidates: FLOWCORDIA_ACTIONS_RUNTIME_CANDIDATES,
  };
  assertSafeEvidence(evidence);
  return evidence;
}

export function createFlowcordiaActionsRuntimeStageEvidence(input) {
  const withoutDigest = stageWithoutDigest(input);
  return {
    ...withoutDigest,
    evidenceSha256: flowcordiaActionsRuntimeSha256(withoutDigest),
  };
}

export function parseFlowcordiaActionsRuntimeStageEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Runtime stage evidence must be an object.");
  }
  const { evidenceSha256, ...withoutDigest } = value;
  if (!SHA256.test(evidenceSha256 ?? "")) {
    throw new Error("Runtime stage evidence digest is invalid.");
  }
  if (flowcordiaActionsRuntimeSha256(withoutDigest) !== evidenceSha256) {
    throw new Error("Runtime stage evidence digest is invalid.");
  }
  const rebuilt = stageWithoutDigest({
    profileName: withoutDigest.profile,
    applicationCommitSha: withoutDigest.applicationCommitSha,
    runId: withoutDigest.source?.runId,
    runAttempt: withoutDigest.source?.runAttempt,
    configured: withoutDigest.configured,
    runnerOs: withoutDigest.runner?.os,
    runnerArch: withoutDigest.runner?.arch,
    runnerName: `sha256:${withoutDigest.runner?.nameSha256}`,
    nodeVersion: withoutDigest.toolchain?.node,
    pnpmVersion: withoutDigest.toolchain?.pnpm,
    gitVersion: withoutDigest.toolchain?.git,
    cacheKey: `sha256:${withoutDigest.cache?.keySha256}`,
    cacheDigest: withoutDigest.cache?.contentSha256,
    checkedAt: new Date(withoutDigest.checkedAt),
  });
  const normalized = {
    ...rebuilt,
    runner: withoutDigest.runner,
    cache: withoutDigest.cache,
  };
  if (JSON.stringify(canonical(normalized)) !== JSON.stringify(canonical(withoutDigest))) {
    throw new Error("Runtime stage evidence shape is invalid.");
  }
  return value;
}

async function jsonFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
    }
  }
  await visit(root);
  return files.sort();
}

export async function assembleFlowcordiaActionsRuntimeEvidence({
  applicationCommitSha,
  evidenceRoot,
  checkedAt = new Date(),
}) {
  if (!validApplicationSha(applicationCommitSha)) {
    throw new Error("applicationCommitSha must be an exact non-placeholder commit SHA.");
  }
  const files = await jsonFiles(evidenceRoot);
  if (files.length !== FLOWCORDIA_ACTIONS_RUNTIME_PROFILES.length) {
    throw new Error(
      `Expected ${FLOWCORDIA_ACTIONS_RUNTIME_PROFILES.length} runtime stage artifacts, found ${files.length}.`
    );
  }
  const stages = [];
  for (const path of files) {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    stages.push(parseFlowcordiaActionsRuntimeStageEvidence(parsed));
  }
  stages.sort(
    (left, right) =>
      FLOWCORDIA_ACTIONS_RUNTIME_PROFILES.indexOf(left.profile) -
      FLOWCORDIA_ACTIONS_RUNTIME_PROFILES.indexOf(right.profile)
  );
  if (
    JSON.stringify(stages.map((stage) => stage.profile)) !==
    JSON.stringify(FLOWCORDIA_ACTIONS_RUNTIME_PROFILES)
  ) {
    throw new Error("Runtime stage profile set is incomplete or duplicated.");
  }
  const first = stages[0];
  for (const stage of stages) {
    if (stage.applicationCommitSha !== applicationCommitSha) {
      throw new Error("Runtime stage application commit does not match the requested revision.");
    }
    if (
      stage.source.runId !== first.source.runId ||
      stage.source.runAttempt !== first.source.runAttempt ||
      stage.source.sourceCommitSha !== first.source.sourceCommitSha
    ) {
      throw new Error("Runtime stages must come from one workflow run and attempt.");
    }
    if (
      JSON.stringify(stage.candidates) !== JSON.stringify(FLOWCORDIA_ACTIONS_RUNTIME_CANDIDATES)
    ) {
      throw new Error("Runtime stage candidate action set is invalid.");
    }
  }

  const withoutDigest = {
    schemaVersion: FLOWCORDIA_ACTIONS_RUNTIME_SCHEMA_VERSION,
    kind: "flowcordia-actions-runtime-readiness",
    state: "READY",
    applicationCommitSha,
    checkedAt: canonicalTimestamp(checkedAt.toISOString(), "checkedAt"),
    source: first.source,
    candidates: FLOWCORDIA_ACTIONS_RUNTIME_CANDIDATES,
    profiles: stages.map((stage) => ({
      profile: stage.profile,
      configured: stage.configured,
      os: stage.runner.os,
      arch: stage.runner.arch,
      node: stage.toolchain.node,
      pnpm: stage.toolchain.pnpm,
      git: stage.toolchain.git,
      cacheContentSha256: stage.cache.contentSha256,
      stageEvidenceSha256: stage.evidenceSha256,
    })),
  };
  assertSafeEvidence(withoutDigest);
  return {
    ...withoutDigest,
    evidenceSha256: flowcordiaActionsRuntimeSha256(withoutDigest),
  };
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
  if (command === "stage") {
    const evidence = createFlowcordiaActionsRuntimeStageEvidence({
      profileName: args.profile,
      applicationCommitSha: args["application-sha"],
      runId: args["run-id"],
      runAttempt: args["run-attempt"],
      configured: booleanString(args.configured, "configured"),
      runnerOs: args["runner-os"],
      runnerArch: args["runner-arch"],
      runnerName: args["runner-name"],
      nodeVersion: args["node-version"],
      pnpmVersion: args["pnpm-version"],
      gitVersion: args["git-version"],
      cacheKey: args["cache-key"],
      cacheDigest: args["cache-digest"],
      checkedAt: new Date(args["checked-at"]),
    });
    await writeNoOverwrite(args.output, evidence);
    console.log(JSON.stringify({ state: evidence.state, profile: evidence.profile }));
    return;
  }
  if (command === "assemble") {
    const evidence = await assembleFlowcordiaActionsRuntimeEvidence({
      applicationCommitSha: args["application-sha"],
      evidenceRoot: args["evidence-root"],
      checkedAt: new Date(args["checked-at"]),
    });
    await writeNoOverwrite(args.output, evidence);
    console.log(JSON.stringify({ state: evidence.state, profiles: evidence.profiles.length }));
    return;
  }
  throw new Error("Expected command: stage or assemble.");
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
