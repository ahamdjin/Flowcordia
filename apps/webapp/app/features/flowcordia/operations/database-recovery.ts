import { createHash } from "node:crypto";

export const FLOWCORDIA_DATABASE_RECOVERY_SCHEMA_VERSION = "0.1" as const;

export type FlowcordiaRecoveryCheckKey =
  | "archive_integrity"
  | "tool_compatibility"
  | "restore_completed"
  | "migration_parity"
  | "cleanup_completed";

export interface FlowcordiaBackupManifest {
  schemaVersion: "0.1";
  kind: "flowcordia-postgresql-backup";
  releaseId: string;
  applicationCommitSha: string;
  createdAt: string;
  postgresMajor: number;
  archive: {
    format: "custom";
    bytes: number;
    sha256: string;
    inventorySha256: string;
  };
  migrations: {
    count: number;
    sha256: string;
  };
  manifestSha256: string;
}

export interface FlowcordiaRestoreRehearsalEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-postgresql-restore-rehearsal";
  releaseId: string;
  applicationCommitSha: string;
  result: "READY";
  checkedAt: string;
  postgresMajor: number;
  backupManifestSha256: string;
  archiveSha256: string;
  migrations: {
    count: number;
    sha256: string;
  };
  checks: Array<{
    key: FlowcordiaRecoveryCheckKey;
    state: "READY";
  }>;
  evidenceSha256: string;
}

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9_]+$/;
const NONCE = /^[0-9a-f]{12}$/;
const EXPECTED_REHEARSAL_CHECKS: readonly FlowcordiaRecoveryCheckKey[] = [
  "archive_integrity",
  "tool_compatibility",
  "restore_completed",
  "migration_parity",
  "cleanup_completed",
];

export class FlowcordiaDatabaseRecoveryError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaDatabaseRecoveryError";
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
}

export function flowcordiaRecoverySha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function boundedReleaseId(value: unknown): string {
  if (typeof value !== "string" || !RELEASE_ID.test(value)) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_release", "Release identity is invalid.");
  }
  return value;
}

