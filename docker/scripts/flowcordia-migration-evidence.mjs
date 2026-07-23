#!/usr/bin/env node
import { chmod, link, lstat, mkdir, open, rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  canonicalFlowcordiaValue,
  flowcordiaSha256,
  verifyFlowcordiaReleaseProcess,
} from "./flowcordia-release-contract.mjs";

const SCHEMA_VERSION = "0.2";
const SAFE_DIRECTORY = 0o700;
const SAFE_FILE = 0o600;

function canonicalTimestamp(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError("Flowcordia migration completion time is invalid.");
  }
  return value;
}

function withoutDigest(evidence) {
  return {
    schemaVersion: evidence.schemaVersion,
    kind: evidence.kind,
    state: evidence.state,
    releaseId: evidence.releaseId,
    version: evidence.version,
    applicationCommitSha: evidence.applicationCommitSha,
    imageDigest: evidence.imageDigest,
    manifestSha256: evidence.manifestSha256,
    migrations: evidence.migrations,
    completedAt: evidence.completedAt,
  };
}

export function createFlowcordiaMigrationCompletionEvidence(release, completedAt) {
  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    kind: "flowcordia-self-host-migration",
    state: "COMPLETED",
    releaseId: release.releaseId,
    version: release.version,
    applicationCommitSha: release.applicationCommitSha,
    imageDigest: release.image.digest,
    manifestSha256: release.manifestSha256,
    migrations: release.migrations,
    completedAt: canonicalTimestamp(completedAt),
  };
  return { ...evidence, evidenceSha256: flowcordiaSha256(evidence) };
}

async function safeEvidenceDirectory(path) {
  if (!isAbsolute(path)) {
    throw new TypeError("Flowcordia migration evidence directory must be absolute.");
  }
  await mkdir(path, { recursive: true, mode: SAFE_DIRECTORY });
  const information = await lstat(path);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new TypeError("Flowcordia migration evidence directory is unsafe.");
  }
  await chmod(path, SAFE_DIRECTORY);
  return resolve(path);
}

export async function writeFlowcordiaMigrationCompletionEvidence(path, evidence) {
  const directory = await safeEvidenceDirectory(path);
  const target = join(directory, `${evidence.releaseId}.json`);
  const temporary = join(directory, `.${evidence.releaseId}.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(temporary, "wx", SAFE_FILE);
  try {
    await handle.writeFile(
      `${JSON.stringify(canonicalFlowcordiaValue(evidence), null, 2)}\n`,
      "utf8"
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    if (error?.code === "EEXIST") {
      throw new TypeError("Flowcordia migration completion evidence already exists.");
    }
    throw error;
  }
  await rm(temporary, { force: true });
  return target;
}

async function main() {
  const release = await verifyFlowcordiaReleaseProcess({
    path: process.env.FLOWCORDIA_RELEASE_MANIFEST_PATH,
    expectedManifestDigest: process.env.FLOWCORDIA_RELEASE_MANIFEST_SHA256,
    applicationCommitSha: process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA,
    imageDigest: process.env.FLOWCORDIA_IMAGE_DIGEST,
    component: "migration",
  });
  if (process.env.FLOWCORDIA_MIGRATION_CONFIRM !== release.releaseId) {
    throw new TypeError("Flowcordia migration confirmation does not match the selected release.");
  }
  const completedAt = canonicalTimestamp(
    process.env.FLOWCORDIA_MIGRATION_COMPLETED_AT ?? new Date().toISOString()
  );
  const evidence = createFlowcordiaMigrationCompletionEvidence(release, completedAt);
  const target = await writeFlowcordiaMigrationCompletionEvidence(
    process.env.FLOWCORDIA_MIGRATION_EVIDENCE_DIR ?? "/var/lib/flowcordia/migration",
    evidence
  );
  console.log("Flowcordia release migrations: COMPLETED");
  console.log(`Release: ${evidence.releaseId}`);
  console.log(`Evidence digest: ${evidence.evidenceSha256}`);
  console.log(`Evidence: ${target}`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  void main().catch(() => {
    console.error("Flowcordia migration completion evidence failed safely.");
    process.exitCode = 1;
  });
}
