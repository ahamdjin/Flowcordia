import { flowcordiaRecoverySha256 } from "./database-recovery";
import type { FlowcordiaMigrationArtifact } from "./upgrade-preflight";

export const FLOWCORDIA_RELEASE_DISTRIBUTION_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_RELEASE_NODE_VERSION = "20.20.2" as const;
export const FLOWCORDIA_RELEASE_PNPM_VERSION = "10.33.2" as const;

export type FlowcordiaReleaseComponentName = "web" | "operations_worker";

export interface FlowcordiaReleaseDistributionManifest {
  schemaVersion: "0.1";
  kind: "flowcordia-self-host-release";
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  upstreamCommitSha: string;
  createdAt: string;
  runtime: {
    node: "20.20.2";
    pnpm: "10.33.2";
  };
  image: {
    reference: string;
    digest: string;
  };
  components: Array<{
    name: FlowcordiaReleaseComponentName;
    applicationCommitSha: string;
    imageDigest: string;
  }>;
  migrations: {
    count: number;
    sha256: string;
  };
  manifestSha256: string;
}

const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/;
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OCI_REFERENCE =
  /^(?<repository>[a-z0-9][a-z0-9._:-]*(?:\/[a-z0-9][a-z0-9._-]*)+)@sha256:(?<digest>[0-9a-f]{64})$/;
const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9_]+$/;
const COMPONENTS: readonly FlowcordiaReleaseComponentName[] = ["web", "operations_worker"];

export class FlowcordiaReleaseDistributionError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaReleaseDistributionError";
  }
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowcordiaReleaseDistributionError(
      "unexpected_fields",
      `${label} has unexpected fields.`
    );
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaReleaseDistributionError("invalid_object", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function releaseId(value: unknown): string {
  if (typeof value !== "string" || !RELEASE_ID.test(value)) {
    throw new FlowcordiaReleaseDistributionError("invalid_release", "Release identity is invalid.");
  }
  return value;
}

function version(value: unknown): string {
  if (typeof value !== "string" || !VERSION.test(value)) {
    throw new FlowcordiaReleaseDistributionError("invalid_version", "Release version is invalid.");
  }
  return value;
}

function applicationSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA.test(value) || /^([0-9a-f])\1{39}$/.test(value)) {
    throw new FlowcordiaReleaseDistributionError("invalid_revision", `${label} is invalid.`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new FlowcordiaReleaseDistributionError("invalid_digest", `${label} is invalid.`);
  }
  return value;
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new FlowcordiaReleaseDistributionError(
      "invalid_time",
      "Release creation time is invalid."
    );
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaReleaseDistributionError(
      "invalid_time",
      "Release creation time is invalid."
    );
  }
  return value;
}

function immutableImage(value: unknown): { reference: string; digest: string } {
  if (typeof value !== "string") {
    throw new FlowcordiaReleaseDistributionError("invalid_image", "Release image is invalid.");
  }
  const match = OCI_REFERENCE.exec(value);
  const digest = match?.groups?.digest;
  if (!digest) {
    throw new FlowcordiaReleaseDistributionError(
      "mutable_image",
      "Release image must use one lowercase immutable sha256 digest reference."
    );
  }
  return { reference: value, digest };
}

function migrations(
  value: readonly FlowcordiaMigrationArtifact[]
): FlowcordiaReleaseDistributionManifest["migrations"] {
  if (
    value.length === 0 ||
    value.length !== new Set(value.map((artifact) => artifact.name)).size ||
    value.some(
      (artifact) => !MIGRATION_NAME.test(artifact.name) || !SHA256.test(artifact.checksum)
    ) ||
    value.some((artifact, index) => index > 0 && value[index - 1]!.name >= artifact.name)
  ) {
    throw new FlowcordiaReleaseDistributionError(
      "invalid_migrations",
      "Release migration inventory must be complete, unique, ordered, and checksum-bound."
    );
  }
  return {
    count: value.length,
    sha256: flowcordiaRecoverySha256(
      value.map((artifact) => ({ name: artifact.name, checksum: artifact.checksum }))
    ),
  };
}

