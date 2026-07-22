import { describe, expect, it } from "vitest";
import { validateFlowcordiaReleaseCandidateEvidence } from "../../app/features/flowcordia/acceptance/release-candidate-evidence.server";
import {
  createFlowcordiaBackupManifest,
  createFlowcordiaRestoreEvidence,
} from "../../app/features/flowcordia/operations/database-recovery";

const releaseId = "release-2026-07-23";
const currentApplicationCommitSha = "0123456789abcdef0123456789abcdef01234567";
const targetApplicationCommitSha = "89abcdef0123456789abcdef0123456789abcdef";
const migration = "20260722000000_current";
const nextMigration = "20260723000000_candidate";

const installationCheckKeys = [
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
const dependencyCheckKeys = [
  "database_connection",
  "database_migrations",
  "github_app",
  "worker_heartbeat",
] as const;
const upgradeCheckKeys = [
  "application_identity",
  "database_history",
  "candidate_history",
  "migration_compatibility",
  "recovery_evidence",
  "migration_review",
  "maintenance_window",
  "rollback_acceptance",
] as const;

function readyChecks(keys: readonly string[]) {
  return keys.map((key) => ({ key, state: "READY" as const, message: `${key} is ready.` }));
}

function installation(checkedAt: string) {
  return {
    schemaVersion: "0.1" as const,
    profile: "release" as const,
    state: "READY" as const,
    message: "Release configuration is ready.",
    checkedAt,
    checks: readyChecks(installationCheckKeys),
  };
}

function fixture() {
  const liveCheckedAt = "2026-07-23T00:00:00.000Z";
  const backupCreatedAt = new Date("2026-07-23T00:10:00.000Z");
  const restoreCheckedAt = new Date("2026-07-23T00:20:00.000Z");
  const upgradeCheckedAt = "2026-07-23T00:30:00.000Z";
  const checkedAt = "2026-07-23T00:40:00.000Z";
  const manifest = createFlowcordiaBackupManifest({
    releaseId,
    applicationCommitSha: currentApplicationCommitSha,
    createdAt: backupCreatedAt,
    postgresMajor: 16,
    archiveBytes: 4096,
    archiveSha256: "a".repeat(64),
    inventorySha256: "b".repeat(64),
    migrations: [migration],
  });
  const restore = createFlowcordiaRestoreEvidence({
    manifest,
    checkedAt: restoreCheckedAt,
    archiveSha256: manifest.archive.sha256,
    restoredMigrations: [migration],
  });
  const liveDependencyEvidence = {
    schemaVersion: "0.1" as const,
    profile: "release" as const,
    state: "READY" as const,
    phase: "dependencies" as const,
    checkedAt: liveCheckedAt,
    configuration: installation(liveCheckedAt),
    dependencies: {
      schemaVersion: "0.1" as const,
      profile: "release" as const,
      state: "READY" as const,
      message: "Live dependencies are ready.",
      checkedAt: liveCheckedAt,
      checks: readyChecks(dependencyCheckKeys),
    },
  };
  const upgradeEvidence = {
    schemaVersion: "0.1" as const,
    state: "READY" as const,
    phase: "upgrade" as const,
    checkedAt: upgradeCheckedAt,
    configuration: installation(upgradeCheckedAt),
    upgrade: {
      schemaVersion: "0.1" as const,
      state: "READY" as const,
      kind: "append_only_migrations" as const,
      checkedAt: upgradeCheckedAt,
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      migrations: {
        currentCount: 1,
        targetCount: 2,
        pendingCount: 1,
        currentDigest: "c".repeat(64),
        targetDigest: "d".repeat(64),
      },
      recovery: {
        required: true,
        backupManifestSha256: manifest.manifestSha256,
        restoreEvidenceSha256: restore.evidenceSha256,
      },
      steps: [
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
      ],
      checks: readyChecks(upgradeCheckKeys),
      message: `Candidate adds ${nextMigration} without rewriting applied history.`,
    },
    message: "The release upgrade decision is ready.",
  };
  return {
    liveDependencyEvidence,
    manifest,
    restore,
    upgradeEvidence,
    checkedAt,
  };
}

describe("Flowcordia release-candidate evidence", () => {
  it("accepts one exact fresh dependency, recovery, and migration upgrade chain", () => {
    const evidence = fixture();
    const result = validateFlowcordiaReleaseCandidateEvidence({
      liveDependencyEvidence: evidence.liveDependencyEvidence,
      backupManifestEvidence: evidence.manifest,
      restoreEvidence: evidence.restore,
      upgradeEvidence: evidence.upgradeEvidence,
      releaseId,
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      checkedAt: evidence.checkedAt,
    });

    expect(result).toMatchObject({
      schemaVersion: "0.1",
      state: "READY",
      releaseId,
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      summary: {
        liveDependencies: { profile: "release" },
        recovery: {
          migrationCount: 1,
          backupManifestSha256: evidence.manifest.manifestSha256,
          restoreEvidenceSha256: evidence.restore.evidenceSha256,
        },
        upgrade: { kind: "append_only_migrations", pendingMigrationCount: 1 },
      },
    });
  });

  it("rejects upgrade evidence for another target application", () => {
    const evidence = fixture();
    evidence.upgradeEvidence.upgrade.targetApplicationCommitSha =
      "fedcba9876543210fedcba9876543210fedcba98";
    expect(() =>
      validateFlowcordiaReleaseCandidateEvidence({
        liveDependencyEvidence: evidence.liveDependencyEvidence,
        backupManifestEvidence: evidence.manifest,
        restoreEvidence: evidence.restore,
        upgradeEvidence: evidence.upgradeEvidence,
        releaseId,
        currentApplicationCommitSha,
        targetApplicationCommitSha,
        checkedAt: evidence.checkedAt,
      })
    ).toThrow(/targetApplicationCommitSha/);
  });

  it("rejects stale live dependency evidence", () => {
    const evidence = fixture();
    evidence.liveDependencyEvidence.checkedAt = "2026-07-21T00:00:00.000Z";
    evidence.liveDependencyEvidence.configuration.checkedAt =
      evidence.liveDependencyEvidence.checkedAt;
    evidence.liveDependencyEvidence.dependencies.checkedAt =
      evidence.liveDependencyEvidence.checkedAt;
    expect(() =>
      validateFlowcordiaReleaseCandidateEvidence({
        liveDependencyEvidence: evidence.liveDependencyEvidence,
        backupManifestEvidence: evidence.manifest,
        restoreEvidence: evidence.restore,
        upgradeEvidence: evidence.upgradeEvidence,
        releaseId,
        currentApplicationCommitSha,
        targetApplicationCommitSha,
        checkedAt: evidence.checkedAt,
      })
    ).toThrow(/freshness window/);
  });

  it("rejects tampered restore evidence", () => {
    const evidence = fixture();
    const tampered = { ...evidence.restore, evidenceSha256: "e".repeat(64) };
    expect(() =>
      validateFlowcordiaReleaseCandidateEvidence({
        liveDependencyEvidence: evidence.liveDependencyEvidence,
        backupManifestEvidence: evidence.manifest,
        restoreEvidence: tampered,
        upgradeEvidence: evidence.upgradeEvidence,
        releaseId,
        currentApplicationCommitSha,
        targetApplicationCommitSha,
        checkedAt: evidence.checkedAt,
      })
    ).toThrow(/restore.evidenceSha256/);
  });
});
