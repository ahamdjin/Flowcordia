import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  FlowcordiaAppliedMigrationArtifact,
  FlowcordiaMigrationArtifact,
} from "./upgrade-preflight";

const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9_]+$/;
const SHA256 = /^[0-9a-f]{64}$/;

interface AppliedMigrationRow {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export interface FlowcordiaUpgradeDatabase {
  $queryRawUnsafe<T>(query: string): Promise<T>;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function readFlowcordiaTargetMigrationArtifacts(
  migrationsPath: string
): Promise<FlowcordiaMigrationArtifact[]> {
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (
    directories.length === 0 ||
    directories.some((entry) => !MIGRATION_NAME.test(entry.name)) ||
    directories.length !== new Set(directories.map((entry) => entry.name)).size
  ) {
    throw new TypeError("Candidate repository migration inventory is invalid.");
  }

  const artifacts = await Promise.all(
    directories.map(async (entry): Promise<FlowcordiaMigrationArtifact> => {
      const migrationPath = join(migrationsPath, entry.name, "migration.sql");
      const migrationStat = await stat(migrationPath);
      if (!migrationStat.isFile() || migrationStat.size <= 0) {
        throw new TypeError("Candidate repository migration artifact is invalid.");
      }
      return {
        name: entry.name,
        checksum: sha256(await readFile(migrationPath)),
      };
    })
  );
  return artifacts.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readFlowcordiaAppliedMigrationArtifacts(
  database: FlowcordiaUpgradeDatabase
): Promise<FlowcordiaAppliedMigrationArtifact[]> {
  const rows = await database.$queryRawUnsafe<AppliedMigrationRow[]>(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name'
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError("Live database migration inventory is unavailable.");
  }
  return rows.map((row) => {
    if (
      !row ||
      !MIGRATION_NAME.test(row.migration_name) ||
      !SHA256.test(row.checksum) ||
      (!(row.finished_at instanceof Date) && row.finished_at !== null) ||
      (!(row.rolled_back_at instanceof Date) && row.rolled_back_at !== null)
    ) {
      throw new TypeError("Live database migration inventory is invalid.");
    }
    return {
      name: row.migration_name,
      checksum: row.checksum,
      finishedAt: row.finished_at,
      rolledBackAt: row.rolled_back_at,
    };
  });
}
