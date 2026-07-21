import { createSign } from "node:crypto";
import { readdir } from "node:fs/promises";
import type { FlowcordiaInstallationProfile } from "./installation-preflight";
import type {
  FlowcordiaDependencyObservation,
  FlowcordiaDependencyState,
} from "./dependency-preflight";

const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9_]+$/;
const GITHUB_APP_ID = /^[1-9][0-9]{0,19}$/;
const WORKER_NAME = "proposal-operations";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const DEFAULT_GITHUB_TIMEOUT_MS = 10_000;

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

interface HeartbeatRow {
  observedAt: Date;
  healthyUntil: Date;
}

export interface FlowcordiaDependencyDatabase {
  $queryRawUnsafe<T>(query: string): Promise<T>;
  flowcordiaOperationsWorkerHeartbeat: {
    findUnique(input: {
      where: { workerName: string };
      select: { observedAt: true; healthyUntil: true };
    }): Promise<HeartbeatRow | null>;
  };
}

export interface FlowcordiaGitHubAppProbeConfig {
  appId: string;
  privateKey: string;
  timeoutMs?: number;
}

export interface FlowcordiaDependencyProbeInput {
  profile: FlowcordiaInstallationProfile;
  database: FlowcordiaDependencyDatabase;
  migrationNames: readonly string[];
  githubApp: FlowcordiaGitHubAppProbeConfig;
  now: Date;
  fetch?: typeof fetch;
}

function stateFromGitHubStatus(status: number): FlowcordiaDependencyState {
  if (status === 200) return "READY";
  if (status === 401 || status === 403 || status === 404) return "BLOCKED";
  return "UNAVAILABLE";
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function createGitHubAppJwt(input: { appId: string; privateKey: string; now: Date }): string {
  if (!GITHUB_APP_ID.test(input.appId) || Number.isNaN(input.now.getTime())) {
    throw new TypeError("GitHub App probe configuration is invalid.");
  }
  const issuedAt = Math.floor(input.now.getTime() / 1_000) - 60;
  const payload = {
    iat: issuedAt,
    exp: issuedAt + 9 * 60,
    iss: input.appId,
  };
  const encoded = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify(payload)
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(encoded);
  signer.end();
  const signature = signer.sign(input.privateKey.replace(/\\n/g, "\n"));
  return `${encoded}.${base64Url(signature)}`;
}

export async function readFlowcordiaRepositoryMigrationNames(
  migrationsPath: string
): Promise<string[]> {
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => MIGRATION_NAME.test(name))
    .sort();
  if (names.length === 0 || names.length !== new Set(names).size) {
    throw new TypeError("Repository migration inventory is invalid.");
  }
  return names;
}

export function evaluateFlowcordiaMigrationRows(input: {
  repositoryMigrationNames: readonly string[];
  rows: readonly MigrationRow[];
}): FlowcordiaDependencyState {
  if (
    input.repositoryMigrationNames.length === 0 ||
    input.repositoryMigrationNames.some((name) => !MIGRATION_NAME.test(name)) ||
    input.repositoryMigrationNames.length !== new Set(input.repositoryMigrationNames).size
  ) {
    return "BLOCKED";
  }
  if (
    input.rows.some(
      (row) =>
        !MIGRATION_NAME.test(row.migration_name) ||
        (!(row.finished_at instanceof Date) && row.finished_at !== null) ||
        (!(row.rolled_back_at instanceof Date) && row.rolled_back_at !== null) ||
        (row.finished_at === null && row.rolled_back_at === null)
    )
  ) {
    return "BLOCKED";
  }

  const applied = new Set(
    input.rows
      .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
      .map((row) => row.migration_name)
  );
  const repository = new Set(input.repositoryMigrationNames);
  if (applied.size !== repository.size) return "BLOCKED";
  for (const migration of repository) {
    if (!applied.has(migration)) return "BLOCKED";
  }
  return "READY";
}

