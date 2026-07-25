import { flowcordiaRecoverySha256 } from "./database-recovery";
import {
  parseFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseDistributionManifest,
} from "./release-distribution";

export const FLOWCORDIA_BUNDLED_RELEASE_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_BUNDLED_RELEASE_PLATFORM = "linux/amd64" as const;

export const FLOWCORDIA_BUNDLED_IMAGE_BINDINGS = [
  { name: "postgres", environmentKey: "FLOWCORDIA_POSTGRES_IMAGE_REFERENCE" },
  { name: "redis", environmentKey: "FLOWCORDIA_REDIS_IMAGE_REFERENCE" },
  { name: "electric", environmentKey: "FLOWCORDIA_ELECTRIC_IMAGE_REFERENCE" },
  { name: "clickhouse", environmentKey: "FLOWCORDIA_CLICKHOUSE_IMAGE_REFERENCE" },
  { name: "minio", environmentKey: "FLOWCORDIA_MINIO_IMAGE_REFERENCE" },
  { name: "registry", environmentKey: "FLOWCORDIA_REGISTRY_IMAGE_REFERENCE" },
  { name: "busybox", environmentKey: "FLOWCORDIA_BUSYBOX_IMAGE_REFERENCE" },
  { name: "docker_socket_proxy", environmentKey: "FLOWCORDIA_DOCKER_PROXY_IMAGE_REFERENCE" },
  { name: "supervisor", environmentKey: "FLOWCORDIA_SUPERVISOR_IMAGE_REFERENCE" },
  { name: "s2", environmentKey: "FLOWCORDIA_S2_IMAGE_REFERENCE" },
] as const;

export type FlowcordiaBundledImageName =
  (typeof FLOWCORDIA_BUNDLED_IMAGE_BINDINGS)[number]["name"];

export interface FlowcordiaBundledReleaseManifest {
  schemaVersion: "0.1";
  kind: "flowcordia-bundled-self-host-release";
  compatibilityVersion: number;
  platform: "linux/amd64";
  createdAt: string;
  application: {
    releaseId: string;
    version: string;
    applicationCommitSha: string;
    manifestSha256: string;
    imageDigest: string;
  };
  images: Array<{
    name: FlowcordiaBundledImageName;
    reference: string;
    digest: string;
  }>;
  manifestSha256: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
const IMMUTABLE_OCI_REFERENCE =
  /^(?<repository>[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*)(?::(?<tag>[A-Za-z0-9_][A-Za-z0-9._-]{0,127}))?@sha256:(?<digest>[0-9a-f]{64})$/;

export class FlowcordiaBundledReleaseError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaBundledReleaseError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaBundledReleaseError("invalid_object", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowcordiaBundledReleaseError(
      "unexpected_fields",
      `${label} has unexpected fields.`
    );
  }
}

function positiveVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 9999) {
    throw new FlowcordiaBundledReleaseError(
      "invalid_compatibility_version",
      "Bundled compatibility version must be an integer from 1 through 9999."
    );
  }
  return Number(value);
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new FlowcordiaBundledReleaseError("invalid_time", "Bundle creation time is invalid.");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaBundledReleaseError("invalid_time", "Bundle creation time is invalid.");
  }
  return value;
}

export function parseFlowcordiaImmutableImageReference(value: unknown): {
  reference: string;
  digest: string;
} {
  if (typeof value !== "string") {
    throw new FlowcordiaBundledReleaseError(
      "invalid_image",
      "Bundled dependency image is invalid."
    );
  }
  const match = IMMUTABLE_OCI_REFERENCE.exec(value.trim());
  const digest = match?.groups?.digest;
  if (!digest) {
    throw new FlowcordiaBundledReleaseError(
      "mutable_image",
      "Every bundled dependency image must use a lowercase immutable @sha256 reference."
    );
  }
  return { reference: value.trim(), digest };
}

function applicationIdentity(
  release: FlowcordiaReleaseDistributionManifest
): FlowcordiaBundledReleaseManifest["application"] {
  return {
    releaseId: release.releaseId,
    version: release.version,
    applicationCommitSha: release.applicationCommitSha,
    manifestSha256: release.manifestSha256,
    imageDigest: release.image.digest,
  };
}

