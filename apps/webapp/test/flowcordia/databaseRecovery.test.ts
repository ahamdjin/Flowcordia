import { basename, join } from "node:path";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  assertCompatiblePostgresMajors,
  assertDistinctDatabaseIdentity,
  createFlowcordiaBackupManifest,
  createFlowcordiaRestoreEvidence,
  flowcordiaMigrationSet,
  flowcordiaRestoreDatabaseName,
  parseFlowcordiaBackupManifest,
  parsePostgresMajor,
} from "../../app/features/flowcordia/operations/database-recovery";
import {
  createFlowcordiaDatabaseBackup,
  rehearseFlowcordiaDatabaseRestore,
  type FlowcordiaRecoveryCommandRunner,
} from "../../app/features/flowcordia/operations/database-recovery.server";

const migrations = ["20260720000000_first", "20260721000000_second"];
const applicationCommitSha = "0123456789abcdef0123456789abcdef01234567";
const archiveInventory = [
  "; PostgreSQL database dump",
  "100; 0 0 TABLE public Organization postgres",
  "101; 0 0 TABLE DATA public _prisma_migrations postgres",
  "102; 0 0 TABLE DATA public Organization postgres",
].join("\n");

interface CommandCall {
  command: string;
  args: readonly string[];
  environment: Record<string, string>;
}

function fakeRunner(
  input: {
    calls?: CommandCall[];
    failRestore?: boolean;
    failDrop?: boolean;
    dumpMajor?: number;
    restoreMajor?: number;
    serverMajor?: number;
    migrationState?: "ready" | "blocked";
  } = {}
): FlowcordiaRecoveryCommandRunner {
  return {
    async run(command) {
      input.calls?.push({
        command: command.command,
        args: [...command.args],
        environment: { ...command.environment },
      });
      const tool = basename(command.command);
      if (tool === "psql") {
        if (command.args.includes("SHOW server_version_num")) {
          return { stdout: `${input.serverMajor ?? 14}0000\n` };
        }
        return {
          stdout: migrations
            .map((migration) => `${migration}\t${input.migrationState ?? "ready"}`)
            .join("\n"),
        };
      }
      if (tool === "pg_dump" && command.args.includes("--version")) {
        return { stdout: `pg_dump (PostgreSQL) ${input.dumpMajor ?? 14}.12\n` };
      }
      if (tool === "pg_restore" && command.args.includes("--version")) {
        return { stdout: `pg_restore (PostgreSQL) ${input.restoreMajor ?? 14}.12\n` };
      }
      if (tool === "pg_dump") {
        const index = command.args.indexOf("--file");
        await writeFile(String(command.args[index + 1]), "flowcordia-backup-archive", {
          mode: 0o600,
        });
        return { stdout: "" };
      }
      if (tool === "pg_restore" && command.args.includes("--list")) {
        return { stdout: archiveInventory };
      }
      if (tool === "pg_restore") {
        if (input.failRestore) throw new Error("private restore failure");
        return { stdout: "" };
      }
      if (tool === "createdb") return { stdout: "" };
      if (tool === "dropdb") {
        if (input.failDrop) throw new Error("private cleanup failure");
        return { stdout: "" };
      }
      throw new Error(`Unexpected tool ${tool}`);
    },
  };
}

function backupManifest() {
  return createFlowcordiaBackupManifest({
    releaseId: "release-2026.07.21",
    applicationCommitSha,
    createdAt: new Date("2026-07-21T18:30:00.000Z"),
    postgresMajor: 14,
    archiveBytes: 1024,
    archiveSha256: "a".repeat(64),
    inventorySha256: "b".repeat(64),
    migrations,
  });
}

