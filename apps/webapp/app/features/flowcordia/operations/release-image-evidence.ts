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

const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/;
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

function releaseId(value: unknown): string {
  if (typeof value !== "string" || !RELEASE_ID.test(value)) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "invalid_release",
      "Release image evidence release identity is invalid."
    );
  }
  return value;
}

function version(value: unknown): string {
  if (typeof value !== "string" || !VERSION.test(value)) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "invalid_version",
      "Release image evidence version is invalid."
    );
  }
  return value;
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

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaReleaseImageEvidenceError("invalid_object", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "unexpected_fields",
      `${label} has unexpected fields.`
    );
  }
}

function revision(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{40}$/.test(value) ||
    /^([0-9a-f])\1{39}$/.test(value)
  ) {
    throw new FlowcordiaReleaseImageEvidenceError("invalid_revision", `${label} is invalid.`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new FlowcordiaReleaseImageEvidenceError("invalid_digest", `${label} is invalid.`);
  }
  return value;
}

export function parseFlowcordiaReleaseImageEvidence(
  value: unknown,
  expectedRelease?: unknown
): FlowcordiaReleaseImageEvidence {
  const evidence = record(value, "Release image evidence");
  exactKeys(
    evidence,
    [
      "applicationCommitSha",
      "createdAt",
      "evidenceSha256",
      "image",
      "provenance",
      "releaseId",
      "releaseManifestSha256",
      "schemaVersion",
      "state",
      "upstreamCommitSha",
      "version",
      "workflow",
    ],
    "Release image evidence"
  );
  const imageValue = record(evidence.image, "Release image identity");
  const workflowValue = record(evidence.workflow, "Release image workflow");
  const provenanceValue = record(evidence.provenance, "Release image provenance");
  exactKeys(imageValue, ["digest", "name", "platform", "reference"], "Release image identity");
  exactKeys(
    workflowValue,
    ["path", "repository", "runAttempt", "runId", "sourceRef"],
    "Release image workflow"
  );
  exactKeys(
    provenanceValue,
    ["attestationId", "predicateType", "sbom", "signerWorkflow", "verified"],
    "Release image provenance"
  );

  if (
    evidence.schemaVersion !== FLOWCORDIA_RELEASE_IMAGE_EVIDENCE_SCHEMA_VERSION ||
    evidence.state !== "PUBLISHED"
  ) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "invalid_state",
      "Release image evidence state is invalid."
    );
  }

  const repositoryName = repository(workflowValue.repository);
  const parsed: FlowcordiaReleaseImageEvidence = {
    schemaVersion: FLOWCORDIA_RELEASE_IMAGE_EVIDENCE_SCHEMA_VERSION,
    state: "PUBLISHED",
    releaseId: releaseId(evidence.releaseId),
    version: version(evidence.version),
    applicationCommitSha: revision(evidence.applicationCommitSha, "Application revision"),
    upstreamCommitSha: revision(evidence.upstreamCommitSha, "Upstream revision"),
    image: {
      name:
        typeof imageValue.name === "string" && IMAGE_NAME.test(imageValue.name)
          ? imageValue.name
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_image",
                "Release image name is invalid."
              );
            })(),
      digest: sha256(imageValue.digest, "Release image digest"),
      reference:
        typeof imageValue.reference === "string"
          ? imageValue.reference
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_image",
                "Release image reference is invalid."
              );
            })(),
      platform:
        imageValue.platform === FLOWCORDIA_RELEASE_IMAGE_PLATFORM
          ? FLOWCORDIA_RELEASE_IMAGE_PLATFORM
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_platform",
                "Release image platform is invalid."
              );
            })(),
    },
    releaseManifestSha256: sha256(evidence.releaseManifestSha256, "Release manifest digest"),
    workflow: {
      repository: repositoryName,
      path:
        workflowValue.path === FLOWCORDIA_RELEASE_IMAGE_WORKFLOW
          ? FLOWCORDIA_RELEASE_IMAGE_WORKFLOW
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_workflow",
                "Release image workflow path is invalid."
              );
            })(),
      runId: decimalId(workflowValue.runId, "Release image workflow run ID"),
      runAttempt: runAttempt(workflowValue.runAttempt),
      sourceRef:
        workflowValue.sourceRef === "refs/heads/main"
          ? "refs/heads/main"
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_ref",
                "Release image workflow source ref is invalid."
              );
            })(),
    },
    provenance: {
      attestationId: decimalId(provenanceValue.attestationId, "Release image attestation ID"),
      predicateType:
        provenanceValue.predicateType === FLOWCORDIA_RELEASE_IMAGE_PREDICATE
          ? FLOWCORDIA_RELEASE_IMAGE_PREDICATE
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_provenance",
                "Release image provenance predicate is invalid."
              );
            })(),
      signerWorkflow:
        typeof provenanceValue.signerWorkflow === "string"
          ? provenanceValue.signerWorkflow
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_provenance",
                "Release image signer workflow is invalid."
              );
            })(),
      verified:
        provenanceValue.verified === true
          ? true
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_provenance",
                "Release image provenance verification is invalid."
              );
            })(),
      sbom:
        provenanceValue.sbom === "buildkit-spdx"
          ? "buildkit-spdx"
          : (() => {
              throw new FlowcordiaReleaseImageEvidenceError(
                "invalid_provenance",
                "Release image SBOM identity is invalid."
              );
            })(),
    },
    createdAt: timestamp(evidence.createdAt),
    evidenceSha256: sha256(evidence.evidenceSha256, "Release image evidence digest"),
  };

  if (
    parsed.image.name !== `ghcr.io/${repositoryName}` ||
    parsed.image.reference !== `${parsed.image.name}@sha256:${parsed.image.digest}` ||
    parsed.provenance.signerWorkflow !== `${repositoryName}/${FLOWCORDIA_RELEASE_IMAGE_WORKFLOW}`
  ) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "identity_mismatch",
      "Release image evidence identity is inconsistent."
    );
  }
  if (flowcordiaReleaseImageEvidenceSha256(withoutDigest(parsed)) !== parsed.evidenceSha256) {
    throw new FlowcordiaReleaseImageEvidenceError(
      "invalid_digest",
      "Release image evidence digest is invalid."
    );
  }

  if (expectedRelease !== undefined) {
    const release = parseFlowcordiaReleaseDistributionManifest(expectedRelease);
    if (
      parsed.releaseId !== release.releaseId ||
      parsed.version !== release.version ||
      parsed.applicationCommitSha !== release.applicationCommitSha ||
      parsed.upstreamCommitSha !== release.upstreamCommitSha ||
      parsed.image.digest !== release.image.digest ||
      parsed.image.reference !== release.image.reference ||
      parsed.releaseManifestSha256 !== release.manifestSha256
    ) {
      throw new FlowcordiaReleaseImageEvidenceError(
        "release_mismatch",
        "Release image evidence does not match the selected release."
      );
    }
  }

  return parsed;
}
