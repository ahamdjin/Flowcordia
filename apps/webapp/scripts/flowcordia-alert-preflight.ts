import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  FLOWCORDIA_ALERT_CANARY_CONFIRMATION,
  presentFlowcordiaAlertConfiguration,
  type FlowcordiaAlertCheck,
  type FlowcordiaAlertPreflightProjection,
} from "../app/features/flowcordia/operations/alert-preflight";

interface CliOptions {
  releaseId: string;
  expectedApplicationCommitSha: string;
  projectRef: string;
  channelRef: string;
  confirmation: string;
  maxPendingAlerts?: number;
  maxOldestPendingAgeMs?: number;
  json: boolean;
}

function usage(): never {
  console.error(
    "Usage: pnpm --filter webapp exec tsx scripts/flowcordia-alert-preflight.ts --release-id <id> --expected-application-commit <sha> --project-ref <ref> --channel-ref <ref> --confirm EXECUTE_EXACT_FLOWCORDIA_ALERT_CANARY [--max-pending <count>] [--max-oldest-pending-age-ms <ms>] [--json]"
  );
  process.exit(2);
}

function positiveInteger(value: string | undefined): number {
  if (!value || !/^[0-9]+$/.test(value)) usage();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) usage();
  return parsed;
}

function parseOptions(args: string[]): CliOptions {
  const values = (() => {
    try {
      return parseArgs({
        args,
        options: {
          "release-id": { type: "string" },
          "expected-application-commit": { type: "string" },
          "project-ref": { type: "string" },
          "channel-ref": { type: "string" },
          confirm: { type: "string" },
          "max-pending": { type: "string" },
          "max-oldest-pending-age-ms": { type: "string" },
          json: { type: "boolean", default: false },
        },
        strict: true,
        allowPositionals: false,
      }).values;
    } catch {
      usage();
    }
  })();

  const releaseId = values["release-id"];
  const expectedApplicationCommitSha = values["expected-application-commit"];
  const projectRef = values["project-ref"];
  const channelRef = values["channel-ref"];
  const confirmation = values.confirm;
  if (
    !releaseId ||
    !expectedApplicationCommitSha ||
    !projectRef ||
    !channelRef ||
    confirmation !== FLOWCORDIA_ALERT_CANARY_CONFIRMATION
  ) {
    usage();
  }

  return {
    releaseId,
    expectedApplicationCommitSha,
    projectRef,
    channelRef,
    confirmation,
    maxPendingAlerts:
      values["max-pending"] === undefined ? undefined : positiveInteger(values["max-pending"]),
    maxOldestPendingAgeMs:
      values["max-oldest-pending-age-ms"] === undefined
        ? undefined
        : positiveInteger(values["max-oldest-pending-age-ms"]),
    json: values.json ?? false,
  };
}

function blockedCheck(key: FlowcordiaAlertCheck["key"], message: string): FlowcordiaAlertCheck {
  return { key, state: "BLOCKED", message };
}

function blockedProjection(
  configuration: ReturnType<typeof presentFlowcordiaAlertConfiguration>
): FlowcordiaAlertPreflightProjection {
  return {
    schemaVersion: "0.1",
    state: "BLOCKED",
    phase: "configuration",
    releaseId: configuration.releaseId,
    checkedAt: configuration.checkedAt,
    applicationCommitSha: configuration.applicationCommitSha,
    channelType: "unresolved",
    backlog: { pendingCount: null, oldestPendingAgeMs: null },
    checks: [
      ...configuration.checks,
      blockedCheck(
        "worker_redis",
        "Alerts-worker Redis was not contacted because configuration is blocked."
      ),
      blockedCheck(
        "canary_delivery",
        "No alert delivery adapter was contacted because configuration is blocked."
      ),
    ],
    message: configuration.message,
  };
}

function printResult(result: FlowcordiaAlertPreflightProjection, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Flowcordia alert readiness: ${result.state}`);
  console.log(`Phase: ${result.phase}`);
  console.log(`Channel type: ${result.channelType}`);
  for (const entry of result.checks) {
    console.log(`[${entry.state}] ${entry.key}: ${entry.message}`);
  }
}

function boundedDatabaseUrl(input: string): string {
  const parsed = new URL(input);
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set("pool_timeout", "5");
  parsed.searchParams.set("connection_timeout", "5");
  parsed.searchParams.set("application_name", "flowcordia-alert-preflight");
  return parsed.toString();
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const checkedAt = new Date();
  const configuration = presentFlowcordiaAlertConfiguration({
    environment: process.env,
    expectedApplicationCommitSha: options.expectedApplicationCommitSha,
    releaseId: options.releaseId,
    projectRef: options.projectRef,
    channelRef: options.channelRef,
    confirmation: options.confirmation,
    checkedAt,
    maxPendingAlerts: options.maxPendingAlerts,
    maxOldestPendingAgeMs: options.maxOldestPendingAgeMs,
  });
  if (configuration.state !== "READY") {
    const result = blockedProjection(configuration);
    printResult(result, options.json);
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    printResult(blockedProjection(configuration), options.json);
    process.exitCode = 1;
    return;
  }

  const [{ PrismaClient }, alertPreflight] = await Promise.all([
    import("../../../internal-packages/database/generated/prisma"),
    import("../app/features/flowcordia/operations/alert-preflight.server"),
  ]);
  const database = new PrismaClient({
    datasources: { db: { url: boundedDatabaseUrl(databaseUrl) } },
    log: [],
  });
  try {
    const result = await alertPreflight.runFlowcordiaAlertPreflight({
      environment: process.env,
      expectedApplicationCommitSha: options.expectedApplicationCommitSha,
      releaseId: options.releaseId,
      projectRef: options.projectRef,
      channelRef: options.channelRef,
      confirmation: options.confirmation,
      checkedAt,
      maxPendingAlerts: options.maxPendingAlerts,
      maxOldestPendingAgeMs: options.maxOldestPendingAgeMs,
      dependencies: {
        verifyWorkerRedis: () => alertPreflight.verifyFlowcordiaAlertsWorkerRedis(process.env),
        observeChannel: () =>
          alertPreflight.observeFlowcordiaAlertChannel({
            database,
            projectRef: options.projectRef,
            channelRef: options.channelRef,
            checkedAt,
          }),
        deliverCanary: (target) =>
          alertPreflight.deliverFlowcordiaAlertCanary({
            target,
            releaseId: options.releaseId,
            applicationCommitSha: options.expectedApplicationCommitSha,
            checkedAt: checkedAt.toISOString(),
          }),
      },
    });
    printResult(result, options.json);
    process.exitCode = result.state === "READY" ? 0 : 1;
  } finally {
    await database.$disconnect().catch(() => undefined);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    console.error("Flowcordia alert readiness failed safely.");
    process.exitCode = 1;
  });
}
