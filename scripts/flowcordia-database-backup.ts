import { isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readFlowcordiaRepositoryMigrationNames } from "../apps/webapp/app/features/flowcordia/operations/dependency-preflight.server";
import { createFlowcordiaDatabaseBackup } from "../apps/webapp/app/features/flowcordia/operations/database-recovery.server";

interface Options {
  releaseId: string;
  outputDirectory: string;
  binDirectory?: string;
  json: boolean;
}

function assertOutsideRepository(path: string): void {
  const repository = resolve(process.cwd());
  const location = resolve(path);
  const relativePath = relative(repository, location);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    console.error("Flowcordia recovery artifacts must be stored outside the repository.");
    process.exit(2);
  }
}

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-database-backup.ts --release-id <id> --output-dir <path> [--postgres-bin-dir <path>] [--json]"
  );
  process.exit(2);
}

function parseOptions(args: string[]): Options {
  const values = (() => {
    try {
      return parseArgs({
        args,
        options: {
          "release-id": { type: "string" },
          "output-dir": { type: "string" },
          "postgres-bin-dir": { type: "string" },
          json: { type: "boolean", default: false },
        },
        strict: true,
        allowPositionals: false,
      }).values;
    } catch {
      usage();
    }
  })();
  if (!values["release-id"] || !values["output-dir"]) usage();
  const outputDirectory = resolve(values["output-dir"]);
  assertOutsideRepository(outputDirectory);
  return {
    releaseId: values["release-id"],
    outputDirectory,
    binDirectory: values["postgres-bin-dir"] ? resolve(values["postgres-bin-dir"]) : undefined,
    json: values.json,
  };
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
