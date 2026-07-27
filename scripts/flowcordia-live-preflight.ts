import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { PrismaClient } from "../internal-packages/database/generated/prisma";
import {
  presentFlowcordiaDependencyPreflight,
  type FlowcordiaDependencyProjection,
} from "../apps/webapp/app/features/flowcordia/operations/dependency-preflight";
import {
  readFlowcordiaRepositoryMigrationNames,
  runFlowcordiaDependencyProbes,
} from "../apps/webapp/app/features/flowcordia/operations/dependency-preflight.server";
import {
  FLOWCORDIA_INSTALLATION_PROFILES,
  presentFlowcordiaInstallationPreflight,
  type FlowcordiaInstallationProfile,
  type FlowcordiaInstallationProjection,
} from "../apps/webapp/app/features/flowcordia/operations/installation-preflight";

interface CliOptions {
  profile: FlowcordiaInstallationProfile;
  json: boolean;
  allowGlobalStudio: boolean;
}

interface LivePreflightResult {
  schemaVersion: "0.1";
  profile: FlowcordiaInstallationProfile;
  state: "READY" | "BLOCKED" | "UNAVAILABLE";
  phase: "configuration" | "dependencies";
  checkedAt: string;
  configuration: FlowcordiaInstallationProjection;
  dependencies?: FlowcordiaDependencyProjection;
}

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-live-preflight.ts --profile <web|worker|release> [--json] [--allow-global-studio]"
  );
  process.exit(2);
}

function parseOptions(args: string[]): CliOptions {
  const values = (() => {
    try {
      return parseArgs({
        args,
        options: {
          profile: { type: "string" },
          json: { type: "boolean", default: false },
          "allow-global-studio": { type: "boolean", default: false },
        },
        strict: true,
        allowPositionals: false,
      }).values;
    } catch {
      usage();
    }
  })();
  if (
    !values.profile ||
    !FLOWCORDIA_INSTALLATION_PROFILES.includes(values.profile as FlowcordiaInstallationProfile)
  ) {
    usage();
  }
  return {
    profile: values.profile as FlowcordiaInstallationProfile,
    json: values.json,
    allowGlobalStudio: values["allow-global-studio"],
  };
}

function boundedDatabaseUrl(input: string): string {
  const parsed = new URL(input);
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set("pool_timeout", "5");
  parsed.searchParams.set("connection_timeout", "5");
  parsed.searchParams.set("application_name", "flowcordia-live-preflight");
  return parsed.toString();
}

function printResult(result: LivePreflightResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Flowcordia live preflight: ${result.state}`);
  console.log(`Phase: ${result.phase}`);
  for (const check of result.configuration.checks) {
    console.log(`[${check.state}] configuration.${check.key}: ${check.message}`);
  }
  for (const check of result.dependencies?.checks ?? []) {
    console.log(`[${check.state}] dependency.${check.key}: ${check.message}`);
  }
}

function unavailableObservation(profile: FlowcordiaInstallationProfile) {
  return {
    databaseConnection: "UNAVAILABLE" as const,
    databaseMigrations: "UNAVAILABLE" as const,
    githubApp: "UNAVAILABLE" as const,
    ...(profile === "worker" || profile === "release"
      ? { workerHeartbeat: "UNAVAILABLE" as const }
      : {}),
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const checkedAt = new Date();
  const configuration = presentFlowcordiaInstallationPreflight({
    environment: process.env,
    profile: options.profile,
    nodeVersion: process.versions.node,
    checkedAt,
    allowGlobalStudio: options.allowGlobalStudio,
  });

  if (configuration.state !== "READY") {
    const result: LivePreflightResult = {
      schemaVersion: "0.1",
      profile: options.profile,
      state: "BLOCKED",
      phase: "configuration",
      checkedAt: checkedAt.toISOString(),
      configuration,
    };
    printResult(result, options.json);
    process.exitCode = 1;
    return;
  }

  const migrationsPath = resolve(process.cwd(), "internal-packages/database/prisma/migrations");
  const database = new PrismaClient({
    datasources: { db: { url: boundedDatabaseUrl(process.env.DATABASE_URL!) } },
    log: [],
  });

  try {
    const migrationNames = await readFlowcordiaRepositoryMigrationNames(migrationsPath);
    const observation = await runFlowcordiaDependencyProbes({
      profile: options.profile,
      database,
      migrationNames,
      githubApp: {
        appId: process.env.GITHUB_APP_ID!,
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
      },
      now: checkedAt,
    });
    const dependencies = presentFlowcordiaDependencyPreflight({
      profile: options.profile,
      observation,
      checkedAt,
    });
    const result: LivePreflightResult = {
      schemaVersion: "0.1",
      profile: options.profile,
      state: dependencies.state,
      phase: "dependencies",
      checkedAt: checkedAt.toISOString(),
      configuration,
      dependencies,
    };
    printResult(result, options.json);
    process.exitCode = dependencies.state === "READY" ? 0 : 1;
  } catch {
    const dependencies = presentFlowcordiaDependencyPreflight({
      profile: options.profile,
      observation: unavailableObservation(options.profile),
      checkedAt,
    });
    const result: LivePreflightResult = {
      schemaVersion: "0.1",
      profile: options.profile,
      state: "UNAVAILABLE",
      phase: "dependencies",
      checkedAt: checkedAt.toISOString(),
      configuration,
      dependencies,
    };
    printResult(result, options.json);
    process.exitCode = 1;
  } finally {
    await database.$disconnect().catch(() => undefined);
  }
}

void main().catch(() => {
  console.error("Flowcordia live preflight failed safely.");
  process.exitCode = 1;
});
