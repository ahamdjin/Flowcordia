#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;

export class FlowcordiaConnectedCampaignFinalizationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FlowcordiaConnectedCampaignFinalizationError";
    this.code = code;
  }
}

function command(executable, args) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    throw new FlowcordiaConnectedCampaignFinalizationError(
      "COMMAND_FAILED",
      "Final release manifest download failed safely."
    );
  }
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaConnectedCampaignFinalizationError(
      "INVALID_EVIDENCE",
      `${label} is invalid.`
    );
  }
  return value;
}

function bounded(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new FlowcordiaConnectedCampaignFinalizationError(
      "IDENTITY_MISMATCH",
      `${label} is invalid.`
    );
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function finalizeFlowcordiaConnectedCampaignReceipt(input) {
  const receipt = object(input.receipt, "Campaign receipt");
  const manifest = object(input.manifest, "Launch manifest");
  if (
    receipt.schemaVersion !== "0.1" ||
    receipt.kind !== "flowcordia-connected-release-campaign" ||
    receipt.result !== "READY"
  ) {
    throw new FlowcordiaConnectedCampaignFinalizationError(
      "INVALID_RECEIPT",
      "Campaign receipt is not READY."
    );
  }
  if (
    manifest.schemaVersion !== "0.6" ||
    manifest.result !== "ACCEPTED" ||
    !Array.isArray(manifest.sourceRuns) ||
    manifest.sourceRuns.length !== 10 ||
    new Set(manifest.sourceRuns.map((source) => source?.runId)).size !== 10
  ) {
    throw new FlowcordiaConnectedCampaignFinalizationError(
      "INVALID_MANIFEST",
      "Launch manifest is not an accepted ten-source schema 0.6 dossier."
    );
  }

  const releaseId = bounded(receipt.releaseId, RELEASE_ID, "receipt.releaseId");
  const applicationCommitSha = bounded(
    receipt.applicationCommitSha,
    SHA,
    "receipt.applicationCommitSha"
  );
  const workflowId = bounded(receipt.workflowId, WORKFLOW_ID, "receipt.workflowId");
  const proposalId = bounded(receipt.proposalId, PUBLIC_ID, "receipt.proposalId");
  const bundledManifestSha256 = bounded(
    receipt.bundledManifestSha256,
    SHA256,
    "receipt.bundledManifestSha256"
  );
  const manifestSha256 = bounded(
    manifest.manifestSha256,
    SHA256,
    "manifest.manifestSha256"
  );
  const bundled = object(manifest.bundledSelfHost, "manifest.bundledSelfHost");
  if (
    manifest.releaseId !== releaseId ||
    manifest.applicationCommitSha !== applicationCommitSha ||
    manifest.workflowId !== workflowId ||
    manifest.proposalId !== proposalId ||
    bundled.bundledManifestSha256 !== bundledManifestSha256 ||
    bundled.compatibilityVersion !== receipt.bundledCompatibilityVersion
  ) {
    throw new FlowcordiaConnectedCampaignFinalizationError(
      "IDENTITY_MISMATCH",
      "Launch manifest does not match the exact connected campaign lineage."
    );
  }

  const { receiptSha256: _previousDigest, ...withoutPreviousDigest } = receipt;
  const finalizedWithoutDigest = {
    ...withoutPreviousDigest,
    launchManifestSha256: manifestSha256,
    launchManifestSourceRunCount: manifest.sourceRuns.length,
    finalizedAt: input.finalizedAt,
  };
  return {
    ...finalizedWithoutDigest,
    receiptSha256: digest(JSON.stringify(finalizedWithoutDigest)),
  };
}

function parseArguments(argv) {
  const values = { receiptPath: null, outputPath: null, repository: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!value) {
      throw new FlowcordiaConnectedCampaignFinalizationError(
        "INVALID_ARGUMENTS",
        "Finalization arguments are incomplete."
      );
    }
    if (argument === "--receipt") values.receiptPath = resolve(value);
    else if (argument === "--output") values.outputPath = resolve(value);
    else if (argument === "--repository") values.repository = value;
    else {
      throw new FlowcordiaConnectedCampaignFinalizationError(
        "INVALID_ARGUMENTS",
        "Finalization argument is unknown."
      );
    }
    index += 1;
  }
  if (!values.receiptPath || !values.outputPath || !values.repository) {
    throw new FlowcordiaConnectedCampaignFinalizationError(
      "INVALID_ARGUMENTS",
      "Finalization arguments are incomplete."
    );
  }
  return values;
}

export function run(argv) {
  const options = parseArguments(argv);
  const receipt = JSON.parse(readFileSync(options.receiptPath, "utf8"));
  const assembleStage = Array.isArray(receipt.stages)
    ? receipt.stages.find((stage) => stage?.stage === "assemble")
    : null;
  if (!assembleStage || !Number.isSafeInteger(assembleStage.runId) || assembleStage.runId < 1) {
    throw new FlowcordiaConnectedCampaignFinalizationError(
      "ASSEMBLER_MISSING",
      "Campaign receipt is missing the official assembler run."
    );
  }
  const releaseId = bounded(receipt.releaseId, RELEASE_ID, "receipt.releaseId");
  const privateRoot = mkdtempSync(join(tmpdir(), "flowcordia-campaign-finalize-"));
  try {
    const artifactName = `flowcordia-release-manifest-${releaseId}-${assembleStage.runId}`;
    command("gh", [
      "run",
      "download",
      String(assembleStage.runId),
      "--repo",
      options.repository,
      "--name",
      artifactName,
      "--dir",
      privateRoot,
    ]);
    const entries = readdirSync(privateRoot, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && entry.name.endsWith(".json")
    );
    if (entries.length !== 1) {
      throw new FlowcordiaConnectedCampaignFinalizationError(
        "MANIFEST_AMBIGUOUS",
        "Assembler artifact must contain exactly one launch manifest."
      );
    }
    const manifest = JSON.parse(readFileSync(join(privateRoot, entries[0].name), "utf8"));
    const finalized = finalizeFlowcordiaConnectedCampaignReceipt({
      receipt,
      manifest,
      finalizedAt: new Date().toISOString(),
    });
    mkdirSync(resolve(options.outputPath, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(options.outputPath, `${JSON.stringify(finalized, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return finalized;
  } finally {
    rmSync(privateRoot, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    run(process.argv.slice(2));
  } catch {
    process.stderr.write("Flowcordia connected release campaign finalization failed safely.\n");
    process.exitCode = 1;
  }
}
