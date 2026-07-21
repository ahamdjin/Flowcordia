import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { PrismaClient } from "../internal-packages/database/generated/prisma";
import {
  presentFlowcordiaInstallationPreflight,
  type FlowcordiaInstallationProjection,
} from "../apps/webapp/app/features/flowcordia/operations/installation-preflight";
import {
  FLOWCORDIA_DEFAULT_RECOVERY_MAX_AGE_MS,
  presentFlowcordiaUpgradePreflight,
  type FlowcordiaUpgradeProjection,
} from "../apps/webapp/app/features/flowcordia/operations/upgrade-preflight";
import {
  readFlowcordiaAppliedMigrationArtifacts,
  readFlowcordiaTargetMigrationArtifacts,
} from "../apps/webapp/app/features/flowcordia/operations/upgrade-preflight.server";

interface CliOptions {
  currentApplicationCommitSha: string;
  backupManifestPath?: string;
  restoreEvidencePath?: string;
  recoveryMaxAgeMs: number;
  confirmMigrationReview: boolean;
  confirmMaintenanceWindow: boolean;
  confirmRestoreRollback: boolean;
  allowGlobalStudio: boolean;
  json: boolean;
}

interface UpgradeCommandResult {
  schemaVersion: "0.1";
  state: "READY" | "BLOCKED" | "UNAVAILABLE";
  phase: "configuration" | "observations" | "upgrade";
  checkedAt: string;
  configuration: FlowcordiaInstallationProjection;
  upgrade?: FlowcordiaUpgradeProjection;
  message: string;
}

const MAX_JSON_BYTES = 1024 * 1024;

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-upgrade-preflight.ts --current-application-sha <sha> [--backup-manifest <path> --restore-evidence <path>] [--max-recovery-age-hours <1-168>] [--confirm-migration-review] [--confirm-maintenance-window] [--confirm-restore-rollback] [--allow-global-studio] [--json]"
  );
  process.exit(2);
}

function assertOutsideRepository(path: string): string {
  const repository = resolve(process.cwd());
  const location = resolve(path);
  const relativePath = relative(repository, location);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    console.error("Flowcordia upgrade recovery evidence must be stored outside the repository.");
    process.exit(2);
  }
  return location;
}

function parseOptions(args: string[]): CliOptions {
  let currentApplicationCommitSha = "";
  let backupManifestPath: string | undefined;
  let restoreEvidencePath: string | undefined;
  let recoveryMaxAgeMs = FLOWCORDIA_DEFAULT_RECOVERY_MAX_AGE_MS;
  let confirmMigrationReview = false;
  let confirmMaintenanceWindow = false;
  let confirmRestoreRollback = false;
  let allowGlobalStudio = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--current-application-sha" && next) {
      currentApplicationCommitSha = next;
      index += 1;
      continue;
    }
    if (argument === "--backup-manifest" && next) {
      backupManifestPath = assertOutsideRepository(next);
      index += 1;
      continue;
    }
    if (argument === "--restore-evidence" && next) {
      restoreEvidencePath = assertOutsideRepository(next);
      index += 1;
      continue;
    }
    if (argument === "--max-recovery-age-hours" && next && /^[0-9]+$/.test(next)) {
      const hours = Number(next);
      if (!Number.isSafeInteger(hours) || hours < 1 || hours > 168) usage();
      recoveryMaxAgeMs = hours * 60 * 60 * 1_000;
      index += 1;
      continue;
    }
    if (argument === "--confirm-migration-review") {
      confirmMigrationReview = true;
      continue;
    }
    if (argument === "--confirm-maintenance-window") {
      confirmMaintenanceWindow = true;
      continue;
    }
    if (argument === "--confirm-restore-rollback") {
      confirmRestoreRollback = true;
      continue;
    }
    if (argument === "--allow-global-studio") {
      allowGlobalStudio = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    usage();
  }

  if (
    !currentApplicationCommitSha ||
    Boolean(backupManifestPath) !== Boolean(restoreEvidencePath)
  ) {
    usage();
  }
  return {
    currentApplicationCommitSha,
    backupManifestPath,
    restoreEvidencePath,
    recoveryMaxAgeMs,
    confirmMigrationReview,
    confirmMaintenanceWindow,
    confirmRestoreRollback,
    allowGlobalStudio,
    json,
  };
}

