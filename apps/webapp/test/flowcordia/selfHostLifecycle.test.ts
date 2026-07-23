import { describe, expect, it } from "vitest";
import {
  createFlowcordiaBackupManifest,
  createFlowcordiaRestoreEvidence,
  flowcordiaRecoverySha256,
} from "../../app/features/flowcordia/operations/database-recovery";
import { createFlowcordiaMigrationCompletionEvidence } from "../../app/features/flowcordia/operations/migration-evidence";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";
import { createFlowcordiaReleaseImageEvidence } from "../../app/features/flowcordia/operations/release-image-evidence";
import {
  createFlowcordiaSelfHostCleanDependenciesEvidence,
  createFlowcordiaSelfHostInstallationIdentityEvidence,
} from "../../app/features/flowcordia/operations/self-host-lifecycle-preflight";
import {
  createFlowcordiaSelfHostLifecycleEvidence,
  FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES,
  parseFlowcordiaSelfHostLifecycleEvidence,
} from "../../app/features/flowcordia/operations/self-host-lifecycle";
import { presentFlowcordiaDoctor } from "../../../../docker/scripts/flowcordia-doctor.mjs";

const CURRENT_SHA = "0123456789abcdef0123456789abcdef01234567";
const TARGET_SHA = "1123456789abcdef0123456789abcdef01234567";
const UPSTREAM_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const CURRENT_IMAGE = "a".repeat(64);
const TARGET_IMAGE = "c".repeat(64);
const FIRST_MIGRATION = { name: "20260101000000_initial", checksum: "b".repeat(64) };
const SECOND_MIGRATION = { name: "20260202000000_second", checksum: "d".repeat(64) };

function release(input: {
  releaseId: string;
  version: string;
  applicationSha: string;
  imageDigest: string;
  createdAt: string;
  migrations: Array<{ name: string; checksum: string }>;
}) {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: input.releaseId,
    version: input.version,
    applicationCommitSha: input.applicationSha,
    upstreamCommitSha: UPSTREAM_SHA,
    createdAt: new Date(input.createdAt),
    imageReference: `ghcr.io/ahamdjin/flowcordia@sha256:${input.imageDigest}`,
    migrations: input.migrations,
  });
}

function publication(manifest: ReturnType<typeof release>, runId: string, at: string) {
  return createFlowcordiaReleaseImageEvidence({
    releaseManifest: manifest,
    repository: "ahamdjin/flowcordia",
    runId,
    runAttempt: 1,
    attestationId: String(Number(runId) + 100),
    createdAt: at,
  });
}

function observations(start: string) {
  const startMs = Date.parse(start);
  const phases = FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES.map((key, index) => ({
    key,
    state: "READY" as const,
    observedAt: new Date(startMs + (index + 1) * 60_000).toISOString(),
  }));
  return {
    schemaVersion: "0.1" as const,
    kind: "flowcordia-self-host-lifecycle-observations" as const,
    workspaceId: "012345abcdef",
    startedAt: new Date(startMs).toISOString(),
    completedAt: new Date(startMs + (phases.length + 1) * 60_000).toISOString(),
    phases,
    teardown: {
      applicationContainersAbsent: true as const,
      applicationNetworkAbsent: true as const,
      applicationVolumesAbsent: true as const,
    },
  };
}

function doctor(manifest: ReturnType<typeof release>, at: string) {
  const ready = {
    database: "READY",
    migrations: "READY",
    redis: "READY",
    clickhouse: "READY",
    electric: "READY",
    objectStore: "READY",
    email: "READY",
    githubApp: "READY",
    workerHeartbeat: "READY",
    publicOrigin: "READY",
    publicOriginReachability: "READY",
    webHealth: "READY",
    operationsLocalHealth: "READY",
  } as const;
  return presentFlowcordiaDoctor({
    profile: "release",
    release: manifest,
    checkedAt: new Date(at),
    releaseIdentityReady: true,
    configurationReady: true,
    observations: ready,
  });
}

