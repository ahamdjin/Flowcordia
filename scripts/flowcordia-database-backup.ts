import { resolve } from "node:path";
import { readFlowcordiaRepositoryMigrationNames } from "../apps/webapp/app/features/flowcordia/operations/dependency-preflight.server";
import { createFlowcordiaDatabaseBackup } from "../apps/webapp/app/features/flowcordia/operations/database-recovery.server";

interface Options {
  releaseId: string;
  outputDirectory: string;
  binDirectory?: string;
  json: boolean;
}

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-database-backup.ts --release-id <id> --output-dir <path> [--postgres-bin-dir <path>] [--json]"
  );
  process.exit(2);
}

function parseOptions(args: string[]): Options {
  let releaseId = "";
  let outputDirectory = "";
  let binDirectory: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--release-id" && next) {
      releaseId = next;
      index += 1;
      continue;
    }
    if (argument === "--output-dir" && next) {
      outputDirectory = resolve(next);
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
  if (!releaseId || !outputDirectory) usage();
  return { releaseId, outputDirectory, binDirectory, json };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const sourceDatabaseUrl = process.env.DATABASE_URL?.trim();
  const applicationCommitSha = process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA?.trim();
  if (!sourceDatabaseUrl || !applicationCommitSha) {
    console.error("Flowcordia database backup configuration is incomplete.");
    process.exitCode = 1;
    return;
  }
  const migrationsPath = resolve(process.cwd(), "internal-packages/database/prisma/migrations");
  const repositoryMigrations = await readFlowcordiaRepositoryMigrationNames(migrationsPath);
  const result = await createFlowcordiaDatabaseBackup({
    releaseId: options.releaseId,
    applicationCommitSha,
    sourceDatabaseUrl,
    outputDirectory: options.outputDirectory,
    repositoryMigrations,
    createdAt: new Date(),
    binDirectory: options.binDirectory,
  });
  if (options.json) {
    console.log(JSON.stringify(result.manifest, null, 2));
  } else {
    console.log("Flowcordia PostgreSQL backup: READY");
    console.log(`Release: ${result.manifest.releaseId}`);
    console.log(`Archive digest: ${result.manifest.archive.sha256}`);
    console.log(`Manifest digest: ${result.manifest.manifestSha256}`);
  }
}

void main().catch(() => {
  console.error("Flowcordia database backup failed safely.");
  process.exitCode = 1;
});