function boundedDatabaseUrl(input: string): string {
  const parsed = new URL(input);
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set("pool_timeout", "5");
  parsed.searchParams.set("connection_timeout", "5");
  parsed.searchParams.set("application_name", "flowcordia-upgrade-preflight");
  return parsed.toString();
}

async function readBoundedJson(path: string | undefined): Promise<unknown> {
  if (!path) return undefined;
  const file = await stat(path);
  if (!file.isFile() || file.size <= 0 || file.size > MAX_JSON_BYTES) {
    throw new TypeError("Flowcordia upgrade recovery evidence file is invalid.");
  }
  return JSON.parse(await readFile(path, "utf8"));
}

function printResult(result: UpgradeCommandResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Flowcordia upgrade preflight: ${result.state}`);
  console.log(`Phase: ${result.phase}`);
  console.log(result.message);
  for (const check of result.configuration.checks) {
    console.log(`[${check.state}] configuration.${check.key}: ${check.message}`);
  }
  for (const check of result.upgrade?.checks ?? []) {
    console.log(`[${check.state}] upgrade.${check.key}: ${check.message}`);
  }
  if (result.upgrade) {
    console.log(`Kind: ${result.upgrade.kind}`);
    console.log(`Pending migrations: ${result.upgrade.migrations.pendingCount}`);
    console.log(`Steps: ${result.upgrade.steps.join(" -> ")}`);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const checkedAt = new Date();
  const configuration = presentFlowcordiaInstallationPreflight({
    environment: process.env,
    profile: "release",
    nodeVersion: process.versions.node,
    checkedAt,
    allowGlobalStudio: options.allowGlobalStudio,
  });
  if (configuration.state !== "READY") {
    const result: UpgradeCommandResult = {
      schemaVersion: "0.1",
      state: "BLOCKED",
      phase: "configuration",
      checkedAt: checkedAt.toISOString(),
      configuration,
      message: "Candidate release configuration is blocked before upgrade observations.",
    };
    printResult(result, options.json);
    process.exitCode = 1;
    return;
  }

  const targetApplicationCommitSha = process.env.FLOWCORDIA_APPLICATION_COMMIT_SHA!;
  const migrationsPath = resolve(process.cwd(), "internal-packages/database/prisma/migrations");
  const database = new PrismaClient({
    datasources: { db: { url: boundedDatabaseUrl(process.env.DATABASE_URL!) } },
    log: [],
  });

  try {
    const [appliedMigrations, targetMigrations, backupManifest, restoreEvidence] =
      await Promise.all([
        readFlowcordiaAppliedMigrationArtifacts(database),
        readFlowcordiaTargetMigrationArtifacts(migrationsPath),
        readBoundedJson(options.backupManifestPath),
        readBoundedJson(options.restoreEvidencePath),
      ]);
    const upgrade = presentFlowcordiaUpgradePreflight({
      currentApplicationCommitSha: options.currentApplicationCommitSha,
      targetApplicationCommitSha,
      appliedMigrations,
      targetMigrations,
      checkedAt,
      recoveryMaxAgeMs: options.recoveryMaxAgeMs,
      backupManifest,
      restoreEvidence,
      confirmMigrationReview: options.confirmMigrationReview,
      confirmMaintenanceWindow: options.confirmMaintenanceWindow,
      confirmRestoreRollback: options.confirmRestoreRollback,
    });
    const result: UpgradeCommandResult = {
      schemaVersion: "0.1",
      state: upgrade.state,
      phase: "upgrade",
      checkedAt: checkedAt.toISOString(),
      configuration,
      upgrade,
      message: upgrade.message,
    };
    printResult(result, options.json);
    process.exitCode = upgrade.state === "READY" ? 0 : 1;
  } catch {
    const result: UpgradeCommandResult = {
      schemaVersion: "0.1",
      state: "UNAVAILABLE",
      phase: "observations",
      checkedAt: checkedAt.toISOString(),
      configuration,
      message: "Upgrade observations could not be completed safely.",
    };
    printResult(result, options.json);
    process.exitCode = 1;
  } finally {
    await database.$disconnect().catch(() => undefined);
  }
}

void main().catch(() => {
  console.error("Flowcordia upgrade preflight failed safely.");
  process.exitCode = 1;
});