describe("Flowcordia database recovery", () => {
  it("creates and validates canonical backup and restore evidence", () => {
    const manifest = backupManifest();
    expect(parseFlowcordiaBackupManifest(manifest)).toEqual(manifest);
    expect(manifest.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(manifest)).not.toMatch(/postgresql:|password|host|username/i);

    const evidence = createFlowcordiaRestoreEvidence({
      manifest,
      checkedAt: new Date("2026-07-21T18:40:00.000Z"),
      archiveSha256: manifest.archive.sha256,
      restoredMigrations: migrations,
    });
    expect(evidence.result).toBe("READY");
    expect(evidence.checks.map((check) => check.key)).toEqual([
      "archive_integrity",
      "tool_compatibility",
      "restore_completed",
      "migration_parity",
      "cleanup_completed",
    ]);
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects tampered manifests and mismatched restore evidence", () => {
    const manifest = backupManifest();
    expect(() =>
      parseFlowcordiaBackupManifest({
        ...manifest,
        archive: { ...manifest.archive, bytes: manifest.archive.bytes + 1 },
      })
    ).toThrow("manifest digest");
    expect(() =>
      createFlowcordiaRestoreEvidence({
        manifest,
        checkedAt: new Date("2026-07-21T18:40:00.000Z"),
        archiveSha256: "c".repeat(64),
        restoredMigrations: migrations,
      })
    ).toThrow("does not match");
  });

  it("validates PostgreSQL tool versions and database isolation", () => {
    expect(parsePostgresMajor("140012", "server")).toBe(14);
    expect(parsePostgresMajor("pg_dump (PostgreSQL) 14.12", "pg_dump")).toBe(14);
    expect(assertCompatiblePostgresMajors({ server: 14, pgDump: 14, pgRestore: 14 })).toBe(14);
    expect(() => assertCompatiblePostgresMajors({ server: 14, pgDump: 15 })).toThrow(
      "does not match"
    );

    expect(() =>
      assertDistinctDatabaseIdentity(
        "postgresql://source:secret@db:5432/flowcordia",
        "postgresql://admin:secret@db:5432/flowcordia"
      )
    ).toThrow("distinct");
    expect(() =>
      assertDistinctDatabaseIdentity(
        "postgresql://source:secret@db:5432/flowcordia",
        "postgresql://admin:secret@db:5432/postgres"
      )
    ).not.toThrow();
    expect(flowcordiaRestoreDatabaseName("release-2026.07.21", "abcdef123456")).toMatch(
      /^flowcordia_restore_[a-z0-9_]+_[0-9a-f]{12}$/
    );
  });

  it("creates an atomic backup without putting credentials in command arguments or evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-backup-test-"));
    const calls: CommandCall[] = [];
    const secret = "database-secret-sentinel";
    try {
      const result = await createFlowcordiaDatabaseBackup({
        releaseId: "release-2026.07.21",
        applicationCommitSha,
        sourceDatabaseUrl: `postgresql://flowcordia:${secret}@database:5432/flowcordia`,
        outputDirectory: directory,
        repositoryMigrations: migrations,
        createdAt: new Date("2026-07-21T18:30:00.000Z"),
        runner: fakeRunner({ calls }),
      });
      expect(result.manifest.archive.bytes).toBeGreaterThan(0);
      expect(result.manifest.migrations).toEqual(flowcordiaMigrationSet(migrations));
      expect(JSON.stringify(result.manifest)).not.toContain(secret);
      expect(calls.some((call) => call.environment.PGPASSWORD === secret)).toBe(true);
      expect(JSON.stringify(calls.map((call) => call.args))).not.toContain(secret);
      expect((await stat(result.archivePath)).mode & 0o777).toBe(0o600);
      expect((await stat(result.manifestPath)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(result.manifestPath, "utf8"))).toEqual(result.manifest);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses invalid release paths and existing backup artifacts before pg_dump", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-backup-existing-"));
    const calls: CommandCall[] = [];
    try {
      await expect(
        createFlowcordiaDatabaseBackup({
          releaseId: "../escape",
          applicationCommitSha,
          sourceDatabaseUrl: "postgresql://flowcordia:secret@database:5432/flowcordia",
          outputDirectory: directory,
          repositoryMigrations: migrations,
          createdAt: new Date("2026-07-21T18:30:00.000Z"),
          runner: fakeRunner({ calls }),
        })
      ).rejects.toThrow("Release identity");
      expect(calls).toHaveLength(0);

      const archive = join(directory, "release-2026.07.21.dump");
      await writeFile(archive, "existing", { mode: 0o600 });
      await expect(
        createFlowcordiaDatabaseBackup({
          releaseId: "release-2026.07.21",
          applicationCommitSha,
          sourceDatabaseUrl: "postgresql://flowcordia:secret@database:5432/flowcordia",
          outputDirectory: directory,
          repositoryMigrations: migrations,
          createdAt: new Date("2026-07-21T18:30:00.000Z"),
          runner: fakeRunner({ calls }),
        })
      ).rejects.toThrow("already exists");
      expect(await readFile(archive, "utf8")).toBe("existing");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("blocks backups with failed migration history or mismatched tool versions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-backup-blocked-"));
    try {
      await expect(
        createFlowcordiaDatabaseBackup({
          releaseId: "release-2026.07.21",
          applicationCommitSha,
          sourceDatabaseUrl: "postgresql://flowcordia:secret@database:5432/flowcordia",
          outputDirectory: directory,
          repositoryMigrations: migrations,
          createdAt: new Date("2026-07-21T18:30:00.000Z"),
          runner: fakeRunner({ migrationState: "blocked" }),
        })
      ).rejects.toThrow("migration state");
      await expect(
        createFlowcordiaDatabaseBackup({
          releaseId: "release-2026.07.22",
          applicationCommitSha,
          sourceDatabaseUrl: "postgresql://flowcordia:secret@database:5432/flowcordia",
          outputDirectory: directory,
          repositoryMigrations: migrations,
          createdAt: new Date("2026-07-21T18:30:00.000Z"),
          runner: fakeRunner({ dumpMajor: 15 }),
        })
      ).rejects.toThrow("does not match");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("restores into a disposable database, verifies migrations, and always drops it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-restore-test-"));
    const backupCalls: CommandCall[] = [];
    const restoreCalls: CommandCall[] = [];
    const secret = "restore-admin-secret";
    try {
      const backup = await createFlowcordiaDatabaseBackup({
        releaseId: "release-2026.07.21",
        applicationCommitSha,
        sourceDatabaseUrl: "postgresql://flowcordia:source-secret@database:5432/flowcordia",
        outputDirectory: directory,
        repositoryMigrations: migrations,
        createdAt: new Date("2026-07-21T18:30:00.000Z"),
        runner: fakeRunner({ calls: backupCalls }),
      });
      const evidencePath = join(directory, "restore-evidence.json");
      const restored = await rehearseFlowcordiaDatabaseRestore({
        sourceDatabaseUrl: "postgresql://flowcordia:source-secret@database:5432/flowcordia",
        restoreAdminUrl: `postgresql://admin:${secret}@restore:5432/postgres`,
        archivePath: backup.archivePath,
        manifestPath: backup.manifestPath,
        evidencePath,
        repositoryMigrations: migrations,
        checkedAt: new Date("2026-07-21T18:40:00.000Z"),
        nonce: "abcdef123456",
        runner: fakeRunner({ calls: restoreCalls }),
      });
      expect(restored.evidence.result).toBe("READY");
      expect(JSON.stringify(restored.evidence)).not.toContain(secret);
      expect(JSON.stringify(restoreCalls.map((call) => call.args))).not.toContain(secret);
      const createdb = restoreCalls.find((call) => basename(call.command) === "createdb");
      const dropdb = restoreCalls.find((call) => basename(call.command) === "dropdb");
      expect(createdb).toBeDefined();
      expect(dropdb).toBeDefined();
      expect(createdb?.args.at(-1)).toBe(dropdb?.args.at(-1));
      expect(JSON.parse(await readFile(evidencePath, "utf8"))).toEqual(restored.evidence);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("blocks tampered archives before database creation and cleans up after restore failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-restore-failure-"));
    try {
      const backup = await createFlowcordiaDatabaseBackup({
        releaseId: "release-2026.07.21",
        applicationCommitSha,
        sourceDatabaseUrl: "postgresql://flowcordia:source-secret@database:5432/flowcordia",
        outputDirectory: directory,
        repositoryMigrations: migrations,
        createdAt: new Date("2026-07-21T18:30:00.000Z"),
        runner: fakeRunner(),
      });
      await writeFile(backup.archivePath, "tampered", { mode: 0o600 });
      const tamperedCalls: CommandCall[] = [];
      await expect(
        rehearseFlowcordiaDatabaseRestore({
          sourceDatabaseUrl: "postgresql://flowcordia:source-secret@database:5432/flowcordia",
          restoreAdminUrl: "postgresql://admin:secret@restore:5432/postgres",
          archivePath: backup.archivePath,
          manifestPath: backup.manifestPath,
          evidencePath: join(directory, "tampered-evidence.json"),
          repositoryMigrations: migrations,
          checkedAt: new Date("2026-07-21T18:40:00.000Z"),
          runner: fakeRunner({ calls: tamperedCalls }),
        })
      ).rejects.toThrow("does not match");
      expect(tamperedCalls.some((call) => basename(call.command) === "createdb")).toBe(false);

      const second = await createFlowcordiaDatabaseBackup({
        releaseId: "release-2026.07.22",
        applicationCommitSha,
        sourceDatabaseUrl: "postgresql://flowcordia:source-secret@database:5432/flowcordia",
        outputDirectory: directory,
        repositoryMigrations: migrations,
        createdAt: new Date("2026-07-21T18:31:00.000Z"),
        runner: fakeRunner(),
      });
      const failureCalls: CommandCall[] = [];
      await expect(
        rehearseFlowcordiaDatabaseRestore({
          sourceDatabaseUrl: "postgresql://flowcordia:source-secret@database:5432/flowcordia",
          restoreAdminUrl: "postgresql://admin:secret@restore:5432/postgres",
          archivePath: second.archivePath,
          manifestPath: second.manifestPath,
          evidencePath: join(directory, "failed-evidence.json"),
          repositoryMigrations: migrations,
          checkedAt: new Date("2026-07-21T18:40:00.000Z"),
          nonce: "abcdef123456",
          runner: fakeRunner({ calls: failureCalls, failRestore: true }),
        })
      ).rejects.toThrow();
      expect(failureCalls.some((call) => basename(call.command) === "createdb")).toBe(true);
      expect(failureCalls.some((call) => basename(call.command) === "dropdb")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