function withoutDigest(
  manifest:
    | Omit<FlowcordiaReleaseDistributionManifest, "manifestSha256">
    | FlowcordiaReleaseDistributionManifest
): Omit<FlowcordiaReleaseDistributionManifest, "manifestSha256"> {
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

export function flowcordiaReleaseDistributionSha256(
  manifest: Omit<FlowcordiaReleaseDistributionManifest, "manifestSha256">
): string {
  return flowcordiaRecoverySha256(manifest);
}

export function createFlowcordiaReleaseDistributionManifest(input: {
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  upstreamCommitSha: string;
  createdAt: Date;
  imageReference: string;
  migrations: readonly FlowcordiaMigrationArtifact[];
}): FlowcordiaReleaseDistributionManifest {
  if (Number.isNaN(input.createdAt.getTime())) {
    throw new FlowcordiaReleaseDistributionError(
      "invalid_time",
      "Release creation time is invalid."
    );
  }
  const applicationCommitSha = applicationSha(input.applicationCommitSha, "Application revision");
  const image = immutableImage(input.imageReference);
  const manifestWithoutDigest: Omit<FlowcordiaReleaseDistributionManifest, "manifestSha256"> = {
    schemaVersion: FLOWCORDIA_RELEASE_DISTRIBUTION_SCHEMA_VERSION,
    kind: "flowcordia-self-host-release",
    releaseId: releaseId(input.releaseId),
    version: version(input.version),
    applicationCommitSha,
    upstreamCommitSha: applicationSha(input.upstreamCommitSha, "Trigger.dev upstream revision"),
    createdAt: input.createdAt.toISOString(),
    runtime: {
      node: FLOWCORDIA_RELEASE_NODE_VERSION,
      pnpm: FLOWCORDIA_RELEASE_PNPM_VERSION,
    },
    image,
    components: COMPONENTS.map((name) => ({
      name,
      applicationCommitSha,
      imageDigest: image.digest,
    })),
    migrations: migrations(input.migrations),
  };
  return {
    ...manifestWithoutDigest,
    manifestSha256: flowcordiaReleaseDistributionSha256(manifestWithoutDigest),
  };
}

export function parseFlowcordiaReleaseDistributionManifest(
  value: unknown
): FlowcordiaReleaseDistributionManifest {
  const manifest = record(value, "Release manifest");
  exactKeys(
    manifest,
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
    "Release manifest"
  );
  if (
    manifest.schemaVersion !== FLOWCORDIA_RELEASE_DISTRIBUTION_SCHEMA_VERSION ||
    manifest.kind !== "flowcordia-self-host-release"
  ) {
    throw new FlowcordiaReleaseDistributionError(
      "invalid_schema",
      "Release manifest schema is invalid."
    );
  }

  const applicationCommitSha = applicationSha(
    manifest.applicationCommitSha,
    "Application revision"
  );
  const parsedImage = record(manifest.image, "Release image");
  exactKeys(parsedImage, ["digest", "reference"], "Release image");
  const image = immutableImage(parsedImage.reference);
  if (sha256(parsedImage.digest, "Release image digest") !== image.digest) {
    throw new FlowcordiaReleaseDistributionError(
      "image_mismatch",
      "Release image digest does not match its immutable reference."
    );
  }

  const runtime = record(manifest.runtime, "Release runtime");
  exactKeys(runtime, ["node", "pnpm"], "Release runtime");
  if (
    runtime.node !== FLOWCORDIA_RELEASE_NODE_VERSION ||
    runtime.pnpm !== FLOWCORDIA_RELEASE_PNPM_VERSION
  ) {
    throw new FlowcordiaReleaseDistributionError(
      "runtime_mismatch",
      "Release runtime does not match the supported FlowCordia toolchain."
    );
  }

  if (!Array.isArray(manifest.components) || manifest.components.length !== COMPONENTS.length) {
    throw new FlowcordiaReleaseDistributionError(
      "invalid_components",
      "Release components are invalid."
    );
  }
  const components = manifest.components.map((candidate, index) => {
    const component = record(candidate, `Release component ${index}`);
    exactKeys(
      component,
      ["applicationCommitSha", "imageDigest", "name"],
      `Release component ${index}`
    );
    if (component.name !== COMPONENTS[index]) {
      throw new FlowcordiaReleaseDistributionError(
        "invalid_components",
        "Release components must use the canonical web and operations-worker order."
      );
    }
    if (
      applicationSha(component.applicationCommitSha, "Component application revision") !==
        applicationCommitSha ||
      sha256(component.imageDigest, "Component image digest") !== image.digest
    ) {
      throw new FlowcordiaReleaseDistributionError(
        "component_mismatch",
        "Every release component must use the exact application revision and immutable image digest."
      );
    }
    return {
      name: component.name as FlowcordiaReleaseComponentName,
      applicationCommitSha,
      imageDigest: image.digest,
    };
  });

  const migrationSummary = record(manifest.migrations, "Release migrations");
  exactKeys(migrationSummary, ["count", "sha256"], "Release migrations");
  if (!Number.isSafeInteger(migrationSummary.count) || Number(migrationSummary.count) <= 0) {
    throw new FlowcordiaReleaseDistributionError(
      "invalid_migrations",
      "Release migration count is invalid."
    );
  }

  const parsed: FlowcordiaReleaseDistributionManifest = {
    schemaVersion: FLOWCORDIA_RELEASE_DISTRIBUTION_SCHEMA_VERSION,
    kind: "flowcordia-self-host-release",
    releaseId: releaseId(manifest.releaseId),
    version: version(manifest.version),
    applicationCommitSha,
    upstreamCommitSha: applicationSha(manifest.upstreamCommitSha, "Trigger.dev upstream revision"),
    createdAt: canonicalTimestamp(manifest.createdAt),
    runtime: {
      node: FLOWCORDIA_RELEASE_NODE_VERSION,
      pnpm: FLOWCORDIA_RELEASE_PNPM_VERSION,
    },
    image,
    components,
    migrations: {
      count: Number(migrationSummary.count),
      sha256: sha256(migrationSummary.sha256, "Release migration digest"),
    },
    manifestSha256: sha256(manifest.manifestSha256, "Release manifest digest"),
  };
  if (flowcordiaReleaseDistributionSha256(withoutDigest(parsed)) !== parsed.manifestSha256) {
    throw new FlowcordiaReleaseDistributionError(
      "manifest_mismatch",
      "Release manifest digest does not match its canonical content."
    );
  }
  return parsed;
}
