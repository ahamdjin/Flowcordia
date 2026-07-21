from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:180]!r}")
    file.write_text(content.replace(old, new, 1))


server = "apps/webapp/app/features/flowcordia/operations/database-recovery.server.ts"

replace_once(
    server,
    '''  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
''',
    '''  chmod,
  link,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
''',
)
replace_once(
    server,
    'import { isAbsolute, join } from "node:path";\n',
    'import { dirname, isAbsolute, join } from "node:path";\n',
)
replace_once(
    server,
    '''      const child = spawn(input.command, [...input.args], {
        env: { ...process.env, ...input.environment },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
''',
    '''      const inheritedEnvironment: NodeJS.ProcessEnv = {
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
replace_once(
    server,
    '''function parseMigrationOutput(output: string): string[] {
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
    '''function parseMigrationOutput(output: string): string[] {
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
replace_once(
    server,
    '''      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
''',
    '''      `SELECT migration_name || E'\t' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'ready' ELSE 'blocked' END FROM "_prisma_migrations" ORDER BY migration_name`,
''',
)
replace_once(
    server,
    '''async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
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
    '''async function pathExists(path: string): Promise<boolean> {
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
replace_once(
    server,
    '''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  const environment = postgresEnvironment(input.sourceDatabaseUrl);
  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });
''',
    '''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  flowcordiaRestoreDatabaseName(input.releaseId, "000000000000");
  const environment = postgresEnvironment(input.sourceDatabaseUrl);
  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });
''',
)
replace_once(
    server,
    '''  try {
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
    '''  try {
    await assertPathsAbsent([archivePath, manifestPath]);

    const [serverMajor, dumpMajor, restoreMajor, actualMigrations] = await Promise.all([
''',
)
replace_once(
    server,
    '''    await rename(temporaryArchive, archivePath);
    await chmod(archivePath, 0o600);
    await writeJsonAtomic(manifestPath, manifest);
''',
    '''    await link(temporaryArchive, archivePath);
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
replace_once(
    server,
    '''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
  assertDistinctDatabaseIdentity(input.sourceDatabaseUrl, input.restoreAdminUrl);
  const manifest = parseFlowcordiaBackupManifest(JSON.parse(await readFile(input.manifestPath, "utf8")));
  requireExactMigrations(input.repositoryMigrations, input.repositoryMigrations);
  const expectedMigrationSet = flowcordiaMigrationSet(input.repositoryMigrations);
''',
    '''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;
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
