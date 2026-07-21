import {
  flowcordiaMigrationSet,
  flowcordiaRecoverySha256,
  parseFlowcordiaBackupManifest,
  type FlowcordiaBackupManifest,
  type FlowcordiaRestoreRehearsalEvidence,
} from "./database-recovery";

export const FLOWCORDIA_UPGRADE_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_DEFAULT_RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export type FlowcordiaUpgradeState = "READY" | "BLOCKED";
export type FlowcordiaUpgradeKind = "undetermined" | "application_only" | "append_only_migrations";
export type FlowcordiaUpgradeStepKey =
  | "verify_candidate_configuration"
  | "enter_maintenance_window"
  | "verify_recovery_evidence"
  | "apply_migrations_once"
  | "deploy_worker"
  | "verify_worker"
  | "deploy_web"
  | "verify_release"
  | "connected_acceptance"
  | "exit_maintenance_window";

export interface FlowcordiaMigrationArtifact {
  name: string;
  checksum: string;
}

export interface FlowcordiaAppliedMigrationArtifact extends FlowcordiaMigrationArtifact {
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface FlowcordiaUpgradeCheck {
  key:
    | "application_identity"
    | "database_history"
    | "candidate_history"
    | "migration_compatibility"
    | "recovery_evidence"
    | "migration_review"
    | "maintenance_window"
    | "rollback_acceptance";
  state: FlowcordiaUpgradeState;
  message: string;
}

export interface FlowcordiaUpgradeProjection {
  schemaVersion: "0.1";
  state: FlowcordiaUpgradeState;
  kind: FlowcordiaUpgradeKind;
  checkedAt: string;
  currentApplicationCommitSha: string;
  targetApplicationCommitSha: string;
  migrations: {
    currentCount: number;
    targetCount: number;
    pendingCount: number;
    currentDigest: string;
    targetDigest: string;
  };
  recovery: {
    required: boolean;
    backupManifestSha256?: string;
    restoreEvidenceSha256?: string;
  };
  steps: FlowcordiaUpgradeStepKey[];
  checks: FlowcordiaUpgradeCheck[];
  message: string;
}

export interface FlowcordiaUpgradePreflightInput {
  currentApplicationCommitSha: string;
  targetApplicationCommitSha: string;
  appliedMigrations: readonly FlowcordiaAppliedMigrationArtifact[];
  targetMigrations: readonly FlowcordiaMigrationArtifact[];
  checkedAt: Date;
  recoveryMaxAgeMs?: number;
  backupManifest?: unknown;
  restoreEvidence?: unknown;
  confirmMigrationReview?: boolean;
  confirmMaintenanceWindow?: boolean;
  confirmRestoreRollback?: boolean;
}

const APPLICATION_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9_]+$/;
const MIN_RECOVERY_MAX_AGE_MS = 60 * 60 * 1_000;
const MAX_RECOVERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const EXPECTED_RESTORE_CHECKS = [
  "archive_integrity",
  "tool_compatibility",
  "restore_completed",
  "migration_parity",
  "cleanup_completed",
] as const;

function check(
  key: FlowcordiaUpgradeCheck["key"],
  ready: boolean,
  readyMessage: string,
  blockedMessage: string
): FlowcordiaUpgradeCheck {
  return {
    key,
    state: ready ? "READY" : "BLOCKED",
    message: ready ? readyMessage : blockedMessage,
  };
}

function validApplicationSha(value: string): boolean {
  return APPLICATION_SHA.test(value) && !/^([0-9a-f])\1{39}$/.test(value);
}

function validArtifact(artifact: FlowcordiaMigrationArtifact): boolean {
  return MIGRATION_NAME.test(artifact.name) && SHA256.test(artifact.checksum);
}