function deploymentEnvironment(manifest: ReturnType<typeof release>) {
  return {
    APP_ENV: "production",
    NODE_ENV: "production",
    APP_ORIGIN: "https://flowcordia.example.com",
    LOGIN_ORIGIN: "https://flowcordia.example.com",
    DATABASE_HOST: "postgres.internal:5432",
    DATABASE_URL:
      "postgresql://flowcordia:password@postgres.internal:5432/flowcordia?schema=public",
    DIRECT_URL: "postgresql://migrator:password@postgres.internal:5432/flowcordia?schema=public",
    REDIS_HOST: "redis.internal",
    REDIS_PORT: "6379",
    REDIS_USERNAME: "flowcordia",
    REDIS_TLS_DISABLED: "false",
    ELECTRIC_ORIGIN: "https://electric.internal",
    RUN_REPLICATION_ENABLED: "1",
    EVENT_REPOSITORY_DEFAULT_STORE: "clickhouse_v2",
    CLICKHOUSE_URL: "https://default:password@clickhouse.internal:8443/default",
    RUN_REPLICATION_CLICKHOUSE_URL: "https://default:password@clickhouse.internal:8443/default",
    OBJECT_STORE_BASE_URL: "https://s3.example.net",
    OBJECT_STORE_BUCKET: "flowcordia-packets",
    OBJECT_STORE_REGION: "us-east-1",
    OBJECT_STORE_SERVICE: "s3",
    OBJECT_STORE_DEFAULT_PROTOCOL: "s3",
    OBJECT_STORE_FORCE_PATH_STYLE: "false",
    EMAIL_TRANSPORT: "resend",
    FROM_EMAIL: "Flowcordia <no-reply@flowcordia.example>",
    REPLY_TO_EMAIL: "support@flowcordia.example",
    GITHUB_APP_ENABLED: "1",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_SLUG: "flowcordia-example",
    FLOWCORDIA_PROPOSAL_EVENT_URL: "https://flowcordia.example.com/api/flowcordia/proposal-events",
    SESSION_SECRET: "S2F3qW4eR5tY6uI7oP8aS9dF0gH1jK2l",
    MAGIC_LINK_SECRET: "M3nB4vC5xZ6aS7dF8gH9jK0lQ1wE2rT3",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    FLOWCORDIA_PROPOSAL_EVENT_SECRET: "P9oI8uY7tR6eW5qA4sD3fG2hJ1kL0mN9",
    FLOWCORDIA_IMAGE_REFERENCE: manifest.image.reference,
    FLOWCORDIA_IMAGE_DIGEST: manifest.image.digest,
    FLOWCORDIA_APPLICATION_COMMIT_SHA: manifest.applicationCommitSha,
    FLOWCORDIA_RELEASE_MANIFEST_SHA256: manifest.manifestSha256,
    FLOWCORDIA_MIGRATION_CONFIRM: manifest.releaseId,
  };
}

function upgrade(input: {
  current: ReturnType<typeof release>;
  target: ReturnType<typeof release>;
  backup: ReturnType<typeof createFlowcordiaBackupManifest>;
  restore: ReturnType<typeof createFlowcordiaRestoreEvidence>;
  checkedAt: string;
}) {
  const pending = input.target.migrations.count - input.current.migrations.count;
  const kind = pending > 0 ? "append_only_migrations" : "application_only";
  return {
    schemaVersion: "0.1",
    state: "READY",
    phase: "upgrade",
    checkedAt: input.checkedAt,
    configuration: {
      schemaVersion: "0.1",
      profile: "release",
      state: "READY",
      checkedAt: input.checkedAt,
    },
    upgrade: {
      schemaVersion: "0.1",
      state: "READY",
      kind,
      checkedAt: input.checkedAt,
      currentApplicationCommitSha: input.current.applicationCommitSha,
      targetApplicationCommitSha: input.target.applicationCommitSha,
      migrations: {
        currentCount: input.current.migrations.count,
        targetCount: input.target.migrations.count,
        pendingCount: pending,
        currentDigest: input.current.migrations.sha256,
        targetDigest: input.target.migrations.sha256,
      },
      recovery:
        kind === "append_only_migrations"
          ? {
              required: true,
              backupManifestSha256: input.backup.manifestSha256,
              restoreEvidenceSha256: input.restore.evidenceSha256,
            }
          : { required: false },
      steps: ["verify_candidate_configuration", "verify_release", "connected_acceptance"],
      checks: Array.from({ length: 8 }, (_, index) => ({
        key: `check-${index}`,
        state: "READY",
        message: "The protected upgrade boundary is ready.",
      })),
    },
    message: "The protected upgrade boundary is ready.",
  };
}

