import { isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readFlowcordiaRepositoryMigrationNames } from "../apps/webapp/app/features/flowcordia/operations/dependency-preflight.server";
import { rehearseFlowcordiaDatabaseRestore } from "../apps/webapp/app/features/flowcordia/operations/database-recovery.server";

interface Options {
  archivePath: string;
  manifestPath: string;
  evidencePath: string;
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
    "Usage: pnpm exec tsx scripts/flowcordia-database-restore-rehearsal.ts --archive <path> --manifest <path> --evidence <path> [--postgres-bin-dir <path>] [--json]"
  );
  process.exit(2);
}

function parseOptions(args: string[]): Options {
  const values = (() => {
    try {
      return parseArgs({
        args,
        options: {
          archive: { type: "string" },
          manifest: { type: "string" },
          evidence: { type: "string" },
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
  if (!values.archive || !values.manifest || !values.evidence) usage();
  const archivePath = resolve(values.archive);
  const manifestPath = resolve(values.manifest);
  const evidencePath = resolve(values.evidence);
  assertOutsideRepository(archivePath);
  assertOutsideRepository(manifestPath);
  assertOutsideRepository(evidencePath);
  return {
    archivePath,
    manifestPath,
    evidencePath,
    binDirectory: values["postgres-bin-dir"] ? resolve(values["postgres-bin-dir"]) : undefined,
    json: values.json,
  };
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
