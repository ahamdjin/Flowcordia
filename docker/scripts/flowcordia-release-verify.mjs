#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/;
const IMAGE_REFERENCE = /^ghcr\.io\/[a-z0-9][a-z0-9._/-]*@sha256:([0-9a-f]{64})$/;
const COMPONENTS = ["web", "operations_worker"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

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

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function withoutManifestDigest(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    releaseId: manifest.releaseId,
    version: manifest.version,
    applicationCommitSha: manifest.applicationCommitSha,
    upstreamCommitSha: manifest.upstreamCommitSha,
    createdAt: manifest.createdAt,
    runtime: manifest.runtime,
    image: manifest.image,
    components: manifest.components,
    migrations: manifest.migrations,
  };
}

async function readManifest(path) {
  const first = await lstat(path);
  if (first.isSymbolicLink() || !first.isFile() || first.size < 2 || first.size > 64 * 1024) {
    fail("Flowcordia release manifest is unavailable or unsafe.");
  }
  const source = await readFile(path, "utf8");
  const second = await lstat(path);
  if (
    second.isSymbolicLink() ||
    !second.isFile() ||
    first.dev !== second.dev ||
    first.ino !== second.ino ||
    first.size !== second.size ||
    first.mtimeMs !== second.mtimeMs
  ) {
    fail("Flowcordia release manifest changed while being read.");
  }
  try {
    return JSON.parse(source);
  } catch {
    fail("Flowcordia release manifest is malformed.");
  }
}

function validManifestShape(manifest) {
  const imageMatch = IMAGE_REFERENCE.exec(manifest?.image?.reference ?? "");
  const components = Array.isArray(manifest?.components) ? manifest.components : [];
  const componentIdentityReady =
    components.length === COMPONENTS.length &&
    components.every(
      (candidate, index) =>
        candidate?.name === COMPONENTS[index] &&
        candidate?.applicationCommitSha === manifest.applicationCommitSha &&
        candidate?.imageDigest === manifest.image.digest
    );
  const createdAt = new Date(manifest?.createdAt ?? "");

  return Boolean(
    manifest?.schemaVersion === "0.1" &&
    manifest?.kind === "flowcordia-self-host-release" &&
    RELEASE_ID.test(manifest.releaseId ?? "") &&
    VERSION.test(manifest.version ?? "") &&
    SHA.test(manifest.applicationCommitSha ?? "") &&
    !/^([0-9a-f])\1{39}$/.test(manifest.applicationCommitSha ?? "") &&
    SHA.test(manifest.upstreamCommitSha ?? "") &&
    !/^([0-9a-f])\1{39}$/.test(manifest.upstreamCommitSha ?? "") &&
    Number.isFinite(createdAt.getTime()) &&
    createdAt.toISOString() === manifest.createdAt &&
    manifest.runtime?.node === process.versions.node &&
    manifest.runtime?.pnpm === "10.33.2" &&
    imageMatch?.[1] === manifest.image.digest &&
    SHA256.test(manifest.image.digest ?? "") &&
    componentIdentityReady &&
    Number.isSafeInteger(manifest.migrations?.count) &&
    manifest.migrations.count > 0 &&
    SHA256.test(manifest.migrations?.sha256 ?? "") &&
    SHA256.test(manifest.manifestSha256 ?? "")
  );
}

const path = process.env.FLOWCORDIA_RELEASE_MANIFEST_PATH;
const expectedManifestDigest = process.env.FLOWCORDIA_RELEASE_MANIFEST_SHA256;
const applicationCommitSha = process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA;
const imageDigest = process.env.FLOWCORDIA_IMAGE_DIGEST;
const component = process.argv[2];

if (!path?.startsWith("/") || !SHA256.test(expectedManifestDigest ?? "")) {
  fail("Flowcordia release manifest deployment identity is invalid.");
}
if (
  !SHA.test(applicationCommitSha ?? "") ||
  /^([0-9a-f])\1{39}$/.test(applicationCommitSha ?? "")
) {
  fail("Flowcordia release application identity is invalid.");
}
if (!SHA256.test(imageDigest ?? "")) fail("Flowcordia release image identity is invalid.");
if (component !== "migration" && !COMPONENTS.includes(component)) {
  fail("Flowcordia release process role is invalid.");
}

const release = await readManifest(path);
if (
  !validManifestShape(release) ||
  release.manifestSha256 !== expectedManifestDigest ||
  release.applicationCommitSha !== applicationCommitSha ||
  release.image.digest !== imageDigest ||
  digest(withoutManifestDigest(release)) !== release.manifestSha256
) {
  fail("Flowcordia release manifest does not match the selected deployment.");
}
if (component !== "migration") {
  const selected = release.components.find((candidate) => candidate.name === component);
  if (
    !selected ||
    selected.applicationCommitSha !== applicationCommitSha ||
    selected.imageDigest !== imageDigest
  ) {
    fail("Flowcordia release component does not match the selected deployment.");
  }
}

console.log("Flowcordia release process identity: READY");
console.log(`Release: ${release.releaseId}`);
console.log(`Component: ${component}`);
console.log(`Application: ${release.applicationCommitSha}`);
console.log(`Manifest: ${release.manifestSha256}`);