function fixture(migrationUpgrade = false) {
  const current = release({
    releaseId: "flowcordia-0.1.0",
    version: "0.1.0",
    applicationSha: CURRENT_SHA,
    imageDigest: CURRENT_IMAGE,
    createdAt: "2026-07-23T00:00:00.000Z",
    migrations: [FIRST_MIGRATION],
  });
  const target = release({
    releaseId: "flowcordia-0.2.0",
    version: "0.2.0",
    applicationSha: TARGET_SHA,
    imageDigest: TARGET_IMAGE,
    createdAt: "2026-07-23T00:10:00.000Z",
    migrations: migrationUpgrade ? [FIRST_MIGRATION, SECOND_MIGRATION] : [FIRST_MIGRATION],
  });
  const backup = createFlowcordiaBackupManifest({
    releaseId: current.releaseId,
    applicationCommitSha: current.applicationCommitSha,
    createdAt: new Date("2026-07-23T01:07:00.000Z"),
    postgresMajor: 16,
    archiveBytes: 4096,
    archiveSha256: "e".repeat(64),
    inventorySha256: "f".repeat(64),
    migrations: [FIRST_MIGRATION.name],
  });
  const restore = createFlowcordiaRestoreEvidence({
    manifest: backup,
    checkedAt: new Date("2026-07-23T01:08:00.000Z"),
    archiveSha256: backup.archive.sha256,
    restoredMigrations: [FIRST_MIGRATION.name],
  });
  const installationIdentity = createFlowcordiaSelfHostInstallationIdentityEvidence({
    currentManifest: current,
    targetManifest: target,
    currentEnvironment: deploymentEnvironment(current),
    targetEnvironment: deploymentEnvironment(target),
    checkedAt: new Date("2026-07-23T01:01:00.000Z"),
  });
  const cleanDependencies = createFlowcordiaSelfHostCleanDependenciesEvidence({
    releaseManifest: current,
    checkedAt: new Date("2026-07-23T01:02:00.000Z"),
    observations: {
      primary_postgresql: "READY",
      dashboard_agent_postgresql: "READY",
      clickhouse: "READY",
    },
  });
  const currentMigration = createFlowcordiaMigrationCompletionEvidence({
    releaseManifest: current,
    completedAt: "2026-07-23T01:02:00.000Z",
  });
  const targetMigration = createFlowcordiaMigrationCompletionEvidence({
    releaseManifest: target,
    completedAt: "2026-07-23T01:10:00.000Z",
  });
  const installDoctor = doctor(current, "2026-07-23T01:04:00.000Z");
  const restartDoctor = doctor(current, "2026-07-23T01:06:00.000Z");
  const targetDoctor = doctor(target, "2026-07-23T01:12:00.000Z");
  const rollbackDoctor = doctor(current, "2026-07-23T01:13:00.000Z");
  const upgradeEvidence = upgrade({
    current,
    target,
    backup,
    restore,
    checkedAt: "2026-07-23T01:09:00.000Z",
  });
  return {
    current,
    target,
    installationIdentity,
    cleanDependencies,
    currentMigration,
    targetMigration,
    installDoctor,
    restartDoctor,
    targetDoctor,
    rollbackDoctor,
    backup,
    restore,
    upgradeEvidence,
    observations: observations("2026-07-23T01:00:00.000Z"),
  };
}

function createEvidence(migrationUpgrade = false) {
  const value = fixture(migrationUpgrade);
  return createFlowcordiaSelfHostLifecycleEvidence({
    currentManifest: value.current,
    currentImageEvidence: publication(value.current, "30000000001", "2026-07-23T00:01:00.000Z"),
    installationIdentityEvidence: value.installationIdentity,
    cleanDependenciesEvidence: value.cleanDependencies,
    currentMigrationEvidence: value.currentMigration,
    currentInstallDiagnostics: value.installDoctor,
    currentRestartDiagnostics: value.restartDoctor,
    backupManifest: value.backup,
    restoreEvidence: value.restore,
    upgradeEvidence: value.upgradeEvidence,
    targetManifest: value.target,
    targetImageEvidence: publication(value.target, "30000000002", "2026-07-23T00:11:00.000Z"),
    targetMigrationEvidence: value.targetMigration,
    targetDiagnostics: value.targetDoctor,
    rollbackDiagnostics: migrationUpgrade ? undefined : value.rollbackDoctor,
    observations: value.observations,
    checkedAt: new Date("2026-07-23T01:18:00.000Z"),
    source: {
      repository: "ahamdjin/flowcordia",
      runId: "30000000003",
      runAttempt: 1,
      sourceCommitSha: TARGET_SHA,
    },
  });
}