function sortedUniqueArtifacts(
  artifacts: readonly FlowcordiaMigrationArtifact[]
): FlowcordiaMigrationArtifact[] | null {
  if (
    artifacts.length === 0 ||
    artifacts.some((artifact) => !validArtifact(artifact)) ||
    artifacts.length !== new Set(artifacts.map((artifact) => artifact.name)).size
  ) {
    return null;
  }
  const sorted = [...artifacts].sort((left, right) => left.name.localeCompare(right.name));
  if (sorted.some((artifact, index) => artifact !== artifacts[index])) return null;
  return sorted;
}

function artifactDigest(artifacts: readonly FlowcordiaMigrationArtifact[]): string {
  return flowcordiaRecoverySha256(
    artifacts.map((artifact) => ({ name: artifact.name, checksum: artifact.checksum }))
  );
}

function parseRestoreEvidence(value: unknown): FlowcordiaRestoreRehearsalEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const evidence = value as FlowcordiaRestoreRehearsalEvidence;
  const expectedKeys = [
    "applicationCommitSha",
    "archiveSha256",
    "backupManifestSha256",
    "checkedAt",
    "checks",
    "evidenceSha256",
    "kind",
    "migrations",
    "postgresMajor",
    "releaseId",
    "result",
    "schemaVersion",
  ];
  if (JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify(expectedKeys)) return null;
  if (
    evidence.schemaVersion !== "0.1" ||
    evidence.kind !== "flowcordia-postgresql-restore-rehearsal" ||
    evidence.result !== "READY" ||
    !validApplicationSha(evidence.applicationCommitSha) ||
    !SHA256.test(evidence.archiveSha256) ||
    !SHA256.test(evidence.backupManifestSha256) ||
    !SHA256.test(evidence.evidenceSha256) ||
    !Number.isSafeInteger(evidence.postgresMajor) ||
    evidence.postgresMajor < 14 ||
    !evidence.migrations ||
    Object.keys(evidence.migrations).sort().join(",") !== "count,sha256" ||
    !Number.isSafeInteger(evidence.migrations.count) ||
    evidence.migrations.count <= 0 ||
    !SHA256.test(evidence.migrations.sha256) ||
    !Array.isArray(evidence.checks) ||
    evidence.checks.length !== EXPECTED_RESTORE_CHECKS.length ||
    evidence.checks.some(
      (entry, index) =>
        !entry ||
        typeof entry !== "object" ||
        entry.key !== EXPECTED_RESTORE_CHECKS[index] ||
        entry.state !== "READY" ||
        Object.keys(entry).sort().join(",") !== "key,state"
    )
  ) {
    return null;
  }
  const checkedAt = new Date(evidence.checkedAt);
  if (!Number.isFinite(checkedAt.getTime()) || checkedAt.toISOString() !== evidence.checkedAt) {
    return null;
  }
  const withoutDigest = {
    schemaVersion: evidence.schemaVersion,
    kind: evidence.kind,
    releaseId: evidence.releaseId,
    applicationCommitSha: evidence.applicationCommitSha,
    result: evidence.result,
    checkedAt: evidence.checkedAt,
    postgresMajor: evidence.postgresMajor,
    backupManifestSha256: evidence.backupManifestSha256,
    archiveSha256: evidence.archiveSha256,
    migrations: evidence.migrations,
    checks: evidence.checks,
  };
  return flowcordiaRecoverySha256(withoutDigest) === evidence.evidenceSha256 ? evidence : null;
}

