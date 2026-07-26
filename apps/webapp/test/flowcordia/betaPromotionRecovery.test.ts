import { describe, expect, it } from "vitest";
import { flowcordiaRecoverySha256 } from "~/features/flowcordia/operations/database-recovery";
import {
  FlowcordiaBetaPromotionRecoveryError,
  createFlowcordiaBetaPromotionRecoveryEvidence,
  type FlowcordiaBetaRecoverySource,
} from "~/features/flowcordia/acceptance/beta-promotion-recovery";

const APPLICATION_SHA = "1234567890abcdef1234567890abcdef12345678";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);

function lifecycle() {
  const value = {
    schemaVersion: "0.1",
    kind: "flowcordia-self-host-lifecycle",
    state: "READY",
    checkedAt: "2026-07-26T00:30:00.000Z",
    current: {
      releaseId: "flowcordia-0.8.0",
      version: "0.8.0",
      applicationCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
      imageDigest: `sha256:${DIGEST_A}`,
      manifestSha256: DIGEST_A,
      publicationEvidenceSha256: DIGEST_A,
      migrationEvidenceSha256: DIGEST_A,
      installDiagnosticsSha256: DIGEST_A,
      restartDiagnosticsSha256: DIGEST_B,
    },
    target: {
      releaseId: "flowcordia-0.9.0-beta.1",
      version: "0.9.0-beta.1",
      applicationCommitSha: APPLICATION_SHA,
      imageDigest: `sha256:${DIGEST_B}`,
      manifestSha256: DIGEST_B,
      publicationEvidenceSha256: DIGEST_B,
      migrationEvidenceSha256: DIGEST_B,
      diagnosticsSha256: DIGEST_C,
    },
    installation: {
      identityEvidenceSha256: DIGEST_A,
      installationSha256: DIGEST_B,
      cleanDependenciesEvidenceSha256: DIGEST_C,
    },
    recovery: {
      backupManifestSha256: DIGEST_A,
      restoreEvidenceSha256: DIGEST_B,
      archiveSha256: DIGEST_C,
      postgresMajor: 16,
    },
    upgrade: {
      kind: "append_only_migrations",
      evidenceSha256: DIGEST_D,
      currentMigrationCount: 10,
      targetMigrationCount: 11,
      pendingMigrationCount: 1,
    },
    rollback: {
      mode: "restore_required",
      recoveryRequired: true,
    },
    phases: [
      { key: "recovery_rehearsal", state: "READY", observedAt: "2026-07-26T00:10:00.000Z" },
      { key: "rollback_boundary", state: "READY", observedAt: "2026-07-26T00:20:00.000Z" },
      { key: "teardown", state: "READY", observedAt: "2026-07-26T00:25:00.000Z" },
    ],
    source: {
      repository: "ahamdjin/flowcordia",
      workflowPath: ".github/workflows/flowcordia-self-host-lifecycle.yml",
      runId: "1001",
      runAttempt: 1,
      sourceRef: "refs/heads/main",
      sourceCommitSha: APPLICATION_SHA,
      runner: "self-hosted",
    },
  };
  return { ...value, evidenceSha256: flowcordiaRecoverySha256(value) };
}

function production(mode: "production" | "rollback_production") {
  const rollback = mode === "rollback_production";
  return {
    schemaVersion: "0.2",
    mode,
    result: "PASSED",
    stage: "complete",
    workflowId: "beta-release",
    proposalId: rollback ? "proposal_rollback" : "proposal_production",
    applicationCommitSha: APPLICATION_SHA,
    startedAt: rollback ? "2026-07-26T02:00:00.000Z" : "2026-07-26T01:00:00.000Z",
    completedAt: rollback ? "2026-07-26T02:10:00.000Z" : "2026-07-26T01:10:00.000Z",
    production: {
      expectedHeadSha: rollback
        ? "fedcba0987654321fedcba0987654321fedcba09"
        : "234567890abcdef1234567890abcdef123456789",
      observedHeadSha: rollback
        ? "fedcba0987654321fedcba0987654321fedcba09"
        : "234567890abcdef1234567890abcdef123456789",
      mergeCommitSha: rollback
        ? "34567890abcdef1234567890abcdef1234567890"
        : "4567890abcdef1234567890abcdef12345678901",
      deploymentCommitSha: rollback
        ? "34567890abcdef1234567890abcdef1234567890"
        : "4567890abcdef1234567890abcdef12345678901",
      deploymentVersion: rollback ? "deploy-rollback-1" : "deploy-production-1",
      closure: {
        state: "READY",
        digest: rollback ? DIGEST_C : DIGEST_B,
        expectedCount: rollback ? 2 : 3,
        installedCount: rollback ? 2 : 3,
      },
      run: {
        friendlyId: rollback ? "run_rollback" : "run_production",
        status: "COMPLETED_SUCCESSFULLY",
        proof: "VERIFIED",
      },
    },
  };
}