function withoutDigest(
  manifest:
    | Omit<FlowcordiaBundledReleaseManifest, "manifestSha256">
    | FlowcordiaBundledReleaseManifest
): Omit<FlowcordiaBundledReleaseManifest, "manifestSha256"> {
  return {
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    compatibilityVersion: manifest.compatibilityVersion,
    platform: manifest.platform,
    createdAt: manifest.createdAt,
    application: manifest.application,
    images: manifest.images,
  };
}

export function flowcordiaBundledReleaseSha256(
  manifest: Omit<FlowcordiaBundledReleaseManifest, "manifestSha256">
): string {
  return flowcordiaRecoverySha256(manifest);
}

export function createFlowcordiaBundledReleaseManifest(input: {
  compatibilityVersion: number;
  createdAt: Date;
  applicationManifest: unknown;
  environment: Record<string, string | undefined>;
}): FlowcordiaBundledReleaseManifest {
  if (Number.isNaN(input.createdAt.getTime())) {
    throw new FlowcordiaBundledReleaseError("invalid_time", "Bundle creation time is invalid.");
  }
  const release = parseFlowcordiaReleaseDistributionManifest(input.applicationManifest);
  const images = FLOWCORDIA_BUNDLED_IMAGE_BINDINGS.map(({ name, environmentKey }) => {
    const parsed = parseFlowcordiaImmutableImageReference(input.environment[environmentKey]);
    return { name, ...parsed };
  });
  if (new Set(images.map((candidate) => candidate.reference)).size !== images.length) {
    throw new FlowcordiaBundledReleaseError(
      "duplicate_image",
      "Bundled dependency images must use distinct immutable references."
    );
  }

  const manifestWithoutDigest: Omit<FlowcordiaBundledReleaseManifest, "manifestSha256"> = {
    schemaVersion: FLOWCORDIA_BUNDLED_RELEASE_SCHEMA_VERSION,
    kind: "flowcordia-bundled-self-host-release",
    compatibilityVersion: positiveVersion(input.compatibilityVersion),
    platform: FLOWCORDIA_BUNDLED_RELEASE_PLATFORM,
    createdAt: input.createdAt.toISOString(),
    application: applicationIdentity(release),
    images,
  };
  return {
    ...manifestWithoutDigest,
    manifestSha256: flowcordiaBundledReleaseSha256(manifestWithoutDigest),
  };
}

