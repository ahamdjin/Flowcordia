import { flowcordiaRecoverySha256 } from "./database-recovery";
import {
  parseFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseDistributionManifest,
} from "./release-distribution";

export const FLOWCORDIA_MIGRATION_EVIDENCE_SCHEMA_VERSION = "0.2" as const;

export interface FlowcordiaMigrationCompletionEvidence {
  schemaVersion: "0.2";
  kind: "flowcordia-self-host-migration";
  state: "COMPLETED";
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  imageDigest: string;
  manifestSha256: string;
  migrations: {
    count: number;
    sha256: string;
  };
  completedAt: string;
  evidenceSha256: string;
}

const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/;
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class FlowcordiaMigrationEvidenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaMigrationEvidenceError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaMigrationEvidenceError("invalid_object", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowcordiaMigrationEvidenceError(
      "unexpected_fields",
      `${label} has unexpected fields.`
    );
  }
}

function timestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new FlowcordiaMigrationEvidenceError(
      "invalid_time",
      "Migration completion time is invalid."
    );
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaMigrationEvidenceError(
      "invalid_time",
      "Migration completion time is invalid."
    );
  }
  return value;
}

function withoutDigest(
  evidence:
    | Omit<FlowcordiaMigrationCompletionEvidence, "evidenceSha256">
    | FlowcordiaMigrationCompletionEvidence
): Omit<FlowcordiaMigrationCompletionEvidence, "evidenceSha256"> {
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

export function flowcordiaMigrationEvidenceSha256(
  evidence: Omit<FlowcordiaMigrationCompletionEvidence, "evidenceSha256">
): string {
  return flowcordiaRecoverySha256(evidence);
}

export function createFlowcordiaMigrationCompletionEvidence(input: {
  releaseManifest: unknown;
  completedAt: string;
}): FlowcordiaMigrationCompletionEvidence {
  const release = parseFlowcordiaReleaseDistributionManifest(input.releaseManifest);
  const evidenceWithoutDigest: Omit<FlowcordiaMigrationCompletionEvidence, "evidenceSha256"> = {
    schemaVersion: FLOWCORDIA_MIGRATION_EVIDENCE_SCHEMA_VERSION,
    kind: "flowcordia-self-host-migration",
    state: "COMPLETED",
    releaseId: release.releaseId,
    version: release.version,
    applicationCommitSha: release.applicationCommitSha,
    imageDigest: release.image.digest,
    manifestSha256: release.manifestSha256,
    migrations: release.migrations,
    completedAt: timestamp(input.completedAt),
  };
  return {
    ...evidenceWithoutDigest,
    evidenceSha256: flowcordiaMigrationEvidenceSha256(evidenceWithoutDigest),
  };
}

export function parseFlowcordiaMigrationCompletionEvidence(
  value: unknown,
  expectedRelease?: unknown
): FlowcordiaMigrationCompletionEvidence {
  const evidence = record(value, "Flowcordia migration evidence");
  exactKeys(
    evidence,
    [
      "applicationCommitSha",
      "completedAt",
      "evidenceSha256",
      "imageDigest",
      "kind",
      "manifestSha256",
      "migrations",
      "releaseId",
      "schemaVersion",
      "state",
      "version",
    ],
    "Flowcordia migration evidence"
  );
  const migrations = record(evidence.migrations, "Flowcordia migration inventory");
  exactKeys(migrations, ["count", "sha256"], "Flowcordia migration inventory");
  if (
    evidence.schemaVersion !== FLOWCORDIA_MIGRATION_EVIDENCE_SCHEMA_VERSION ||
    evidence.kind !== "flowcordia-self-host-migration" ||
    evidence.state !== "COMPLETED" ||
    typeof evidence.releaseId !== "string" ||
    !RELEASE_ID.test(evidence.releaseId) ||
    typeof evidence.version !== "string" ||
    !VERSION.test(evidence.version) ||
    typeof evidence.applicationCommitSha !== "string" ||
    !SHA.test(evidence.applicationCommitSha) ||
    /^([0-9a-f])\1{39}$/.test(evidence.applicationCommitSha) ||
    typeof evidence.imageDigest !== "string" ||
    !SHA256.test(evidence.imageDigest) ||
    typeof evidence.manifestSha256 !== "string" ||
    !SHA256.test(evidence.manifestSha256) ||
    !Number.isSafeInteger(migrations.count) ||
    Number(migrations.count) <= 0 ||
    typeof migrations.sha256 !== "string" ||
    !SHA256.test(migrations.sha256) ||
    typeof evidence.evidenceSha256 !== "string" ||
    !SHA256.test(evidence.evidenceSha256)
  ) {
    throw new FlowcordiaMigrationEvidenceError(
      "invalid_evidence",
      "Flowcordia migration evidence is invalid."
    );
  }

  const parsed: FlowcordiaMigrationCompletionEvidence = {
    schemaVersion: FLOWCORDIA_MIGRATION_EVIDENCE_SCHEMA_VERSION,
    kind: "flowcordia-self-host-migration",
    state: "COMPLETED",
    releaseId: evidence.releaseId,
    version: evidence.version,
    applicationCommitSha: evidence.applicationCommitSha,
    imageDigest: evidence.imageDigest,
    manifestSha256: evidence.manifestSha256,
    migrations: {
      count: Number(migrations.count),
      sha256: migrations.sha256,
    },
    completedAt: timestamp(evidence.completedAt),
    evidenceSha256: evidence.evidenceSha256,
  };

  if (flowcordiaMigrationEvidenceSha256(withoutDigest(parsed)) !== parsed.evidenceSha256) {
    throw new FlowcordiaMigrationEvidenceError(
      "invalid_digest",
      "Flowcordia migration evidence digest is invalid."
    );
  }

  if (expectedRelease !== undefined) {
    const release: FlowcordiaReleaseDistributionManifest =
      parseFlowcordiaReleaseDistributionManifest(expectedRelease);
    if (
      parsed.releaseId !== release.releaseId ||
      parsed.version !== release.version ||
      parsed.applicationCommitSha !== release.applicationCommitSha ||
      parsed.imageDigest !== release.image.digest ||
      parsed.manifestSha256 !== release.manifestSha256 ||
      parsed.migrations.count !== release.migrations.count ||
      parsed.migrations.sha256 !== release.migrations.sha256
    ) {
      throw new FlowcordiaMigrationEvidenceError(
        "release_mismatch",
        "Flowcordia migration evidence does not match the selected release."
      );
    }
  }

  return parsed;
}
