from pathlib import Path


def apply_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    old_count = content.count(old)
    new_count = content.count(new)
    if old_count == 1 and new_count == 0:
        file.write_text(content.replace(old, new, 1))
        return
    if old_count == 0 and new_count == 1:
        return
    raise SystemExit(
        f"{path}: unsafe transform state old={old_count} new={new_count}: {old[:160]!r}"
    )


server = "apps/webapp/app/features/flowcordia/operations/database-recovery.server.ts"

apply_once(
    server,
    r'''  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
''',
    r'''  chmod,
  link,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
''',
)
apply_once(
    server,
    'import { isAbsolute, join } from "node:path";\n',
    'import { dirname, isAbsolute, join } from "node:path";\n',
)
apply_once(
    server,
    r'''      const child = spawn(input.command, [...input.args], {
        env: { ...process.env, ...input.environment },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
''',
    r'''      const inheritedEnvironment: NodeJS.ProcessEnv = {
        NODE_ENV: process.env.NODE_ENV ?? "production",
      };
      for (const key of [
        "PATH",
        "SystemRoot",
        "WINDIR",
        "HOME",
        "TMPDIR",
        "TEMP",
        "TMP",
        "LANG",
        "LC_ALL",
      ]) {
        const environmentValue = process.env[key];
        if (environmentValue) inheritedEnvironment[key] = environmentValue;
      }
      const child = spawn(input.command, [...input.args], {
        env: { ...inheritedEnvironment, ...input.environment },
        stdio: ["ignore", "pipe", "pipe"] as const,
        windowsHide: true,
      });
''',
)
apply_once(
    server,
    r'''function parseMigrationOutput(output: string): string[] {
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
''',
    r'''function parseMigrationOutput(output: string): string[] {
  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const migrations = rows.map(([name]) => name ?? "");
  if (
    rows.length === 0 ||
    rows.some(([name, state]) => !MIGRATION_NAME.test(name ?? "") || state !== "ready") ||
    migrations.length !== new Set(migrations).size
  ) {
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_migration_state",
      "Database migration state is invalid."
    );
  }
  return migrations.sort();
}
''',
)
apply_once(
    server,
    r'''      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
''',
    r'''      `SELECT migration_name || E'\t' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'ready' ELSE 'blocked' END FROM "_prisma_migrations" ORDER BY migration_name`,
''',
)
apply_once(
    server,
    r'''async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
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
''',
    r'''async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertPathsAbsent(paths: readonly string[]): Promise<void> {
  const existing = await Promise.all(paths.map(pathExists));
  if (existing.some(Boolean)) {
    throw new FlowcordiaDatabaseRecoveryError(
      "artifact_exists",
      "Recovery evidence artifact already exists."
    );
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await assertPathsAbsent([path]);
  const temporary = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  try {
    await link(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}
''',
)
apply_once(
    server,
    r'''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  const environment = postgresEnvironment(input.sourceDatabaseUrl);
  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });
''',
    r'''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  flowcordiaRestoreDatabaseName(input.releaseId, "000000000000");
  const environment = postgresEnvironment(input.sourceDatabaseUrl);
  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });
''',
)
apply_once(
    server,
    r'''  try {
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
''',
    r'''  try {
    await assertPathsAbsent([archivePath, manifestPath]);

    const [serverMajor, dumpMajor, restoreMajor, actualMigrations] = await Promise.all([
''',
)
apply_once(
    server,
    r'''    await rename(temporaryArchive, archivePath);
    await chmod(archivePath, 0o600);
    await writeJsonAtomic(manifestPath, manifest);
''',
    r'''    await link(temporaryArchive, archivePath);
    await rm(temporaryArchive, { force: true });
    await chmod(archivePath, 0o600);
    try {
      await writeJsonAtomic(manifestPath, manifest);
    } catch (error) {
      await rm(archivePath, { force: true });
      throw error;
    }
''',
)
apply_once(
    server,
    r'''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  assertDistinctDatabaseIdentity(input.sourceDatabaseUrl, input.restoreAdminUrl);
  const manifest = parseFlowcordiaBackupManifest(JSON.parse(await readFile(input.manifestPath, "utf8")));
  requireExactMigrations(input.repositoryMigrations, input.repositoryMigrations);
  const expectedMigrationSet = flowcordiaMigrationSet(input.repositoryMigrations);
''',
    r'''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  assertDistinctDatabaseIdentity(input.sourceDatabaseUrl, input.restoreAdminUrl);
  let manifest: FlowcordiaBackupManifest;
  try {
    manifest = parseFlowcordiaBackupManifest(JSON.parse(await readFile(input.manifestPath, "utf8")));
  } catch (error) {
    if (error instanceof FlowcordiaDatabaseRecoveryError) throw error;
    throw new FlowcordiaDatabaseRecoveryError(
      "invalid_manifest",
      "Backup manifest could not be read safely."
    );
  }
  const expectedMigrationSet = flowcordiaMigrationSet(input.repositoryMigrations);
''',
)
