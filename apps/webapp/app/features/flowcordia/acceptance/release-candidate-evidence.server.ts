import {
  flowcordiaRecoverySha256,
  parseFlowcordiaBackupManifest,
} from "../operations/database-recovery";

export const FLOWCORDIA_RELEASE_CANDIDATE_EVIDENCE_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_RELEASE_CANDIDATE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;

const INSTALLATION_CHECKS = [
  "runtime",
  "database",
  "application",
  "github_app",
  "environment",
  "web_secrets",
  "origins",
  "studio_rollout",
  "worker",
  "worker_delivery",
  "worker_limits",
] as const;
const DEPENDENCY_CHECKS = [
  "database_connection",
  "database_migrations",
  "github_app",
  "worker_heartbeat",
] as const;
const RECOVERY_CHECKS = [
  "archive_integrity",
  "tool_compatibility",
  "restore_completed",
  "migration_parity",
  "cleanup_completed",
] as const;
const UPGRADE_CHECKS = [
  "application_identity",
  "database_history",
  "candidate_history",
  "migration_compatibility",
  "recovery_evidence",
  "migration_review",
  "maintenance_window",
  "rollback_acceptance",
] as const;
const UPGRADE_STEPS = [
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
] as const;

export interface FlowcordiaReleaseCandidateEvidence {
  schemaVersion: "0.1";
  state: "READY";
  releaseId: string;
  currentApplicationCommitSha: string;
  targetApplicationCommitSha: string;
  checkedAt: string;
  summary: {
    liveDependencies: { checkedAt: string; profile: "release" };
    recovery: {
      backupCreatedAt: string;
      restoreCheckedAt: string;
      postgresMajor: number;
      migrationCount: number;
      migrationSha256: string;
      backupManifestSha256: string;
      restoreEvidenceSha256: string;
    };
    upgrade: {
      checkedAt: string;
      kind: "application_only" | "append_only_migrations";
      currentMigrationCount: number;
      targetMigrationCount: number;
      pendingMigrationCount: number;
      currentMigrationSha256: string;
      targetMigrationSha256: string;
    };
  };
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label} does not match the release candidate.`);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical timestamp.`);
  }
  return value;
}

function applicationSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA.test(value) || /^([0-9a-f])\1{39}$/.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label} is invalid.`);
  }
  return Number(value);
}

function assertMessage(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) {
    throw new Error(`${label} is invalid.`);
  }
}

function readyChecks(
  value: unknown,
  label: string,
  requiredKeys: readonly string[],
  withMessage: boolean
): void {
  if (!Array.isArray(value) || value.length !== requiredKeys.length) {
    throw new Error(`${label} must contain exactly ${requiredKeys.length} checks.`);
  }
  const observed = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const check = record(candidate, `${label}.${index}`);
    const expectedKeys = withMessage ? ["key", "message", "state"] : ["key", "state"];
    if (JSON.stringify(Object.keys(check).sort()) !== JSON.stringify(expectedKeys)) {
      throw new Error(`${label}.${index} has unexpected fields.`);
    }
    if (typeof check.key !== "string" || !requiredKeys.includes(check.key)) {
      throw new Error(`${label}.${index}.key is invalid.`);
    }
    if (observed.has(check.key)) throw new Error(`${label} contains a duplicated check.`);
    observed.add(check.key);
    exact(check.state, "READY", `${label}.${index}.state`);
    if (withMessage) assertMessage(check.message, `${label}.${index}.message`);
  }
  if (requiredKeys.some((key) => !observed.has(key))) {
    throw new Error(`${label} is missing a required check.`);
  }
}

function requireFresh(observedAt: string, checkedAt: string, maximumAgeMs: number, label: string) {
  const observed = Date.parse(observedAt);
  const assembled = Date.parse(checkedAt);
  if (observed > assembled) throw new Error(`${label} occurs after candidate assembly.`);
  if (assembled - observed > maximumAgeMs) {
    throw new Error(`${label} exceeds the release-candidate freshness window.`);
  }
}

function validateInstallation(value: unknown, checkedAt: string, label: string): void {
  const installation = record(value, label);
  exact(installation.schemaVersion, "0.1", `${label}.schemaVersion`);
  exact(installation.profile, "release", `${label}.profile`);
  exact(installation.state, "READY", `${label}.state`);
  exact(installation.checkedAt, checkedAt, `${label}.checkedAt`);
  assertMessage(installation.message, `${label}.message`);
  readyChecks(installation.checks, `${label}.checks`, INSTALLATION_CHECKS, true);
}

function validateLiveDependencies(
  value: unknown,
  checkedAt: string,
  maximumAgeMs: number
): FlowcordiaReleaseCandidateEvidence["summary"]["liveDependencies"] {
  const evidence = record(value, "liveDependency");
  exact(evidence.schemaVersion, "0.1", "liveDependency.schemaVersion");
  exact(evidence.profile, "release", "liveDependency.profile");
  exact(evidence.state, "READY", "liveDependency.state");
  exact(evidence.phase, "dependencies", "liveDependency.phase");
  const observedAt = timestamp(evidence.checkedAt, "liveDependency.checkedAt");
  validateInstallation(evidence.configuration, observedAt, "liveDependency.configuration");
  const dependencies = record(evidence.dependencies, "liveDependency.dependencies");
  exact(dependencies.schemaVersion, "0.1", "liveDependency.dependencies.schemaVersion");
  exact(dependencies.profile, "release", "liveDependency.dependencies.profile");
  exact(dependencies.state, "READY", "liveDependency.dependencies.state");
  exact(dependencies.checkedAt, observedAt, "liveDependency.dependencies.checkedAt");
  assertMessage(dependencies.message, "liveDependency.dependencies.message");
  readyChecks(dependencies.checks, "liveDependency.dependencies.checks", DEPENDENCY_CHECKS, true);
  requireFresh(observedAt, checkedAt, maximumAgeMs, "liveDependency.checkedAt");
  return { checkedAt: observedAt, profile: "release" as const };
}

function validateRecovery(input: {
  manifestEvidence: unknown;
  restoreEvidence: unknown;
  releaseId: string;
  currentApplicationCommitSha: string;
  checkedAt: string;
  maximumAgeMs: number;
}): FlowcordiaReleaseCandidateEvidence["summary"]["recovery"] {
  const manifest = parseFlowcordiaBackupManifest(input.manifestEvidence);
  exact(manifest.releaseId, input.releaseId, "backup.releaseId");
  exact(manifest.applicationCommitSha, input.currentApplicationCommitSha, "backup.application");

  const restore = record(input.restoreEvidence, "restore");
  exact(restore.schemaVersion, "0.1", "restore.schemaVersion");
  exact(restore.kind, "flowcordia-postgresql-restore-rehearsal", "restore.kind");
  exact(restore.releaseId, input.releaseId, "restore.releaseId");
  exact(
    applicationSha(restore.applicationCommitSha, "restore.applicationCommitSha"),
    input.currentApplicationCommitSha,
    "restore.applicationCommitSha"
  );
  exact(restore.result, "READY", "restore.result");
  const restoreCheckedAt = timestamp(restore.checkedAt, "restore.checkedAt");
  const postgresMajor = integer(restore.postgresMajor, "restore.postgresMajor", 14);
  exact(postgresMajor, manifest.postgresMajor, "restore.postgresMajor");
  exact(
    digest(restore.backupManifestSha256, "restore.backupManifestSha256"),
    manifest.manifestSha256,
    "restore.backupManifestSha256"
  );
  exact(
    digest(restore.archiveSha256, "restore.archiveSha256"),
    manifest.archive.sha256,
    "restore.archiveSha256"
  );
  const migrations = record(restore.migrations, "restore.migrations");
  const migrationCount = integer(migrations.count, "restore.migrations.count", 1);
  const migrationSha256 = digest(migrations.sha256, "restore.migrations.sha256");
  exact(migrationCount, manifest.migrations.count, "restore.migrations.count");
  exact(migrationSha256, manifest.migrations.sha256, "restore.migrations.sha256");
  readyChecks(restore.checks, "restore.checks", RECOVERY_CHECKS, false);
  const restoreEvidenceSha256 = digest(restore.evidenceSha256, "restore.evidenceSha256");
  const withoutDigest = {
    schemaVersion: restore.schemaVersion,
    kind: restore.kind,
    releaseId: restore.releaseId,
    applicationCommitSha: restore.applicationCommitSha,
    result: restore.result,
    checkedAt: restoreCheckedAt,
    postgresMajor,
    backupManifestSha256: restore.backupManifestSha256,
    archiveSha256: restore.archiveSha256,
    migrations: { count: migrationCount, sha256: migrationSha256 },
    checks: restore.checks,
  };
  exact(restoreEvidenceSha256, flowcordiaRecoverySha256(withoutDigest), "restore.evidenceSha256");
  const backupCreatedAt = timestamp(manifest.createdAt, "backup.createdAt");
  if (Date.parse(backupCreatedAt) > Date.parse(restoreCheckedAt)) {
    throw new Error("restore.checkedAt precedes backup.createdAt.");
  }
  requireFresh(backupCreatedAt, input.checkedAt, input.maximumAgeMs, "backup.createdAt");
  requireFresh(restoreCheckedAt, input.checkedAt, input.maximumAgeMs, "restore.checkedAt");
  return {
    backupCreatedAt,
    restoreCheckedAt,
    postgresMajor,
    migrationCount,
    migrationSha256,
    backupManifestSha256: manifest.manifestSha256,
    restoreEvidenceSha256,
  };
}

function validateUpgrade(input: {
  evidence: unknown;
  currentApplicationCommitSha: string;
  targetApplicationCommitSha: string;
  recovery: FlowcordiaReleaseCandidateEvidence["summary"]["recovery"];
  checkedAt: string;
  maximumAgeMs: number;
}): FlowcordiaReleaseCandidateEvidence["summary"]["upgrade"] {
  const outer = record(input.evidence, "upgradeEvidence");
  exact(outer.schemaVersion, "0.1", "upgradeEvidence.schemaVersion");
  exact(outer.state, "READY", "upgradeEvidence.state");
  exact(outer.phase, "upgrade", "upgradeEvidence.phase");
  const observedAt = timestamp(outer.checkedAt, "upgradeEvidence.checkedAt");
  validateInstallation(outer.configuration, observedAt, "upgradeEvidence.configuration");
  assertMessage(outer.message, "upgradeEvidence.message");

  const upgrade = record(outer.upgrade, "upgradeEvidence.upgrade");
  exact(upgrade.schemaVersion, "0.1", "upgradeEvidence.upgrade.schemaVersion");
  exact(upgrade.state, "READY", "upgradeEvidence.upgrade.state");
  exact(upgrade.checkedAt, observedAt, "upgradeEvidence.upgrade.checkedAt");
  exact(
    applicationSha(upgrade.currentApplicationCommitSha, "upgrade.currentApplicationCommitSha"),
    input.currentApplicationCommitSha,
    "upgrade.currentApplicationCommitSha"
  );
  exact(
    applicationSha(upgrade.targetApplicationCommitSha, "upgrade.targetApplicationCommitSha"),
    input.targetApplicationCommitSha,
    "upgrade.targetApplicationCommitSha"
  );
  const kind = upgrade.kind;
  if (!(kind === "application_only" || kind === "append_only_migrations")) {
    throw new Error("upgrade.kind is invalid.");
  }
  const migrations = record(upgrade.migrations, "upgrade.migrations");
  const currentMigrationCount = integer(migrations.currentCount, "upgrade.currentCount", 1);
  const targetMigrationCount = integer(migrations.targetCount, "upgrade.targetCount", 1);
  const pendingMigrationCount = integer(migrations.pendingCount, "upgrade.pendingCount");
  const currentMigrationSha256 = digest(migrations.currentDigest, "upgrade.currentDigest");
  const targetMigrationSha256 = digest(migrations.targetDigest, "upgrade.targetDigest");
  if (
    targetMigrationCount - currentMigrationCount !== pendingMigrationCount ||
    currentMigrationCount !== input.recovery.migrationCount
  ) {
    throw new Error("upgrade migration counts do not match recovery evidence.");
  }
  if (
    (upgrade.kind === "application_only" && pendingMigrationCount !== 0) ||
    (upgrade.kind === "append_only_migrations" && pendingMigrationCount < 1)
  ) {
    throw new Error("upgrade kind does not match its migration delta.");
  }
  const recovery = record(upgrade.recovery, "upgrade.recovery");
  if (upgrade.kind === "append_only_migrations") {
    exact(recovery.required, true, "upgrade.recovery.required");
    exact(
      digest(recovery.backupManifestSha256, "upgrade.recovery.backupManifestSha256"),
      input.recovery.backupManifestSha256,
      "upgrade.recovery.backupManifestSha256"
    );
    exact(
      digest(recovery.restoreEvidenceSha256, "upgrade.recovery.restoreEvidenceSha256"),
      input.recovery.restoreEvidenceSha256,
      "upgrade.recovery.restoreEvidenceSha256"
    );
  } else {
    exact(recovery.required, false, "upgrade.recovery.required");
  }
  if (
    !Array.isArray(upgrade.steps) ||
    upgrade.steps.length < 6 ||
    upgrade.steps.some((step) => !UPGRADE_STEPS.includes(step as never)) ||
    new Set(upgrade.steps).size !== upgrade.steps.length ||
    !upgrade.steps.includes("connected_acceptance")
  ) {
    throw new Error("upgrade.steps is invalid.");
  }
  readyChecks(upgrade.checks, "upgrade.checks", UPGRADE_CHECKS, true);
  assertMessage(upgrade.message, "upgrade.message");
  requireFresh(observedAt, input.checkedAt, input.maximumAgeMs, "upgrade.checkedAt");
  if (Date.parse(input.recovery.restoreCheckedAt) > Date.parse(observedAt)) {
    throw new Error("upgrade.checkedAt precedes restore.checkedAt.");
  }
  return {
    checkedAt: observedAt,
    kind,
    currentMigrationCount,
    targetMigrationCount,
    pendingMigrationCount,
    currentMigrationSha256,
    targetMigrationSha256,
  };
}

export function validateFlowcordiaReleaseCandidateEvidence(input: {
  liveDependencyEvidence: unknown;
  backupManifestEvidence: unknown;
  restoreEvidence: unknown;
  upgradeEvidence: unknown;
  releaseId: string;
  currentApplicationCommitSha: string;
  targetApplicationCommitSha: string;
  checkedAt: string;
  maximumAgeMs?: number;
}): FlowcordiaReleaseCandidateEvidence {
  if (!RELEASE_ID.test(input.releaseId)) throw new Error("releaseId is invalid.");
  const currentApplicationCommitSha = applicationSha(
    input.currentApplicationCommitSha,
    "currentApplicationCommitSha"
  );
  const targetApplicationCommitSha = applicationSha(
    input.targetApplicationCommitSha,
    "targetApplicationCommitSha"
  );
  if (currentApplicationCommitSha === targetApplicationCommitSha) {
    throw new Error("Current and target application revisions must be distinct.");
  }
  const checkedAt = timestamp(input.checkedAt, "checkedAt");
  const maximumAgeMs = input.maximumAgeMs ?? FLOWCORDIA_RELEASE_CANDIDATE_MAX_AGE_MS;
  if (
    !Number.isSafeInteger(maximumAgeMs) ||
    maximumAgeMs < 60_000 ||
    maximumAgeMs > 7 * 24 * 60 * 60 * 1_000
  ) {
    throw new Error("Release-candidate freshness window is invalid.");
  }
  const liveDependencies = validateLiveDependencies(
    input.liveDependencyEvidence,
    checkedAt,
    maximumAgeMs
  );
  const recovery = validateRecovery({
    manifestEvidence: input.backupManifestEvidence,
    restoreEvidence: input.restoreEvidence,
    releaseId: input.releaseId,
    currentApplicationCommitSha,
    checkedAt,
    maximumAgeMs,
  });
  const upgrade = validateUpgrade({
    evidence: input.upgradeEvidence,
    currentApplicationCommitSha,
    targetApplicationCommitSha,
    recovery,
    checkedAt,
    maximumAgeMs,
  });
  if (Date.parse(liveDependencies.checkedAt) > Date.parse(recovery.backupCreatedAt)) {
    throw new Error("Backup evidence precedes live dependency readiness.");
  }
  return {
    schemaVersion: FLOWCORDIA_RELEASE_CANDIDATE_EVIDENCE_SCHEMA_VERSION,
    state: "READY",
    releaseId: input.releaseId,
    currentApplicationCommitSha,
    targetApplicationCommitSha,
    checkedAt,
    summary: { liveDependencies, recovery, upgrade },
  };
}