export function evaluateFlowcordiaWorkerHeartbeat(
  heartbeat: HeartbeatRow | null,
  now: Date
): FlowcordiaDependencyState {
  if (!heartbeat || Number.isNaN(now.getTime())) return "BLOCKED";
  if (
    Number.isNaN(heartbeat.observedAt.getTime()) ||
    Number.isNaN(heartbeat.healthyUntil.getTime()) ||
    heartbeat.observedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS ||
    heartbeat.healthyUntil.getTime() < heartbeat.observedAt.getTime() ||
    heartbeat.healthyUntil.getTime() < now.getTime()
  ) {
    return "BLOCKED";
  }
  return "READY";
}

async function probeDatabase(input: {
  database: FlowcordiaDependencyDatabase;
  migrationNames: readonly string[];
  includeWorker: boolean;
  now: Date;
}): Promise<
  Pick<
    FlowcordiaDependencyObservation,
    "databaseConnection" | "databaseMigrations" | "workerHeartbeat"
  >
> {
  try {
    await input.database.$queryRawUnsafe<Array<{ value: number }>>("SELECT 1 AS value");
  } catch {
    return {
      databaseConnection: "UNAVAILABLE",
      databaseMigrations: "UNAVAILABLE",
      ...(input.includeWorker ? { workerHeartbeat: "UNAVAILABLE" as const } : {}),
    };
  }

  let databaseMigrations: FlowcordiaDependencyState = "UNAVAILABLE";
  try {
    const rows = await input.database.$queryRawUnsafe<MigrationRow[]>(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"'
    );
    databaseMigrations = evaluateFlowcordiaMigrationRows({
      repositoryMigrationNames: input.migrationNames,
      rows,
    });
  } catch {
    databaseMigrations = "UNAVAILABLE";
  }

  let workerHeartbeat: FlowcordiaDependencyState | undefined;
  if (input.includeWorker) {
    try {
      const heartbeat = await input.database.flowcordiaOperationsWorkerHeartbeat.findUnique({
        where: { workerName: WORKER_NAME },
        select: { observedAt: true, healthyUntil: true },
      });
      workerHeartbeat = evaluateFlowcordiaWorkerHeartbeat(heartbeat, input.now);
    } catch {
      workerHeartbeat = "UNAVAILABLE";
    }
  }

  return {
    databaseConnection: "READY",
    databaseMigrations,
    ...(workerHeartbeat ? { workerHeartbeat } : {}),
  };
}

export async function probeFlowcordiaGitHubApp(input: {
  config: FlowcordiaGitHubAppProbeConfig;
  now: Date;
  fetch?: typeof fetch;
}): Promise<FlowcordiaDependencyState> {
  const timeoutMs = input.config.timeoutMs ?? DEFAULT_GITHUB_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    return "BLOCKED";
  }

  let jwt: string;
  try {
    jwt = createGitHubAppJwt({
      appId: input.config.appId,
      privateKey: input.config.privateKey,
      now: input.now,
    });
  } catch {
    return "BLOCKED";
  }

  try {
    const response = await (input.fetch ?? fetch)("https://api.github.com/app", {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "User-Agent": "flowcordia-live-preflight",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const state = stateFromGitHubStatus(response.status);
    await response.body?.cancel().catch(() => undefined);
    return state;
  } catch {
    return "UNAVAILABLE";
  }
}

export async function runFlowcordiaDependencyProbes(
  input: FlowcordiaDependencyProbeInput
): Promise<FlowcordiaDependencyObservation> {
  if (Number.isNaN(input.now.getTime())) {
    throw new TypeError("Flowcordia dependency probe time is invalid.");
  }
  const includeWorker = input.profile === "worker" || input.profile === "release";
  const [database, githubApp] = await Promise.all([
    probeDatabase({
      database: input.database,
      migrationNames: input.migrationNames,
      includeWorker,
      now: input.now,
    }),
    probeFlowcordiaGitHubApp({ config: input.githubApp, now: input.now, fetch: input.fetch }),
  ]);
  return {
    databaseConnection: database.databaseConnection,
    databaseMigrations: database.databaseMigrations,
    githubApp,
    ...(includeWorker ? { workerHeartbeat: database.workerHeartbeat ?? "UNAVAILABLE" } : {}),
  };
}
