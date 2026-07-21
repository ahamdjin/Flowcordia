import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createFlowcordiaBackupManifest,
  createFlowcordiaRestoreEvidence,
} from "../../app/features/flowcordia/operations/database-recovery";
import {
  presentFlowcordiaUpgradePreflight,
  type FlowcordiaAppliedMigrationArtifact,
  type FlowcordiaMigrationArtifact,
} from "../../app/features/flowcordia/operations/upgrade-preflight";
import {
  readFlowcordiaAppliedMigrationArtifacts,
  readFlowcordiaTargetMigrationArtifacts,
} from "../../app/features/flowcordia/operations/upgrade-preflight.server";

const currentApplicationCommitSha = "0123456789abcdef0123456789abcdef01234567";
const targetApplicationCommitSha = "89abcdef0123456789abcdef0123456789abcdef";
const now = new Date("2026-07-22T01:00:00.000Z");

function migration(
  name: string,
  checksum: string,
  state: "ready" | "failed" | "rolled_back" = "ready"
): FlowcordiaAppliedMigrationArtifact {
  return {
    name,
    checksum,
    finishedAt: state === "failed" ? null : new Date("2026-07-21T20:00:00.000Z"),
    rolledBackAt: state === "rolled_back" ? new Date("2026-07-21T20:05:00.000Z") : null,
  };
}

const currentMigrations: FlowcordiaAppliedMigrationArtifact[] = [
  migration("20260720000000_first", "a".repeat(64)),
  migration("20260721000000_second", "b".repeat(64)),
];
const sameTarget: FlowcordiaMigrationArtifact[] = currentMigrations.map(({ name, checksum }) => ({
  name,
  checksum,
}));
const appendedTarget: FlowcordiaMigrationArtifact[] = [
  ...sameTarget,
  { name: "20260722000000_third", checksum: "c".repeat(64) },
];

function recoveryEvidence(
  input: {
    manifestCreatedAt?: Date;
    evidenceCheckedAt?: Date;
    applicationCommitSha?: string;
  } = {}
) {
  const names = currentMigrations.map((entry) => entry.name);
  const manifest = createFlowcordiaBackupManifest({
    releaseId: "release-2026.07.22",
    applicationCommitSha: input.applicationCommitSha ?? currentApplicationCommitSha,
    createdAt: input.manifestCreatedAt ?? new Date("2026-07-22T00:00:00.000Z"),
    postgresMajor: 14,
    archiveBytes: 2048,
    archiveSha256: "d".repeat(64),
    inventorySha256: "e".repeat(64),
    migrations: names,
  });
  const evidence = createFlowcordiaRestoreEvidence({
    manifest,
    checkedAt: input.evidenceCheckedAt ?? new Date("2026-07-22T00:15:00.000Z"),
    archiveSha256: manifest.archive.sha256,
    restoredMigrations: names,
  });
  return { manifest, evidence };
}

