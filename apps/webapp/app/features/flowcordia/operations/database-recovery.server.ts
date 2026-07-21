import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { spawn } from "node:child_process";
import {
  assertCompatiblePostgresMajors,
  assertDistinctDatabaseIdentity,
  createFlowcordiaBackupManifest,
  createFlowcordiaRestoreEvidence,
  flowcordiaMigrationSet,
  flowcordiaRecoverySha256,
  flowcordiaRestoreDatabaseName,
  parseFlowcordiaBackupManifest,
  parsePostgresMajor,
  FlowcordiaDatabaseRecoveryError,
  type FlowcordiaBackupManifest,
  type FlowcordiaRestoreRehearsalEvidence,
} from "./database-recovery";

const COMMAND_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9_]+$/;
const TOOL_NAME = /^(psql|pg_dump|pg_restore|createdb|dropdb)$/;

export interface FlowcordiaRecoveryCommandResult {
  stdout: string;
}

export interface FlowcordiaRecoveryCommandRunner {
  run(input: {
    command: string;
    args: readonly string[];
    environment: Record<string, string>;
    timeoutMs?: number;
    maxStdoutBytes?: number;
  }): Promise<FlowcordiaRecoveryCommandResult>;
}

export interface FlowcordiaBackupResult {
  manifest: FlowcordiaBackupManifest;
  archivePath: string;
  manifestPath: string;
}

export interface FlowcordiaRestoreResult {
  evidence: FlowcordiaRestoreRehearsalEvidence;
  evidencePath: string;
}

function safeCommandFailure(): FlowcordiaDatabaseRecoveryError {
  return new FlowcordiaDatabaseRecoveryError(
    "postgres_command_failed",
    "PostgreSQL recovery command failed safely."
  );
}

export const flowcordiaRecoveryCommandRunner: FlowcordiaRecoveryCommandRunner = {
  async run(input) {
    return await new Promise((resolve, reject) => {
      const child = spawn(input.command, [...input.args], {
        env: { ...process.env, ...input.environment },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let settled = false;
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
      }, input.timeoutMs ?? COMMAND_TIMEOUT_MS);

      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(safeCommandFailure());
      };

      child.once("error", fail);
      child.stdout?.on("data", (chunk: Buffer) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > (input.maxStdoutBytes ?? MAX_CAPTURE_BYTES)) {
          child.kill("SIGKILL");
          fail();
          return;
        }
        chunks.push(chunk);
      });
      child.stderr?.resume();
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code !== 0) {
          reject(safeCommandFailure());
          return;
        }
        resolve({ stdout: Buffer.concat(chunks).toString("utf8") });
      });
    });
  },
};

function toolPath(tool: string, binDirectory?: string): string {
  if (!TOOL_NAME.test(tool)) {
    throw new FlowcordiaDatabaseRecoveryError("invalid_tool", "PostgreSQL tool is invalid.");
  }
  if (!binDirectory) return tool;
  if (!isAbsolute(binDirectory) || binDirectory.includes("\0")) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_tool_path",
      "PostgreSQL tool directory is invalid."
    );
  }
  return join(binDirectory, tool);
}

function postgresEnvironment(urlText: string, databaseOverride?: string): Record<string, string> {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_database_url",
      "Database recovery connection configuration is invalid."
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.pathname.slice(1)
  ) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_database_url",
      "Database recovery connection configuration is invalid."
    );
  }
  const environment: Record<string, string> = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGDATABASE: databaseOverride ?? decodeURIComponent(url.pathname.slice(1)),
    PGCONNECT_TIMEOUT: "5",
  };
  if (url.password) environment.PGPASSWORD = decodeURIComponent(url.password);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}

async function sha256File(path: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function parseMigrationOutput(output: string): string[] {
  const migrations = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    migrations.length === 0 ||
    migrations.length !== new Set(migrations).size ||
    migrations.some((name) => !MIGRATION_NAME.test(name))
  ) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_migration_state",
      "Database migration state is invalid."
    );
  }
  return migrations.sort();
}

function requireExactMigrations(actual: readonly string[], expected: readonly string[]): void {
  const actualSet = flowcordiaMigrationSet(actual);
  const expectedSet = flowcordiaMigrationSet(expected);
  if (actualSet.count !== expectedSet.count || actualSet.sha256 !== expectedSet.sha256) {
    throw new FlowcordiaDatabaseRecoveryError(
      "migration_mismatch",
      "Database migrations do not match the release artifact."
    );
  }
}

