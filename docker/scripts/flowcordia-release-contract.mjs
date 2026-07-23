import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

export const FLOWCORDIA_RELEASE_COMPONENTS = ["web", "operations_worker"];

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/;
const IMAGE_REFERENCE = /^ghcr\.io\/[a-z0-9][a-z0-9._/-]*@sha256:([0-9a-f]{64})$/;

export class FlowcordiaReleaseContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FlowcordiaReleaseContractError";
    this.code = code;
  }
}

export function canonicalFlowcordiaValue(value) {
  if (Array.isArray(value)) return value.map(canonicalFlowcordiaValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalFlowcordiaValue(child)])
    );
  }
  return value;
}

export function flowcordiaSha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonicalFlowcordiaValue(value)))
    .digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaReleaseContractError("invalid_object", `${label} is invalid.`);
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowcordiaReleaseContractError(
      "unexpected_fields",
      `${label} has unexpected fields.`
    );
  }
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

export function parseFlowcordiaReleaseManifest(value) {
  exactKeys(
    value,
    [
      "applicationCommitSha",
      "components",
      "createdAt",
      "image",
      "kind",
      "manifestSha256",
      "migrations",
      "releaseId",
      "runtime",
      "schemaVersion",
      "upstreamCommitSha",
      "version",
    ],
    "Flowcordia release manifest"
  );
  exactKeys(value.runtime, ["node", "pnpm"], "Flowcordia release runtime");
  exactKeys(value.image, ["digest", "reference"], "Flowcordia release image");
  exactKeys(value.migrations, ["count", "sha256"], "Flowcordia release migrations");

  const imageMatch = IMAGE_REFERENCE.exec(value.image.reference ?? "");
  const components = Array.isArray(value.components) ? value.components : [];
  if (
    value.schemaVersion !== "0.1" ||
    value.kind !== "flowcordia-self-host-release" ||
    !RELEASE_ID.test(value.releaseId ?? "") ||
    !VERSION.test(value.version ?? "") ||
    !SHA.test(value.applicationCommitSha ?? "") ||
    /^([0-9a-f])\1{39}$/.test(value.applicationCommitSha ?? "") ||
    !SHA.test(value.upstreamCommitSha ?? "") ||
    /^([0-9a-f])\1{39}$/.test(value.upstreamCommitSha ?? "") ||
    value.runtime.node !== "20.20.2" ||
    value.runtime.pnpm !== "10.33.2" ||
    imageMatch?.[1] !== value.image.digest ||
    !SHA256.test(value.image.digest ?? "") ||
    !Number.isSafeInteger(value.migrations.count) ||
    value.migrations.count < 1 ||
    !SHA256.test(value.migrations.sha256 ?? "") ||
    !SHA256.test(value.manifestSha256 ?? "")
  ) {
    throw new FlowcordiaReleaseContractError(
      "invalid_manifest",
      "Flowcordia release manifest is invalid."
    );
  }

  const createdAt = new Date(value.createdAt);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== value.createdAt) {
    throw new FlowcordiaReleaseContractError(
      "invalid_time",
      "Flowcordia release creation time is invalid."
    );
  }

  if (components.length !== FLOWCORDIA_RELEASE_COMPONENTS.length) {
    throw new FlowcordiaReleaseContractError(
      "invalid_components",
      "Flowcordia release components are invalid."
    );
  }
  for (const [index, component] of components.entries()) {
    exactKeys(
      component,
      ["applicationCommitSha", "imageDigest", "name"],
      "Flowcordia release component"
    );
    if (
      component.name !== FLOWCORDIA_RELEASE_COMPONENTS[index] ||
      component.applicationCommitSha !== value.applicationCommitSha ||
      component.imageDigest !== value.image.digest
    ) {
      throw new FlowcordiaReleaseContractError(
        "invalid_components",
        "Flowcordia release components do not share one immutable identity."
      );
    }
  }

  if (flowcordiaSha256(withoutManifestDigest(value)) !== value.manifestSha256) {
    throw new FlowcordiaReleaseContractError(
      "invalid_manifest_digest",
      "Flowcordia release manifest digest is invalid."
    );
  }
  return value;
}

export async function readFlowcordiaReleaseManifest(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new FlowcordiaReleaseContractError(
      "invalid_manifest_path",
      "Flowcordia release manifest path is invalid."
    );
  }
  const first = await lstat(path);
  if (first.isSymbolicLink() || !first.isFile() || first.size < 2 || first.size > 64 * 1024) {
    throw new FlowcordiaReleaseContractError(
      "unsafe_manifest",
      "Flowcordia release manifest is unavailable or unsafe."
    );
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
    throw new FlowcordiaReleaseContractError(
      "changed_manifest",
      "Flowcordia release manifest changed while being read."
    );
  }
  try {
    return parseFlowcordiaReleaseManifest(JSON.parse(source));
  } catch (error) {
    if (error instanceof FlowcordiaReleaseContractError) throw error;
    throw new FlowcordiaReleaseContractError(
      "malformed_manifest",
      "Flowcordia release manifest is malformed."
    );
  }
}

export async function verifyFlowcordiaReleaseProcess(input) {
  if (!SHA256.test(input.expectedManifestDigest ?? "")) {
    throw new FlowcordiaReleaseContractError(
      "invalid_deployment_manifest",
      "Flowcordia deployment manifest identity is invalid."
    );
  }
  if (
    !SHA.test(input.applicationCommitSha ?? "") ||
    /^([0-9a-f])\1{39}$/.test(input.applicationCommitSha ?? "")
  ) {
    throw new FlowcordiaReleaseContractError(
      "invalid_application",
      "Flowcordia deployment application identity is invalid."
    );
  }
  if (!SHA256.test(input.imageDigest ?? "")) {
    throw new FlowcordiaReleaseContractError(
      "invalid_image",
      "Flowcordia deployment image identity is invalid."
    );
  }
  if (input.component !== "migration" && !FLOWCORDIA_RELEASE_COMPONENTS.includes(input.component)) {
    throw new FlowcordiaReleaseContractError(
      "invalid_component",
      "Flowcordia release process role is invalid."
    );
  }

  const release = await readFlowcordiaReleaseManifest(input.path);
  if (
    release.runtime.node !== process.versions.node ||
    release.manifestSha256 !== input.expectedManifestDigest ||
    release.applicationCommitSha !== input.applicationCommitSha ||
    release.image.digest !== input.imageDigest
  ) {
    throw new FlowcordiaReleaseContractError(
      "identity_mismatch",
      "Flowcordia release manifest does not match the selected deployment."
    );
  }
  if (input.component !== "migration") {
    const selected = release.components.find((candidate) => candidate.name === input.component);
    if (
      !selected ||
      selected.applicationCommitSha !== input.applicationCommitSha ||
      selected.imageDigest !== input.imageDigest
    ) {
      throw new FlowcordiaReleaseContractError(
        "component_mismatch",
        "Flowcordia release component does not match the selected deployment."
      );
    }
  }
  return release;
}