describe("Flowcordia controlled upgrade preflight", () => {
  it("accepts an application-only upgrade with worker-first rollout and image rollback", () => {
    const result = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: sameTarget,
      checkedAt: now,
    });

    expect(result.state).toBe("READY");
    expect(result.kind).toBe("application_only");
    expect(result.migrations.pendingCount).toBe(0);
    expect(result.recovery).toEqual({ required: false });
    expect(result.steps).toEqual([
      "verify_candidate_configuration",
      "deploy_worker",
      "verify_worker",
      "deploy_web",
      "verify_release",
      "connected_acceptance",
    ]);
    expect(result.checks.every((entry) => entry.state === "READY")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/2026072|migration\.sql|postgresql:|password/i);
  });

  it("requires fresh exact recovery evidence and explicit acknowledgements for migrations", () => {
    const { manifest, evidence } = recoveryEvidence();
    const blocked = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: appendedTarget,
      checkedAt: now,
      backupManifest: manifest,
      restoreEvidence: evidence,
    });
    expect(blocked.state).toBe("BLOCKED");
    expect(blocked.kind).toBe("append_only_migrations");
    expect(blocked.checks.find((entry) => entry.key === "recovery_evidence")?.state).toBe("READY");
    expect(
      blocked.checks
        .filter((entry) =>
          ["migration_review", "maintenance_window", "rollback_acceptance"].includes(entry.key)
        )
        .every((entry) => entry.state === "BLOCKED")
    ).toBe(true);

    const ready = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: appendedTarget,
      checkedAt: now,
      backupManifest: manifest,
      restoreEvidence: evidence,
      confirmMigrationReview: true,
      confirmMaintenanceWindow: true,
      confirmRestoreRollback: true,
    });
    expect(ready.state).toBe("READY");
    expect(ready.migrations.pendingCount).toBe(1);
    expect(ready.recovery).toEqual({
      required: true,
      backupManifestSha256: manifest.manifestSha256,
      restoreEvidenceSha256: evidence.evidenceSha256,
    });
    expect(ready.steps).toEqual([
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
    ]);
  });

  it("blocks rewritten, removed, reordered, or failed migration history", () => {
    const rewritten = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: [{ ...sameTarget[0], checksum: "f".repeat(64) }, sameTarget[1]],
      checkedAt: now,
    });
    expect(rewritten.state).toBe("BLOCKED");
    expect(rewritten.kind).toBe("undetermined");
    expect(rewritten.steps).toEqual([]);
    expect(rewritten.checks.find((entry) => entry.key === "migration_compatibility")?.state).toBe(
      "BLOCKED"
    );
    expect(
      rewritten.checks
        .filter((entry) =>
          [
            "recovery_evidence",
            "migration_review",
            "maintenance_window",
            "rollback_acceptance",
          ].includes(entry.key)
        )
        .every((entry) => entry.state === "BLOCKED")
    ).toBe(true);

    const removed = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: [sameTarget[0]],
      checkedAt: now,
    });
    expect(removed.state).toBe("BLOCKED");

    const reordered = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: [...sameTarget].reverse(),
      checkedAt: now,
    });
    expect(reordered.state).toBe("BLOCKED");
    expect(reordered.checks.find((entry) => entry.key === "candidate_history")?.state).toBe(
      "BLOCKED"
    );

    const failed = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: [
        currentMigrations[0],
        migration("20260721000000_second", "b".repeat(64), "failed"),
      ],
      targetMigrations: sameTarget,
      checkedAt: now,
    });
    expect(failed.state).toBe("BLOCKED");
    expect(failed.checks.find((entry) => entry.key === "database_history")?.state).toBe("BLOCKED");
  });

  it("blocks unchanged application identity, stale evidence, and evidence from another release", () => {
    const unchanged = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha: currentApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: sameTarget,
      checkedAt: now,
    });
    expect(unchanged.state).toBe("BLOCKED");

    const stale = recoveryEvidence({
      manifestCreatedAt: new Date("2026-07-20T00:00:00.000Z"),
      evidenceCheckedAt: new Date("2026-07-20T00:15:00.000Z"),
    });
    const staleResult = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: appendedTarget,
      checkedAt: now,
      backupManifest: stale.manifest,
      restoreEvidence: stale.evidence,
      confirmMigrationReview: true,
      confirmMaintenanceWindow: true,
      confirmRestoreRollback: true,
    });
    expect(staleResult.checks.find((entry) => entry.key === "recovery_evidence")?.state).toBe(
      "BLOCKED"
    );

    const other = recoveryEvidence({
      applicationCommitSha: "fedcba9876543210fedcba9876543210fedcba98",
    });
    const otherResult = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: appendedTarget,
      checkedAt: now,
      backupManifest: other.manifest,
      restoreEvidence: other.evidence,
      confirmMigrationReview: true,
      confirmMaintenanceWindow: true,
      confirmRestoreRollback: true,
    });
    expect(otherResult.checks.find((entry) => entry.key === "recovery_evidence")?.state).toBe(
      "BLOCKED"
    );
  });

  it("rejects tampered restore evidence and invalid recovery age policy", () => {
    const { manifest, evidence } = recoveryEvidence();
    const tampered = {
      ...evidence,
      migrations: { ...evidence.migrations, count: evidence.migrations.count + 1 },
    };
    const result = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations: currentMigrations,
      targetMigrations: appendedTarget,
      checkedAt: now,
      backupManifest: manifest,
      restoreEvidence: tampered,
      confirmMigrationReview: true,
      confirmMaintenanceWindow: true,
      confirmRestoreRollback: true,
    });
    expect(result.checks.find((entry) => entry.key === "recovery_evidence")?.state).toBe("BLOCKED");
    expect(() =>
      presentFlowcordiaUpgradePreflight({
        currentApplicationCommitSha,
        targetApplicationCommitSha,
        appliedMigrations: currentMigrations,
        targetMigrations: sameTarget,
        checkedAt: now,
        recoveryMaxAgeMs: 1,
      })
    ).toThrow("age policy");
  });

  it("reads ordered candidate migration files and hashes exact bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-upgrade-migrations-"));
    try {
      const first = join(directory, "20260720000000_first");
      const second = join(directory, "20260721000000_second");
      await mkdir(first);
      await mkdir(second);
      await writeFile(join(first, "migration.sql"), "CREATE TABLE one (id text);\n");
      await writeFile(join(second, "migration.sql"), "ALTER TABLE one ADD COLUMN two text;\n");

      const artifacts = await readFlowcordiaTargetMigrationArtifacts(directory);
      expect(artifacts).toEqual([
        {
          name: "20260720000000_first",
          checksum: createHash("sha256").update("CREATE TABLE one (id text);\n").digest("hex"),
        },
        {
          name: "20260721000000_second",
          checksum: createHash("sha256")
            .update("ALTER TABLE one ADD COLUMN two text;\n")
            .digest("hex"),
        },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reads live migration checksums and preserves terminal state without mutation", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        migration_name: "20260720000000_first",
        checksum: "a".repeat(64),
        finished_at: new Date("2026-07-21T20:00:00.000Z"),
        rolled_back_at: null,
      },
    ]);
    const artifacts = await readFlowcordiaAppliedMigrationArtifacts({ $queryRawUnsafe: query });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain("checksum");
    expect(artifacts).toEqual([
      {
        name: "20260720000000_first",
        checksum: "a".repeat(64),
        finishedAt: new Date("2026-07-21T20:00:00.000Z"),
        rolledBackAt: null,
      },
    ]);
  });

  it("rejects invalid candidate directories and malformed live migration rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-upgrade-invalid-"));
    try {
      await mkdir(join(directory, "not-a-migration"));
      await expect(readFlowcordiaTargetMigrationArtifacts(directory)).rejects.toThrow(
        "inventory is invalid"
      );
      await expect(
        readFlowcordiaAppliedMigrationArtifacts({
          $queryRawUnsafe: vi.fn().mockResolvedValue([
            {
              migration_name: "20260720000000_first",
              checksum: "invalid",
              finished_at: new Date(),
              rolled_back_at: null,
            },
          ]),
        })
      ).rejects.toThrow("inventory is invalid");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
