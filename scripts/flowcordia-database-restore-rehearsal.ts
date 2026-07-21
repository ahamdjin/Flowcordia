import { resolve } from "node:path";
import { readFlowcordiaRepositoryMigrationNames } from "../apps/webapp/app/features/flowcordia/operations/dependency-preflight.server";
import { rehearseFlowcordiaDatabaseRestore } from "../apps/webapp/app/features/flowcordia/operations/database-recovery.server";

interface Options {
  archivePath: string;
  manifestPath: string;
  evidencePath: string;
  binDirectory?: string;
  json: boolean;
}

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-database-restore-rehearsal.ts --archive <path> --manifest <path> --evidence <path> [--postgres-bin-dir <path>] [--json]"
  );
  process.exit(2);
}

function parseOptions(args: string[]): Options {
  let archivePath = "";
  let manifestPath = "";
  let evidencePath = "";
  let binDirectory: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--archive" && next) {
      archivePath = resolve(next);
      index += 1;
      continue;
    }
    if (argument === "--manifest" && next) {
      manifestPath = resolve(next);
      index += 1;
      continue;
    }
    if (argument === "--evidence" && next) {
      evidencePath = resolve(next);
      index += 1;
      continue;
    }
    if (argument === "--postgres-bin-dir" && next) {
      binDirectory = resolve(next);
      index += 1;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    usage();
  }
  if (!archivePath || !manifestPath || !evidencePath) usage();
  return { archivePath, manifestPath, evidencePath, binDirectory, json };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const sourceDatabaseUrl = process.env.DATABASE_URL?.trim();
  const restoreAdminUrl = process.env.FLOWCORDIA_RESTORE_ADMIN_URL?.trim();
  if (!sourceDatabaseUrl || !restoreAdminUrl) {
    console.error("Flowcordia restore rehearsal configuration is incomplete.");
    process.exitCode = 1;
    return;
  }
  const migrationsPath = resolve(process.cwd(), "internal-packages/database/prisma/migrations");
  const repositoryMigrations = await readFlowcordiaRepositoryMigrationNames(migrationsPath);
  const result = await rehearseFlowcordiaDatabaseRestore({
    sourceDatabaseUrl,
    restoreAdminUrl,
    archivePath: options.archivePath,
    manifestPath: options.manifestPath,
    evidencePath: options.evidencePath,
    repositoryMigrations,
    checkedAt: new Date(),
    binDirectory: options.binDirectory,
  });
  if (options.json) {
    console.log(JSON.stringify(result.evidence, null, 2));
  } else {
    console.log("Flowcordia PostgreSQL restore rehearsal: READY");
    console.log(`Release: ${result.evidence.releaseId}`);
    console.log(`Archive digest: ${result.evidence.archiveSha256}`);
    console.log(`Evidence digest: ${result.evidence.evidenceSha256}`);
  }
}

void main().catch(() => {
  console.error("Flowcordia database restore rehearsal failed safely.");
  process.exitCode = 1;
});