export function parseFlowcordiaBundledReleaseManifest(
  value: unknown
): FlowcordiaBundledReleaseManifest {
  const manifest = record(value, "Bundled release manifest");
  exactKeys(
    manifest,
    [
      "application",
      "compatibilityVersion",
      "createdAt",
      "images",
      "kind",
      "manifestSha256",
      "platform",
      "schemaVersion",
    ],
    "Bundled release manifest"
  );
  if (
    manifest.schemaVersion !== FLOWCORDIA_BUNDLED_RELEASE_SCHEMA_VERSION ||
    manifest.kind !== "flowcordia-bundled-self-host-release" ||
    manifest.platform !== FLOWCORDIA_BUNDLED_RELEASE_PLATFORM
  ) {
    throw new FlowcordiaBundledReleaseError(
      "invalid_schema",
      "Bundled release manifest schema or platform is unsupported."
    );
  }

  const application = record(manifest.application, "Bundled application identity");
  exactKeys(
    application,
    ["applicationCommitSha", "imageDigest", "manifestSha256", "releaseId", "version"],
    "Bundled application identity"
  );
  for (const [key, candidate] of Object.entries(application)) {
    if (typeof candidate !== "string" || candidate.length === 0) {
      throw new FlowcordiaBundledReleaseError(
        "invalid_application",
        `Bundled application ${key} is invalid.`
      );
    }
  }
  for (const key of ["imageDigest", "manifestSha256"] as const) {
    if (!SHA256.test(String(application[key]))) {
      throw new FlowcordiaBundledReleaseError(
        "invalid_application",
        `Bundled application ${key} is invalid.`
      );
    }
  }
  if (!/^[0-9a-f]{40}$/.test(String(application.applicationCommitSha))) {
    throw new FlowcordiaBundledReleaseError(
      "invalid_application",
      "Bundled application revision is invalid."
    );
  }

  if (
    !Array.isArray(manifest.images) ||
    manifest.images.length !== FLOWCORDIA_BUNDLED_IMAGE_BINDINGS.length
  ) {
    throw new FlowcordiaBundledReleaseError(
      "invalid_images",
      "Bundled dependency image inventory is incomplete."
    );
  }
  const images = manifest.images.map((candidate, index) => {
    const image = record(candidate, `Bundled dependency image ${index}`);
    exactKeys(image, ["digest", "name", "reference"], `Bundled dependency image ${index}`);
    const expectedName = FLOWCORDIA_BUNDLED_IMAGE_BINDINGS[index]!.name;
    if (image.name !== expectedName) {
      throw new FlowcordiaBundledReleaseError(
        "invalid_images",
        "Bundled dependency images must use the canonical order."
      );
    }
    const parsed = parseFlowcordiaImmutableImageReference(image.reference);
    if (image.digest !== parsed.digest) {
      throw new FlowcordiaBundledReleaseError(
        "image_mismatch",
        `Bundled dependency image ${expectedName} digest does not match its reference.`
      );
    }
    return { name: expectedName, ...parsed };
  });
  if (new Set(images.map((candidate) => candidate.reference)).size !== images.length) {
    throw new FlowcordiaBundledReleaseError(
      "duplicate_image",
      "Bundled dependency images must use distinct immutable references."
    );
  }

  const manifestSha256 =
    typeof manifest.manifestSha256 === "string" && SHA256.test(manifest.manifestSha256)
      ? manifest.manifestSha256
      : null;
  if (!manifestSha256) {
    throw new FlowcordiaBundledReleaseError(
      "invalid_digest",
      "Bundled release manifest digest is invalid."
    );
  }
  const parsed: FlowcordiaBundledReleaseManifest = {
    schemaVersion: FLOWCORDIA_BUNDLED_RELEASE_SCHEMA_VERSION,
    kind: "flowcordia-bundled-self-host-release",
    compatibilityVersion: positiveVersion(manifest.compatibilityVersion),
    platform: FLOWCORDIA_BUNDLED_RELEASE_PLATFORM,
    createdAt: canonicalTimestamp(manifest.createdAt),
    application: {
      releaseId: String(application.releaseId),
      version: String(application.version),
      applicationCommitSha: String(application.applicationCommitSha),
      manifestSha256: String(application.manifestSha256),
      imageDigest: String(application.imageDigest),
    },
    images,
    manifestSha256,
  };
  if (flowcordiaBundledReleaseSha256(withoutDigest(parsed)) !== parsed.manifestSha256) {
    throw new FlowcordiaBundledReleaseError(
      "manifest_mismatch",
      "Bundled release manifest digest does not match its canonical content."
    );
  }
  return parsed;
}

export function assertFlowcordiaBundledReleaseEnvironment(input: {
  environment: Record<string, string | undefined>;
  applicationManifest: unknown;
  bundledManifest: unknown;
}): FlowcordiaBundledReleaseManifest {
  const application = parseFlowcordiaReleaseDistributionManifest(input.applicationManifest);
  const bundled = parseFlowcordiaBundledReleaseManifest(input.bundledManifest);
  if (
    bundled.application.releaseId !== application.releaseId ||
    bundled.application.version !== application.version ||
    bundled.application.applicationCommitSha !== application.applicationCommitSha ||
    bundled.application.manifestSha256 !== application.manifestSha256 ||
    bundled.application.imageDigest !== application.image.digest
  ) {
    throw new FlowcordiaBundledReleaseError(
      "application_mismatch",
      "Bundled release identity does not match the selected Flowcordia application release."
    );
  }
  for (const [index, binding] of FLOWCORDIA_BUNDLED_IMAGE_BINDINGS.entries()) {
    if (input.environment[binding.environmentKey]?.trim() !== bundled.images[index]!.reference) {
      throw new FlowcordiaBundledReleaseError(
        "environment_mismatch",
        `${binding.environmentKey} does not match the immutable bundled release manifest.`
      );
    }
  }
  if (
    input.environment.FLOWCORDIA_BUNDLED_RELEASE_MANIFEST_SHA256?.trim() !==
    bundled.manifestSha256
  ) {
    throw new FlowcordiaBundledReleaseError(
      "environment_mismatch",
      "Bundled release manifest digest does not match deployment configuration."
    );
  }
  return bundled;
}