async function readServerMajor(input: {
  runner: FlowcordiaRecoveryCommandRunner;
  environment: Record<string, string>;
  binDirectory?: string;
}): Promise<number> {
  const result = await input.runner.run({
    command: toolPath("psql", input.binDirectory),
    args: ["--no-psqlrc", "--tuples-only", "--no-align", "--command", "SHOW server_version_num"],
    environment: input.environment,
  });
  return parsePostgresMajor(result.stdout, "server");
}

async function readSuccessfulMigrations(input: {
  runner: FlowcordiaRecoveryCommandRunner;
  environment: Record<string, string>;
  binDirectory?: string;
}): Promise<string[]> {
  const result = await input.runner.run({
    command: toolPath("psql", input.binDirectory),
    args: [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
    ],
    environment: input.environment,
  });
  return parseMigrationOutput(result.stdout);
}

async function readToolMajor(input: {
  tool: "pg_dump" | "pg_restore";
  runner: FlowcordiaRecoveryCommandRunner;
  binDirectory?: string;
}): Promise<number> {
  const result = await input.runner.run({
    command: toolPath(input.tool, input.binDirectory),
    args: ["--version"],
    environment: {},
  });
  return parsePostgresMajor(result.stdout, input.tool);
}

async function archiveInventory(input: {
  archivePath: string;
  runner: FlowcordiaRecoveryCommandRunner;
  binDirectory?: string;
}): Promise<{ text: string; sha256: string }> {
  const result = await input.runner.run({
    command: toolPath("pg_restore", input.binDirectory),
    args: ["--list", input.archivePath],
    environment: {},
  });
  if (!result.stdout.includes("TABLE DATA") || !result.stdout.includes("_prisma_migrations")) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_archive_inventory",
      "Backup archive inventory is incomplete."
    );
  }
  return { text: result.stdout, sha256: flowcordiaRecoverySha256(result.stdout) };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  try {
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function createFlowcordiaDatabaseBackup(input: {
  releaseId: string;
  applicationCommitSha: string;
  sourceDatabaseUrl: string;
  outputDirectory: string;
  repositoryMigrations: readonly string[];
  createdAt: Date;
  binDirectory?: string;
  runner?: FlowcordiaRecoveryCommandRunner;
}): Promise<FlowcordiaBackupResult> {
  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  const environment = postgresEnvironment(input.sourceDatabaseUrl);
  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });
  await chmod(input.outputDirectory, 0o700);

  const archivePath = join(input.outputDirectory, `${input.releaseId}.dump`);
  const manifestPath = join(input.outputDirectory, `${input.releaseId}.backup.json`);
  const temporaryArchive = `${archivePath}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await Promise.all([stat(archivePath), stat(manifestPath)]).then(
      () => {
        throw new FlowcordiaDatabaseRecoveryError(
          "backup_exists",
          "Backup artifact already exists."
        );
      },
      () => undefined
    );

    const [serverMajor, dumpMajor, restoreMajor, actualMigrations] = await Promise.all([
      readServerMajor({ runner, environment, binDirectory: input.binDirectory }),
      readToolMajor({ tool: "pg_dump", runner, binDirectory: input.binDirectory }),
      readToolMajor({ tool: "pg_restore", runner, binDirectory: input.binDirectory }),
      readSuccessfulMigrations({ runner, environment, binDirectory: input.binDirectory }),
    ]);
    assertCompatiblePostgresMajors({ server: serverMajor, pgDump: dumpMajor, pgRestore: restoreMajor });
    requireExactMigrations(actualMigrations, input.repositoryMigrations);

    await runner.run({
      command: toolPath("pg_dump", input.binDirectory),
      args: [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--lock-wait-timeout=30000",
        "--file",
        temporaryArchive,
      ],
      environment,
    });
    await chmod(temporaryArchive, 0o600);
    const inventory = await archiveInventory({
      archivePath: temporaryArchive,
      runner,
      binDirectory: input.binDirectory,
    });
    const archiveStats = await stat(temporaryArchive);
    const archiveSha256 = await sha256File(temporaryArchive);
    const manifest = createFlowcordiaBackupManifest({
      releaseId: input.releaseId,
      applicationCommitSha: input.applicationCommitSha,
      createdAt: input.createdAt,
      postgresMajor: serverMajor,
      archiveBytes: archiveStats.size,
      archiveSha256,
      inventorySha256: inventory.sha256,
      migrations: actualMigrations,
    });
    await rename(temporaryArchive, archivePath);
    await chmod(archivePath, 0o600);
    await writeJsonAtomic(manifestPath, manifest);
    return { manifest, archivePath, manifestPath };
  } catch (error) {
    await rm(temporaryArchive, { force: true });
    throw error instanceof FlowcordiaDatabaseRecoveryError ? error : safeCommandFailure();
  }
}

export async function rehearseFlowcordiaDatabaseRestore(input: {
  sourceDatabaseUrl: string;
  restoreAdminUrl: string;
  archivePath: string;
  manifestPath: string;
  evidencePath: string;
  repositoryMigrations: readonly string[];
  checkedAt: Date;
  binDirectory?: string;
  runner?: FlowcordiaRecoveryCommandRunner;
  nonce?: string;
}): Promise<FlowcordiaRestoreResult> {
  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  assertDistinctDatabaseIdentity(input.sourceDatabaseUrl, input.restoreAdminUrl);
  const manifest = parseFlowcordiaBackupManifest(JSON.parse(await readFile(input.manifestPath, "utf8")));
  requireExactMigrations(input.repositoryMigrations, input.repositoryMigrations);
  const expectedMigrationSet = flowcordiaMigrationSet(input.repositoryMigrations);
  if (
    expectedMigrationSet.count !== manifest.migrations.count ||
    expectedMigrationSet.sha256 !== manifest.migrations.sha256
  ) {
    throw new FlowcordiaDatabaseRecoveryError(
      "release_migration_mismatch",
      "Backup manifest migrations do not match the checked-out release artifact."
    );
  }

  const archiveStats = await stat(input.archivePath);
  const archiveSha256 = await sha256File(input.archivePath);
  if (archiveStats.size !== manifest.archive.bytes || archiveSha256 !== manifest.archive.sha256) {
    throw new FlowcordiaDatabaseRecoveryError(
      "archive_digest_mismatch",
      "Backup archive does not match its manifest."
    );
  }
  const inventory = await archiveInventory({
    archivePath: input.archivePath,
    runner,
    binDirectory: input.binDirectory,
  });
  if (inventory.sha256 !== manifest.archive.inventorySha256) {
    throw new FlowcordiaDatabaseRecoveryError(
      "archive_inventory_mismatch",
      "Backup archive inventory does not match its manifest."
    );
  }

  const adminEnvironment = postgresEnvironment(input.restoreAdminUrl);
  const [adminMajor, restoreMajor] = await Promise.all([
    readServerMajor({ runner, environment: adminEnvironment, binDirectory: input.binDirectory }),
    readToolMajor({ tool: "pg_restore", runner, binDirectory: input.binDirectory }),
  ]);
  assertCompatiblePostgresMajors({
    server: manifest.postgresMajor,
    pgDump: manifest.postgresMajor,
    pgRestore: restoreMajor,
  });
  if (adminMajor !== manifest.postgresMajor) {
    throw new FlowcordiaDatabaseRecoveryError(
      "restore_server_mismatch",
      "Restore server major version does not match the backup."
    );
  }

  const restoreDatabase = flowcordiaRestoreDatabaseName(
    manifest.releaseId,
    input.nonce ?? randomBytes(6).toString("hex")
  );
  let created = false;
  let primaryError: unknown;
  let restoredMigrations: string[] = [];
  try {
    await runner.run({
      command: toolPath("createdb", input.binDirectory),
      args: ["--no-password", restoreDatabase],
      environment: adminEnvironment,
    });
    created = true;
    await runner.run({
      command: toolPath("pg_restore", input.binDirectory),
      args: [
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        restoreDatabase,
        input.archivePath,
      ],
      environment: adminEnvironment,
    });
    restoredMigrations = await readSuccessfulMigrations({
      runner,
      environment: { ...adminEnvironment, PGDATABASE: restoreDatabase },
      binDirectory: input.binDirectory,
    });
    requireExactMigrations(restoredMigrations, input.repositoryMigrations);
  } catch (error) {
    primaryError = error;
  } finally {
    if (created) {
      try {
        await runner.run({
          command: toolPath("dropdb", input.binDirectory),
          args: ["--if-exists", "--force", restoreDatabase],
          environment: adminEnvironment,
        });
      } catch {
        throw new FlowcordiaDatabaseRecoveryError(
          "restore_cleanup_failed",
          "Restore rehearsal database cleanup failed safely."
        );
      }
    }
  }
  if (primaryError) {
    throw primaryError instanceof FlowcordiaDatabaseRecoveryError
      ? primaryError
      : safeCommandFailure();
  }

  const evidence = createFlowcordiaRestoreEvidence({
    manifest,
    checkedAt: input.checkedAt,
    archiveSha256,
    restoredMigrations,
  });
  await writeJsonAtomic(input.evidencePath, evidence);
  return { evidence, evidencePath: input.evidencePath };
}
