#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MANIFEST = "flowcordia/architecture/upstream-ownership.json";
const REF = /^[A-Za-z0-9_./@{}~^:+-]{1,255}$/;
const MAX_CHANGED_PATHS = 10_000;

export function parseArguments(argv) {
  const result = {
    base: null,
    head: "HEAD",
    manifest: DEFAULT_MANIFEST,
    json: false,
    failOnCore: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") result.json = true;
    else if (argument === "--fail-on-core") result.failOnCore = true;
    else if (argument === "--base" || argument === "--head" || argument === "--manifest") {
      const value = argv[index + 1];
      if (!value) throw new TypeError(`${argument} requires a value.`);
      if (argument === "--base") result.base = value;
      else if (argument === "--head") result.head = value;
      else result.manifest = value;
      index += 1;
    } else {
      throw new TypeError(`Unknown argument: ${argument}`);
    }
  }
  if (!result.base) throw new TypeError("--base is required.");
  for (const [name, value] of [
    ["base", result.base],
    ["head", result.head],
  ]) {
    if (!REF.test(value)) throw new TypeError(`${name} reference has an invalid format.`);
  }
  if (result.manifest.includes("\0")) throw new TypeError("Manifest path is invalid.");
  return result;
}

function nonEmptyStringArray(value, key) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
    throw new TypeError(`${key} must be an array of non-empty strings.`);
  }
  const unique = new Set(value);
  if (unique.size !== value.length) throw new TypeError(`${key} cannot contain duplicates.`);
  return [...value];
}

export function parseOwnershipManifest(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new TypeError("Upstream ownership manifest is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Upstream ownership manifest must be an object.");
  }
  const keys = Object.keys(value).sort();
  const expected = [
    "productOwnedPrefixes",
    "reviewedAdapterPaths",
    "reviewedAdapterPrefixes",
    "schemaVersion",
  ].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new TypeError("Upstream ownership manifest has unexpected fields.");
  }
  if (value.schemaVersion !== "0.1") {
    throw new TypeError('Upstream ownership schemaVersion must be "0.1".');
  }
  return {
    schemaVersion: "0.1",
    productOwnedPrefixes: nonEmptyStringArray(value.productOwnedPrefixes, "productOwnedPrefixes"),
    reviewedAdapterPaths: nonEmptyStringArray(value.reviewedAdapterPaths, "reviewedAdapterPaths"),
    reviewedAdapterPrefixes: nonEmptyStringArray(
      value.reviewedAdapterPrefixes,
      "reviewedAdapterPrefixes"
    ),
  };
}

function normalizedPath(path) {
  const value = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!value || value.startsWith("/") || value.split("/").some((part) => part === "..")) {
    throw new TypeError(`Changed path is invalid: ${path}`);
  }
  return value;
}

export function classifyPath(path, manifest) {
  const normalized = normalizedPath(path);
  if (manifest.productOwnedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return "flowcordia_owned";
  }
  if (
    manifest.reviewedAdapterPaths.includes(normalized) ||
    manifest.reviewedAdapterPrefixes.some((prefix) => normalized.startsWith(prefix))
  ) {
    return "reviewed_adapter";
  }
  return "inherited_core";
}

export function parseNameStatus(source) {
  const paths = [];
  for (const line of source.split("\n")) {
    if (!line) continue;
    const fields = line.split("\t");
    const status = fields[0];
    if (!status || fields.length < 2) throw new TypeError("Git diff output is malformed.");
    if (status.startsWith("R") || status.startsWith("C")) {
      if (fields.length !== 3) throw new TypeError("Git rename/copy output is malformed.");
      paths.push({ status, path: normalizedPath(fields[1]), role: "previous" });
      paths.push({ status, path: normalizedPath(fields[2]), role: "current" });
    } else {
      if (fields.length !== 2) throw new TypeError("Git diff output is malformed.");
      paths.push({ status, path: normalizedPath(fields[1]), role: "current" });
    }
    if (paths.length > MAX_CHANGED_PATHS) {
      throw new TypeError(`Changed path count exceeds ${MAX_CHANGED_PATHS}.`);
    }
  }
  return paths;
}

export function buildUpstreamDriftReport({ base, head, entries, manifest }) {
  const classified = entries.map((entry) => ({
    ...entry,
    ownership: classifyPath(entry.path, manifest),
  }));
  const counts = {
    flowcordia_owned: classified.filter((entry) => entry.ownership === "flowcordia_owned").length,
    reviewed_adapter: classified.filter((entry) => entry.ownership === "reviewed_adapter").length,
    inherited_core: classified.filter((entry) => entry.ownership === "inherited_core").length,
  };
  return {
    schemaVersion: "0.1",
    base,
    head,
    counts,
    changedPaths: classified,
    decision: counts.inherited_core > 0 ? "REVIEW_REQUIRED" : "WITHIN_REGISTERED_BOUNDARIES",
  };
}

function executeGitDiff(base, head) {
  const result = spawnSync(
    "git",
    ["diff", "--name-status", "--find-renames", "--find-copies", `${base}...${head}`],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("Git could not compare the requested upstream references.");
  }
  return result.stdout;
}

function renderHuman(report) {
  const lines = [
    `Flowcordia upstream drift: ${report.base}...${report.head}`,
    `Decision: ${report.decision}`,
    `Flowcordia-owned: ${report.counts.flowcordia_owned}`,
    `Reviewed adapters: ${report.counts.reviewed_adapter}`,
    `Inherited core: ${report.counts.inherited_core}`,
  ];
  for (const entry of report.changedPaths) {
    lines.push(`${entry.ownership}\t${entry.status}\t${entry.role}\t${entry.path}`);
  }
  return `${lines.join("\n")}\n`;
}

export function run(argv, dependencies = {}) {
  const options = parseArguments(argv);
  const read = dependencies.readFileSync ?? readFileSync;
  const diff = dependencies.executeGitDiff ?? executeGitDiff;
  const manifest = parseOwnershipManifest(read(resolve(options.manifest), "utf8"));
  const report = buildUpstreamDriftReport({
    base: options.base,
    head: options.head,
    entries: parseNameStatus(diff(options.base, options.head)),
    manifest,
  });
  const output = options.json ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report);
  (dependencies.stdout ?? process.stdout).write(output);
  if (options.failOnCore && report.counts.inherited_core > 0) return 2;
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write("Flowcordia upstream drift report failed safely.\n");
    process.exitCode = 1;
  }
}
