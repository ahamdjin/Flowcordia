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
    '''  chmod,\n  mkdir,\n  readFile,\n  rename,\n  rm,\n  stat,\n  writeFile,\n''',
    '''  chmod,\n  link,\n  mkdir,\n  readFile,\n  rm,\n  stat,\n  writeFile,\n''',
)
replace_once(
    server,
    'import { isAbsolute, join } from "node:path";\n',
    'import { dirname, isAbsolute, join } from "node:path";\n',
)
replace_once(
    server,
    '''      const child = spawn(input.command, [...input.args], {\n        env: { ...process.env, ...input.environment },\n        stdio: ["ignore", "pipe", "pipe"],\n        windowsHide: true,\n      });\n''',
    '''      const inheritedEnvironment = Object.fromEntries(\n        ["PATH", "SystemRoot", "WINDIR", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"]\n          .map((key) => [key, process.env[key]])\n          .filter((entry): entry is [string, string] => typeof entry[1] === "string")\n      );\n      const child = spawn(input.command, [...input.args], {\n        env: { ...inheritedEnvironment, ...input.environment },\n        stdio: ["ignore", "pipe", "pipe"],\n        windowsHide: true,\n      });\n''',
)
replace_once(
    server,
    '''function parseMigrationOutput(output: string): string[] {\n  const migrations = output\n    .split(/\\r?\\n/)\n    .map((line) => line.trim())\n    .filter(Boolean);\n  if (\n    migrations.length === 0 ||\n    migrations.length !== new Set(migrations).size ||\n    migrations.some((name) => !MIGRATION_NAME.test(name))\n  ) {\n    throw new FlowcordiaDatabaseRecoveryError(\n      "invalid_migration_state",\n      "Database migration state is invalid."\n    );\n  }\n  return migrations.sort();\n}\n''',
    '''function parseMigrationOutput(output: string): string[] {\n  const rows = output\n    .split(/\\r?\\n/)\n    .map((line) => line.trim())\n    .filter(Boolean)\n    .map((line) => line.split("\\t"));\n  const migrations = rows.map(([name]) => name ?? "");\n  if (\n    rows.length === 0 ||\n    rows.some(([name, state]) => !MIGRATION_NAME.test(name ?? "") || state !== "ready") ||\n    migrations.length !== new Set(migrations).size\n  ) {\n    throw new FlowcordiaDatabaseRecoveryError(\n      "invalid_migration_state",\n      "Database migration state is invalid."\n    );\n  }\n  return migrations.sort();\n}\n''',
)
replace_once(
    server,
    '''      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',\n''',
    '''      `SELECT migration_name || E'\\t' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'ready' ELSE 'blocked' END FROM "_prisma_migrations" ORDER BY migration_name`,\n''',
)
replace_once(
    server,
    '''async function writeJsonAtomic(path: string, value: unknown): Promise<void> {\n  const temporary = `${path}.tmp-${randomBytes(6).toString("hex")}`;\n  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\\n`, { mode: 0o600, flag: "wx" });\n  try {\n    await rename(temporary, path);\n    await chmod(path, 0o600);\n  } catch (error) {\n    await rm(temporary, { force: true });\n    throw error;\n  }\n}\n''',
    '''async function pathExists(path: string): Promise<boolean> {\n  try {\n    await stat(path);\n    return true;\n  } catch (error) {\n    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;\n    throw error;\n  }\n}\n\nasync function assertPathsAbsent(paths: readonly string[]): Promise<void> {\n  const existing = await Promise.all(paths.map(pathExists));\n  if (existing.some(Boolean)) {\n    throw new FlowcordiaDatabaseRecoveryError(\n      "artifact_exists",\n      "Recovery evidence artifact already exists."\n    );\n  }\n}\n\nasync function writeJsonAtomic(path: string, value: unknown): Promise<void> {\n  await mkdir(dirname(path), { recursive: true, mode: 0o700 });\n  await assertPathsAbsent([path]);\n  const temporary = `${path}.tmp-${randomBytes(6).toString("hex")}`;\n  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\\n`, { mode: 0o600, flag: "wx" });\n  try {\n    await link(temporary, path);\n    await chmod(path, 0o600);\n  } finally {\n    await rm(temporary, { force: true });\n  }\n}\n''',
)
replace_once(
    server,
    '''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;\n  const environment = postgresEnvironment(input.sourceDatabaseUrl);\n  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });\n''',
    '''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;\n  flowcordiaRestoreDatabaseName(input.releaseId, "000000000000");\n  const environment = postgresEnvironment(input.sourceDatabaseUrl);\n  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });\n''',
)
replace_once(
    server,
    '''  try {\n    await Promise.all([stat(archivePath), stat(manifestPath)]).then(\n      () => {\n        throw new FlowcordiaDatabaseRecoveryError(\n          "backup_exists",\n          "Backup artifact already exists."\n        );\n      },\n      () => undefined\n    );\n\n    const [serverMajor, dumpMajor, restoreMajor, actualMigrations] = await Promise.all([\n''',
    '''  try {\n    await assertPathsAbsent([archivePath, manifestPath]);\n\n    const [serverMajor, dumpMajor, restoreMajor, actualMigrations] = await Promise.all([\n''',
)
replace_once(
    server,
    '''    await rename(temporaryArchive, archivePath);\n    await chmod(archivePath, 0o600);\n    await writeJsonAtomic(manifestPath, manifest);\n''',
    '''    await link(temporaryArchive, archivePath);\n    await rm(temporaryArchive, { force: true });\n    await chmod(archivePath, 0o600);\n    try {\n      await writeJsonAtomic(manifestPath, manifest);\n    } catch (error) {\n      await rm(archivePath, { force: true });\n      throw error;\n    }\n''',
)
replace_once(
    server,
    '''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;\n  assertDistinctDatabaseIdentity(input.sourceDatabaseUrl, input.restoreAdminUrl);\n  const manifest = parseFlowcordiaBackupManifest(JSON.parse(await readFile(input.manifestPath, "utf8")));\n  requireExactMigrations(input.repositoryMigrations, input.repositoryMigrations);\n  const expectedMigrationSet = flowcordiaMigrationSet(input.repositoryMigrations);\n''',
    '''  const runner = input.runner ?? flowcordiaRecoveryCommandRunner;\n  assertDistinctDatabaseIdentity(input.sourceDatabaseUrl, input.restoreAdminUrl);\n  let manifest: FlowcordiaBackupManifest;\n  try {\n    manifest = parseFlowcordiaBackupManifest(JSON.parse(await readFile(input.manifestPath, "utf8")));\n  } catch (error) {\n    if (error instanceof FlowcordiaDatabaseRecoveryError) throw error;\n    throw new FlowcordiaDatabaseRecoveryError(\n      "invalid_manifest",\n      "Backup manifest could not be read safely."\n    );\n  }\n  const expectedMigrationSet = flowcordiaMigrationSet(input.repositoryMigrations);\n''',
)