function applicationSha(value: unknown): string {
  if (typeof value !== "string" || !SHA.test(value) || /^([0-9a-f])\1{39}$/.test(value)) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_application",
      "Application revision is invalid."
    );
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_digest", `${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_number", `${label} is invalid.`);
  }
  return Number(value);
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new FlowcordiaDatabaseRecoveryError("invalid_time", `${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_time", `${label} is invalid.`);
  }
  return value;
}

function postgresMajor(value: unknown): number {
  const major = positiveInteger(value, "PostgreSQL major version");
  if (major < 14 || major > 99) {
    throw new FlowcordiaDatabaseRecoveryError(
      "unsupported_postgres",
      "PostgreSQL major version is unsupported."
    );
  }
  return major;
}

export function flowcordiaMigrationSet(input: readonly string[]): {
  count: number;
  sha256: string;
} {
  const migrations = [...input].sort();
  if (
    migrations.length === 0 ||
    migrations.length !== new Set(migrations).size ||
    migrations.some((name) => !MIGRATION_NAME.test(name))
  ) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_migrations",
      "Migration inventory is invalid."
    );
  }
  return {
    count: migrations.length,
    sha256: flowcordiaRecoverySha256(migrations),
  };
}

export function parsePostgresMajor(value: string, tool: "server" | "pg_dump" | "pg_restore") {
  const match =
    tool === "server"
      ? value.trim().match(/^([0-9]{2,6})$/)
      : value.trim().match(/(?:pg_dump|pg_restore) \(PostgreSQL\) ([0-9]+)(?:\.|$)/);
  if (!match) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_tool_version",
      "PostgreSQL tool version could not be verified."
    );
  }
  const major = tool === "server" ? Math.floor(Number(match[1]) / 10_000) : Number(match[1]);
  return postgresMajor(major);
}

export function assertCompatiblePostgresMajors(input: {
  server: number;
  pgDump: number;
  pgRestore?: number;
}): number {
  const server = postgresMajor(input.server);
  if (postgresMajor(input.pgDump) !== server) {
    throw new FlowcordiaDatabaseRecoveryError(
      "tool_version_mismatch",
      "PostgreSQL backup tool major version does not match the server."
    );
  }
  if (input.pgRestore !== undefined && postgresMajor(input.pgRestore) !== server) {
    throw new FlowcordiaDatabaseRecoveryError(
      "tool_version_mismatch",
      "PostgreSQL restore tool major version does not match the backup server."
    );
  }
  return server;
}

export function assertDistinctDatabaseIdentity(sourceUrl: string, restoreAdminUrl: string): void {
  let source: URL;
  let restore: URL;
  try {
    source = new URL(sourceUrl);
    restore = new URL(restoreAdminUrl);
  } catch {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_database_url",
      "Database recovery connection configuration is invalid."
    );
  }
  const protocol = (value: URL) => ["postgres:", "postgresql:"].includes(value.protocol);
  if (!protocol(source) || !protocol(restore) || !source.hostname || !restore.hostname) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_database_url",
      "Database recovery connection configuration is invalid."
    );
  }
  const identity = (value: URL) =>
    `${value.hostname.toLowerCase()}:${value.port || "5432"}/${decodeURIComponent(
      value.pathname.slice(1)
    )}`;
  if (
    !source.pathname.slice(1) ||
    !restore.pathname.slice(1) ||
    identity(source) === identity(restore)
  ) {
    throw new FlowcordiaDatabaseRecoveryError(
      "unsafe_restore_target",
      "Restore administration must use a database distinct from the source database."
    );
  }
}

export function flowcordiaRestoreDatabaseName(releaseId: string, nonce: string): string {
  const release = boundedReleaseId(releaseId).replace(/[^a-z0-9]+/g, "_");
  if (!NONCE.test(nonce)) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_nonce",
      "Restore rehearsal nonce is invalid."
    );
  }
  return `flowcordia_restore_${release}_${nonce}`.slice(0, 63).replace(/_+$/g, "");
}

export function createFlowcordiaBackupManifest(input: {
  releaseId: string;
  applicationCommitSha: string;
  createdAt: Date;
  postgresMajor: number;
  archiveBytes: number;
  archiveSha256: string;
  inventorySha256: string;
  migrations: readonly string[];
}): FlowcordiaBackupManifest {
  if (Number.isNaN(input.createdAt.getTime())) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_time", "Backup time is invalid.");
  }
  const withoutDigest = {
    schemaVersion: FLOWCORDIA_DATABASE_RECOVERY_SCHEMA_VERSION,
    kind: "flowcordia-postgresql-backup" as const,
    releaseId: boundedReleaseId(input.releaseId),
    applicationCommitSha: applicationSha(input.applicationCommitSha),
    createdAt: input.createdAt.toISOString(),
    postgresMajor: postgresMajor(input.postgresMajor),
    archive: {
      format: "custom" as const,
      bytes: positiveInteger(input.archiveBytes, "Archive size"),
      sha256: sha256(input.archiveSha256, "Archive digest"),
      inventorySha256: sha256(input.inventorySha256, "Archive inventory digest"),
    },
    migrations: flowcordiaMigrationSet(input.migrations),
  };
  return {
    ...withoutDigest,
    manifestSha256: flowcordiaRecoverySha256(withoutDigest),
  };
}

export function parseFlowcordiaBackupManifest(value: unknown): FlowcordiaBackupManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_manifest", "Backup manifest is invalid.");
  }
  const manifest = value as FlowcordiaBackupManifest;
  const expectedKeys = [
    "applicationCommitSha",
    "archive",
    "createdAt",
    "kind",
    "manifestSha256",
    "migrations",
    "postgresMajor",
    "releaseId",
    "schemaVersion",
  ];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedKeys)) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_manifest", "Backup manifest is invalid.");
  }
  if (
    manifest.schemaVersion !== FLOWCORDIA_DATABASE_RECOVERY_SCHEMA_VERSION ||
    manifest.kind !== "flowcordia-postgresql-backup" ||
    !manifest.archive ||
    Object.keys(manifest.archive).sort().join(",") !== "bytes,format,inventorySha256,sha256" ||
    manifest.archive.format !== "custom" ||
    !manifest.migrations ||
    Object.keys(manifest.migrations).sort().join(",") !== "count,sha256"
  ) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_manifest", "Backup manifest is invalid.");
  }

  const withoutDigest = {
    schemaVersion: FLOWCORDIA_DATABASE_RECOVERY_SCHEMA_VERSION,
    kind: "flowcordia-postgresql-backup" as const,
    releaseId: boundedReleaseId(manifest.releaseId),
    applicationCommitSha: applicationSha(manifest.applicationCommitSha),
    createdAt: canonicalTimestamp(manifest.createdAt, "Backup time"),
    postgresMajor: postgresMajor(manifest.postgresMajor),
    archive: {
      format: "custom" as const,
      bytes: positiveInteger(manifest.archive.bytes, "Archive size"),
      sha256: sha256(manifest.archive.sha256, "Archive digest"),
      inventorySha256: sha256(manifest.archive.inventorySha256, "Archive inventory digest"),
    },
    migrations: {
      count: positiveInteger(manifest.migrations.count, "Migration count"),
      sha256: sha256(manifest.migrations.sha256, "Migration digest"),
    },
  };
  const digest = sha256(manifest.manifestSha256, "Manifest digest");
  if (digest !== flowcordiaRecoverySha256(withoutDigest)) {
    throw new FlowcordiaDatabaseRecoveryError(
      "manifest_digest_mismatch",
      "Backup manifest digest does not match its contents."
    );
  }
  return { ...withoutDigest, manifestSha256: digest };
}

export function createFlowcordiaRestoreEvidence(input: {
  manifest: FlowcordiaBackupManifest;
  checkedAt: Date;
  archiveSha256: string;
  restoredMigrations: readonly string[];
}): FlowcordiaRestoreRehearsalEvidence {
  const manifest = parseFlowcordiaBackupManifest(input.manifest);
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_time", "Restore check time is invalid.");
  }
  const migrations = flowcordiaMigrationSet(input.restoredMigrations);
  if (
    migrations.count !== manifest.migrations.count ||
    migrations.sha256 !== manifest.migrations.sha256 ||
    sha256(input.archiveSha256, "Archive digest") !== manifest.archive.sha256
  ) {
    throw new FlowcordiaDatabaseRecoveryError(
      "restore_evidence_mismatch",
      "Restore rehearsal evidence does not match the backup manifest."
    );
  }
  const withoutDigest = {
    schemaVersion: FLOWCORDIA_DATABASE_RECOVERY_SCHEMA_VERSION,
    kind: "flowcordia-postgresql-restore-rehearsal" as const,
    releaseId: manifest.releaseId,
    applicationCommitSha: manifest.applicationCommitSha,
    result: "READY" as const,
    checkedAt: input.checkedAt.toISOString(),
    postgresMajor: manifest.postgresMajor,
    backupManifestSha256: manifest.manifestSha256,
    archiveSha256: manifest.archive.sha256,
    migrations,
    checks: EXPECTED_REHEARSAL_CHECKS.map((key) => ({ key, state: "READY" as const })),
  };
  return {
    ...withoutDigest,
    evidenceSha256: flowcordiaRecoverySha256(withoutDigest),
  };
}