function validRecoveryEvidence(input: {
  backupManifest: unknown;
  restoreEvidence: unknown;
  currentApplicationCommitSha: string;
  appliedMigrationNames: readonly string[];
  checkedAt: Date;
  maxAgeMs: number;
}): {
  ready: boolean;
  manifest?: FlowcordiaBackupManifest;
  evidence?: FlowcordiaRestoreRehearsalEvidence;
} {
  let manifest: FlowcordiaBackupManifest;
  try {
    manifest = parseFlowcordiaBackupManifest(input.backupManifest);
  } catch {
    return { ready: false };
  }
  const evidence = parseRestoreEvidence(input.restoreEvidence);
  if (!evidence) return { ready: false };
  const migrationSet = flowcordiaMigrationSet(input.appliedMigrationNames);
  const manifestTime = new Date(manifest.createdAt).getTime();
  const evidenceTime = new Date(evidence.checkedAt).getTime();
  const now = input.checkedAt.getTime();
  const ready =
    manifest.applicationCommitSha === input.currentApplicationCommitSha &&
    evidence.applicationCommitSha === input.currentApplicationCommitSha &&
    evidence.releaseId === manifest.releaseId &&
    evidence.backupManifestSha256 === manifest.manifestSha256 &&
    evidence.archiveSha256 === manifest.archive.sha256 &&
    evidence.postgresMajor === manifest.postgresMajor &&
    evidence.migrations.count === manifest.migrations.count &&
    evidence.migrations.sha256 === manifest.migrations.sha256 &&
    manifest.migrations.count === migrationSet.count &&
    manifest.migrations.sha256 === migrationSet.sha256 &&
    evidenceTime >= manifestTime &&
    manifestTime <= now + MAX_CLOCK_SKEW_MS &&
    evidenceTime <= now + MAX_CLOCK_SKEW_MS &&
    now - manifestTime <= input.maxAgeMs &&
    now - evidenceTime <= input.maxAgeMs;
  return ready ? { ready, manifest, evidence } : { ready: false };
}