describe("Flowcordia published self-host lifecycle evidence", () => {
  it("binds a clean install, restart, application upgrade, rollback, and teardown", () => {
    const evidence = createEvidence(false);

    expect(parseFlowcordiaSelfHostLifecycleEvidence(evidence)).toEqual(evidence);
    expect(evidence).toMatchObject({
      schemaVersion: "0.1",
      kind: "flowcordia-self-host-lifecycle",
      state: "READY",
      current: { releaseId: "flowcordia-0.1.0" },
      target: { releaseId: "flowcordia-0.2.0" },
      upgrade: { kind: "application_only", pendingMigrationCount: 0 },
      rollback: {
        mode: "application_rollback",
        restoredReleaseId: "flowcordia-0.1.0",
        recoveryRequired: false,
      },
    });
    expect(evidence.installation.installationSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.phases.map((phase) => phase.key)).toEqual(
      FLOWCORDIA_SELF_HOST_LIFECYCLE_PHASES
    );
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("proves the restore-required boundary without unsafe backward startup", () => {
    const evidence = createEvidence(true);

    expect(evidence.upgrade).toMatchObject({
      kind: "append_only_migrations",
      pendingMigrationCount: 1,
    });
    expect(evidence.rollback).toEqual({ mode: "restore_required", recoveryRequired: true });
  });

  it("rejects reused publication, diagnostics, and mixed release identity", () => {
    const value = fixture(false);
    const currentPublication = publication(
      value.current,
      "30000000001",
      "2026-07-23T00:01:00.000Z"
    );
    const targetPublication = publication(value.target, "30000000001", "2026-07-23T00:11:00.000Z");
    expect(() =>
      createFlowcordiaSelfHostLifecycleEvidence({
        currentManifest: value.current,
        currentImageEvidence: currentPublication,
        installationIdentityEvidence: value.installationIdentity,
        cleanDependenciesEvidence: value.cleanDependencies,
        currentMigrationEvidence: value.currentMigration,
        currentInstallDiagnostics: value.installDoctor,
        currentRestartDiagnostics: value.installDoctor,
        backupManifest: value.backup,
        restoreEvidence: value.restore,
        upgradeEvidence: value.upgradeEvidence,
        targetManifest: value.target,
        targetImageEvidence: targetPublication,
        targetMigrationEvidence: value.targetMigration,
        targetDiagnostics: value.targetDoctor,
        rollbackDiagnostics: value.rollbackDoctor,
        observations: value.observations,
        checkedAt: new Date("2026-07-23T01:18:00.000Z"),
        source: {
          repository: "ahamdjin/flowcordia",
          runId: "30000000003",
          runAttempt: 1,
          sourceCommitSha: TARGET_SHA,
        },
      })
    ).toThrow();
  });

  it("rejects an unsafe previous-app start after migration-bearing upgrade", () => {
    const value = fixture(true);
    expect(() =>
      createFlowcordiaSelfHostLifecycleEvidence({
        currentManifest: value.current,
        currentImageEvidence: publication(value.current, "30000000001", "2026-07-23T00:01:00.000Z"),
        installationIdentityEvidence: value.installationIdentity,
        cleanDependenciesEvidence: value.cleanDependencies,
        currentMigrationEvidence: value.currentMigration,
        currentInstallDiagnostics: value.installDoctor,
        currentRestartDiagnostics: value.restartDoctor,
        backupManifest: value.backup,
        restoreEvidence: value.restore,
        upgradeEvidence: value.upgradeEvidence,
        targetManifest: value.target,
        targetImageEvidence: publication(value.target, "30000000002", "2026-07-23T00:11:00.000Z"),
        targetMigrationEvidence: value.targetMigration,
        targetDiagnostics: value.targetDoctor,
        rollbackDiagnostics: value.rollbackDoctor,
        observations: value.observations,
        checkedAt: new Date("2026-07-23T01:18:00.000Z"),
        source: {
          repository: "ahamdjin/flowcordia",
          runId: "30000000003",
          runAttempt: 1,
          sourceCommitSha: TARGET_SHA,
        },
      })
    ).toThrow("must not start the previous application");
  });

  it("does not project archive paths, credentials, URLs, payloads, or customer data", () => {
    const serialized = JSON.stringify(createEvidence(false));
    for (const forbidden of [
      "postgresql://",
      "ghcr.io",
      "/tmp/",
      "password",
      "secret",
      "payload",
      "customer",
      "providerResponse",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(flowcordiaRecoverySha256(JSON.parse(serialized))).toMatch(/^[0-9a-f]{64}$/);
  });
});
