import { flowcordiaRecoverySha256 } from "./database-recovery";
import {
  parseFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseDistributionManifest,
} from "./release-distribution";

export const FLOWCORDIA_RELEASE_IMAGE_EVIDENCE_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_RELEASE_IMAGE_WORKFLOW =
  ".github/workflows/flowcordia-publish-self-host-image.yml" as const;
export const FLOWCORDIA_RELEASE_IMAGE_PLATFORM = "linux/amd64" as const;
export const FLOWCORDIA_RELEASE_IMAGE_PREDICATE = "https://slsa.dev/provenance/v1" as const;

export interface FlowcordiaReleaseImageEvidence {
  schemaVersion: "0.1";
  state: "PUBLISHED";
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  upstreamCommitSha: string;
  image: {
    name: string;
    digest: string;
    reference: string;
    platform: "linux/amd64";
  };
  releaseManifestSha256: string;
  workflow: {
    repository: string;
    path: typeof FLOWCORDIA_RELEASE_IMAGE_WORKFLOW;
    runId: string;
    runAttempt: number;
    sourceRef: "refs/heads/main";
  };
  provenance: {
    attestationId: string;
    predicateType: typeof FLOWCORDIA_RELEASE_IMAGE_PREDICATE;
    signerWorkflow: string;
    verified: true;
    sbom: "buildkit-spdx";
  };
  createdAt: string;
  evidenceSha256: string;
}

const REPOSITORY = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9][a-z0-9._-]{0,99}$/;
const IMAGE_NAME = /^ghcr\.io\/[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9][a-z0-9._-]{0,99}$/;
const DECIMAL_ID = /^[1-9][0-9]{0,19}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class FlowcordiaReleaseImageEvidenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaReleaseImageEvidenceError";
  }
}

function repository(value: unknown): string {
  if (typeof value !== "string" || !REPOSITORY.test(value) || value !== value.toLowerCase()) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "invalid_repository",
      "Release image repository identity is invalid."
    );
  }
  return value;
}

function decimalId(value: unknown, label: string): string {
  const normalized = typeof value === "number" ? String(value) : value;
  if (typeof normalized !== "string" || !DECIMAL_ID.test(normalized)) {
    throw new FlowcordiaReleaseImageEvidenceError("invalid_id", `${label} is invalid.`);
  }
  return normalized;
}

function runAttempt(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 1000) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "invalid_attempt",
      "Release image workflow attempt is invalid."
    );
  }
  return Number(value);
}

function timestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new FlowcordiaReleaseImageEvidenceError(
      "invalid_time",
      "Release image publication time is invalid."
    );
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "invalid_time",
      "Release image publication time is invalid."
    );
  }
  return value;
}

function image(manifest: FlowcordiaReleaseDistributionManifest, expectedRepository: string) {
  const separator = "@sha256:";
  const index = manifest.image.reference.indexOf(separator);
  const name = manifest.image.reference.slice(0, index);
  if (
    index < 1 ||
    !IMAGE_NAME.test(name) ||
    name !== `ghcr.io/${expectedRepository}` ||
    manifest.image.digest.length !== 64 ||
    !SHA256.test(manifest.image.digest) ||
    manifest.image.reference !== `${name}${separator}${manifest.image.digest}`
  ) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "image_mismatch",
      "Release image does not match the canonical GHCR repository and digest."
    );
  }
  return {
    name,
    digest: manifest.image.digest,
    reference: manifest.image.reference,
    platform: FLOWCORDIA_RELEASE_IMAGE_PLATFORM,
  } as const;
}

function withoutDigest(
  evidence: Omit<FlowcordiaReleaseImageEvidence, "evidenceSha256"> | FlowcordiaReleaseImageEvidence
): Omit<FlowcordiaReleaseImageEvidence, "evidenceSha256"> {
  return {
    schemaVersion: evidence.schemaVersion,
    state: evidence.state,
    releaseId: evidence.releaseId,
    version: evidence.version,
    applicationCommitSha: evidence.applicationCommitSha,
    upstreamCommitSha: evidence.upstreamCommitSha,
    image: evidence.image,
    releaseManifestSha256: evidence.releaseManifestSha256,
    workflow: evidence.workflow,
    provenance: evidence.provenance,
    createdAt: evidence.createdAt,
  };
}

export function flowcordiaReleaseImageEvidenceSha256(
  evidence: Omit<FlowcordiaReleaseImageEvidence, "evidenceSha256">
): string {
  return flowcordiaRecoverySha256(evidence);
}

export function createFlowcordiaReleaseImageEvidence(input: {
  releaseManifest: unknown;
  repository: unknown;
  runId: unknown;
  runAttempt: unknown;
  attestationId: unknown;
  createdAt: unknown;
}): FlowcordiaReleaseImageEvidence {
  const releaseManifest = parseFlowcordiaReleaseDistributionManifest(input.releaseManifest);
  const repositoryName = repository(input.repository);
  const evidenceWithoutDigest: Omit<FlowcordiaReleaseImageEvidence, "evidenceSha256"> = {
    schemaVersion: FLOWCORDIA_RELEASE_IMAGE_EVIDENCE_SCHEMA_VERSION,
    state: "PUBLISHED",
    releaseId: releaseManifest.releaseId,
    version: releaseManifest.version,
    applicationCommitSha: releaseManifest.applicationCommitSha,
    upstreamCommitSha: releaseManifest.upstreamCommitSha,
    image: image(releaseManifest, repositoryName),
    releaseManifestSha256: releaseManifest.manifestSha256,
    workflow: {
      repository: repositoryName,
      path: FLOWCORDIA_RELEASE_IMAGE_WORKFLOW,
      runId: decimalId(input.runId, "Release image workflow run ID"),
      runAttempt: runAttempt(input.runAttempt),
      sourceRef: "refs/heads/main",
    },
    provenance: {
      attestationId: decimalId(input.attestationId, "Release image attestation ID"),
      predicateType: FLOWCORDIA_RELEASE_IMAGE_PREDICATE,
      signerWorkflow: `${repositoryName}/${FLOWCORDIA_RELEASE_IMAGE_WORKFLOW}`,
      verified: true,
      sbom: "buildkit-spdx",
    },
    createdAt: timestamp(input.createdAt),
  };
  return {
    ...evidenceWithoutDigest,
    evidenceSha256: flowcordiaReleaseImageEvidenceSha256(evidenceWithoutDigest),
  };
}