function sources(): [
  FlowcordiaBetaRecoverySource,
  FlowcordiaBetaRecoverySource,
  FlowcordiaBetaRecoverySource,
] {
  return [
    {
      stage: "self_host_lifecycle",
      runId: "1001",
      runAttempt: 1,
      workflowPath: ".github/workflows/flowcordia-self-host-lifecycle.yml",
      workflowCommitSha: APPLICATION_SHA,
      artifactName: "flowcordia-self-host-lifecycle-1001-1",
      artifactArchiveSha256: DIGEST_A,
      evidenceSha256: DIGEST_B,
    },
    {
      stage: "production",
      runId: "1002",
      runAttempt: 1,
      workflowPath: ".github/workflows/flowcordia-production-acceptance.yml",
      workflowCommitSha: APPLICATION_SHA,
      artifactName: "flowcordia-production-beta-release-1002",
      artifactArchiveSha256: DIGEST_B,
      evidenceSha256: DIGEST_C,
    },
    {
      stage: "rollback_production",
      runId: "1003",
      runAttempt: 1,
      workflowPath: ".github/workflows/flowcordia-production-acceptance.yml",
      workflowCommitSha: APPLICATION_SHA,
      artifactName: "flowcordia-rollback_production-beta-release-1003",
      artifactArchiveSha256: DIGEST_C,
      evidenceSha256: DIGEST_D,
    },
  ];
}

describe("Flowcordia Beta promotion and recovery evidence", () => {
  it("binds lifecycle recovery to distinct production and rollback proof", () => {
    const result = createFlowcordiaBetaPromotionRecoveryEvidence({
      releaseId: "flowcordia-0.9.0-beta.1",
      applicationCommitSha: APPLICATION_SHA,
      workflowId: "beta-release",
      lifecycleEvidence: lifecycle(),
      productionEvidence: production("production"),
      rollbackProductionEvidence: production("rollback_production"),
      sources: sources(),
      checkedAt: new Date("2026-07-26T02:15:00.000Z"),
    });
    expect(result.state).toBe("READY");
    expect(result.lifecycle.rollbackMode).toBe("restore_required");
    expect(result.lifecycle.backupManifestSha256).toBe(DIGEST_A);
    expect(result.production.deploymentVersion).not.toBe(
      result.rollbackProduction.deploymentVersion
    );
    expect(result.sources.map((source) => source.runId)).toEqual(["1001", "1002", "1003"]);
    expect(result.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects reused rollback identity", () => {
    const rollback = production("rollback_production");
    rollback.production.deploymentVersion = "deploy-production-1";
    expect(() =>
      createFlowcordiaBetaPromotionRecoveryEvidence({
        releaseId: "flowcordia-0.9.0-beta.1",
        applicationCommitSha: APPLICATION_SHA,
        workflowId: "beta-release",
        lifecycleEvidence: lifecycle(),
        productionEvidence: production("production"),
        rollbackProductionEvidence: rollback,
        sources: sources(),
        checkedAt: new Date("2026-07-26T02:15:00.000Z"),
      })
    ).toThrowError(FlowcordiaBetaPromotionRecoveryError);
  });

  it("rejects rollback before promoted production completion", () => {
    const rollback = production("rollback_production");
    rollback.startedAt = "2026-07-26T01:05:00.000Z";
    rollback.completedAt = "2026-07-26T01:06:00.000Z";
    expect(() =>
      createFlowcordiaBetaPromotionRecoveryEvidence({
        releaseId: "flowcordia-0.9.0-beta.1",
        applicationCommitSha: APPLICATION_SHA,
        workflowId: "beta-release",
        lifecycleEvidence: lifecycle(),
        productionEvidence: production("production"),
        rollbackProductionEvidence: rollback,
        sources: sources(),
        checkedAt: new Date("2026-07-26T02:15:00.000Z"),
      })
    ).toThrow(/chronology/i);
  });

  it("rejects a modified lifecycle digest", () => {
    const modified = lifecycle();
    modified.recovery.archiveSha256 = DIGEST_D;
    expect(() =>
      createFlowcordiaBetaPromotionRecoveryEvidence({
        releaseId: "flowcordia-0.9.0-beta.1",
        applicationCommitSha: APPLICATION_SHA,
        workflowId: "beta-release",
        lifecycleEvidence: modified,
        productionEvidence: production("production"),
        rollbackProductionEvidence: production("rollback_production"),
        sources: sources(),
        checkedAt: new Date("2026-07-26T02:15:00.000Z"),
      })
    ).toThrow(/digest/i);
  });
});