export function presentFlowcordiaUpgradePreflight(
  input: FlowcordiaUpgradePreflightInput
): FlowcordiaUpgradeProjection {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new TypeError("Flowcordia upgrade check time is invalid.");
  }
  const recoveryMaxAgeMs = input.recoveryMaxAgeMs ?? FLOWCORDIA_DEFAULT_RECOVERY_MAX_AGE_MS;
  if (
    !Number.isSafeInteger(recoveryMaxAgeMs) ||
    recoveryMaxAgeMs < MIN_RECOVERY_MAX_AGE_MS ||
    recoveryMaxAgeMs > MAX_RECOVERY_MAX_AGE_MS
  ) {
    throw new TypeError("Flowcordia recovery evidence age policy is invalid.");
  }

  const identityReady =
    validApplicationSha(input.currentApplicationCommitSha) &&
    validApplicationSha(input.targetApplicationCommitSha) &&
    input.currentApplicationCommitSha !== input.targetApplicationCommitSha;

  const applied = sortedUniqueArtifacts(input.appliedMigrations);
  const appliedStateReady =
    applied !== null &&
    input.appliedMigrations.every(
      (migration) => migration.finishedAt instanceof Date && migration.rolledBackAt === null
    );
  const target = sortedUniqueArtifacts(input.targetMigrations);
  const targetReady = target !== null;

  const prefixReady =
    appliedStateReady &&
    targetReady &&
    applied!.length <= target!.length &&
    applied!.every(
      (migration, index) =>
        migration.name === target![index]?.name && migration.checksum === target![index]?.checksum
    );
  const kind: FlowcordiaUpgradeKind = !prefixReady
    ? "undetermined"
    : applied!.length < target!.length
      ? "append_only_migrations"
      : "application_only";
  const migrationUpgrade = kind === "append_only_migrations";

  const recovery = migrationUpgrade
    ? validRecoveryEvidence({
        backupManifest: input.backupManifest,
        restoreEvidence: input.restoreEvidence,
        currentApplicationCommitSha: input.currentApplicationCommitSha,
        appliedMigrationNames: applied?.map((migration) => migration.name) ?? [],
        checkedAt: input.checkedAt,
        maxAgeMs: recoveryMaxAgeMs,
      })
    : { ready: true };

  const checks: FlowcordiaUpgradeCheck[] = [
    check(
      "application_identity",
      identityReady,
      "Current and target application revisions are exact and distinct.",
      "Current or target application revision is invalid, placeholder-backed, or unchanged."
    ),
    check(
      "database_history",
      appliedStateReady,
      "The live database migration history is complete, successful, ordered, and checksum-bound.",
      "The live database migration history is missing, failed, rolled back, unordered, duplicated, or malformed."
    ),
    check(
      "candidate_history",
      targetReady,
      "The candidate repository migration history is complete, ordered, and checksum-bound.",
      "The candidate repository migration history is missing, unordered, duplicated, or malformed."
    ),
    check(
      "migration_compatibility",
      prefixReady,
      migrationUpgrade
        ? "The candidate adds migrations without rewriting or removing applied history."
        : "The candidate preserves the exact applied migration history without adding schema changes.",
      "The candidate migration history rewrites, removes, reorders, or diverges from the live database."
    ),
    check(
      "recovery_evidence",
      recovery.ready,
      migrationUpgrade
        ? "Fresh backup and isolated restore evidence match the current application and database history."
        : "No new database migration is planned, so release-bound recovery evidence is not required by this gate.",
      "Fresh matching backup and isolated restore evidence is required for a migration-bearing upgrade."
    ),
    check(
      "migration_review",
      !migrationUpgrade || input.confirmMigrationReview === true,
      migrationUpgrade
        ? "An operator confirmed review of the candidate migration SQL and data-transition plan."
        : "No candidate migration SQL requires upgrade review.",
      "A migration-bearing upgrade requires explicit operator review of SQL and data-transition behavior."
    ),
    check(
      "maintenance_window",
      !migrationUpgrade || input.confirmMaintenanceWindow === true,
      migrationUpgrade
        ? "An operator accepted a controlled maintenance window for the schema transition."
        : "The application-only rollout does not require this gate's schema-maintenance window.",
      "A migration-bearing upgrade requires an explicit controlled maintenance-window acknowledgement."
    ),
    check(
      "rollback_acceptance",
      !migrationUpgrade || input.confirmRestoreRollback === true,
      migrationUpgrade
        ? "An operator accepted restore-based recovery because backward application compatibility is not proven."
        : "The prior application revision remains the bounded rollback target for this application-only rollout.",
      "A migration-bearing upgrade requires explicit acceptance of restore-based recovery when backward compatibility is unproven."
    ),
  ];

  const state: FlowcordiaUpgradeState = checks.some((entry) => entry.state === "BLOCKED")
    ? "BLOCKED"
    : "READY";
  const currentArtifacts = applied ?? [];
  const targetArtifacts = target ?? [];
  const steps: FlowcordiaUpgradeStepKey[] =
    kind === "append_only_migrations"
      ? [
          "verify_candidate_configuration",
          "enter_maintenance_window",
          "verify_recovery_evidence",
          "apply_migrations_once",
          "deploy_worker",
          "verify_worker",
          "deploy_web",
          "verify_release",
          "connected_acceptance",
          "exit_maintenance_window",
        ]
      : kind === "application_only"
        ? [
            "verify_candidate_configuration",
            "deploy_worker",
            "verify_worker",
            "deploy_web",
            "verify_release",
            "connected_acceptance",
          ]
        : [];

  return {
    schemaVersion: FLOWCORDIA_UPGRADE_SCHEMA_VERSION,
    state,
    kind,
    checkedAt: input.checkedAt.toISOString(),
    currentApplicationCommitSha: input.currentApplicationCommitSha,
    targetApplicationCommitSha: input.targetApplicationCommitSha,
    migrations: {
      currentCount: currentArtifacts.length,
      targetCount: targetArtifacts.length,
      pendingCount: prefixReady ? targetArtifacts.length - currentArtifacts.length : 0,
      currentDigest: artifactDigest(currentArtifacts),
      targetDigest: artifactDigest(targetArtifacts),
    },
    recovery: {
      required: migrationUpgrade,
      ...(recovery.manifest ? { backupManifestSha256: recovery.manifest.manifestSha256 } : {}),
      ...(recovery.evidence ? { restoreEvidenceSha256: recovery.evidence.evidenceSha256 } : {}),
    },
    steps,
    checks,
    message:
      state === "READY"
        ? "Flowcordia upgrade inputs are ready for the documented controlled rollout sequence."
        : "Flowcordia upgrade is blocked before any migration or deployment mutation.",
  };
}
