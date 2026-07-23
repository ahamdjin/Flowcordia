import { chmod, link, lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { PrismaClient } from "@trigger.dev/database";
import {
  createFlowcordiaSelfHostCleanDependenciesEvidence,
  type FlowcordiaSelfHostCleanDependenciesEvidence,
} from "../apps/webapp/app/features/flowcordia/operations/self-host-lifecycle-preflight";
import { parseFlowcordiaReleaseDistributionManifest } from "../apps/webapp/app/features/flowcordia/operations/release-distribution";

interface Options {
  manifest: string;
  output: string;
}

function usage(): never {
  console.error(
    "Usage: pnpm flowcordia:self-host:clean-dependencies --manifest <path> --output <path>"
  );
  process.exit(2);
}

function outsideRepository(candidate: string): string {
  if (!isAbsolute(candidate)) usage();
  const path = resolve(candidate);
  const location = relative(resolve(process.cwd()), path);
  if (location === "" || (!location.startsWith("..") && !isAbsolute(location))) usage();
  return path;
}

function parseOptions(args: string[]): Options {
  let manifest = "";
  let output = "";
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!value) usage();
    if (key === "--manifest") manifest = outsideRepository(value);
    else if (key === "--output") output = outsideRepository(value);
    else usage();
  }
  if (!manifest || !output) usage();
  return { manifest, output };
}

function boundedDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (!url.hostname || !url.username || !url.pathname.slice(1)) throw new TypeError();
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "5");
  url.searchParams.set("connection_timeout", "5");
  url.searchParams.set("application_name", "flowcordia-lifecycle-clean-check");
  return url.toString();
}

async function emptyPostgresHistory(url: string, relation: string): Promise<boolean> {
  const database = new PrismaClient({
    datasources: { db: { url: boundedDatabaseUrl(url) } },
    log: [],
  });
  try {
    const rows = await database.$queryRawUnsafe<Array<{ relation: string | null }>>(
      `SELECT to_regclass('${relation.replaceAll("'", "''")}')::text AS relation`
    );
    if (!rows[0]?.relation) return true;
    const count = await database.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${relation}`
    );
    return count[0]?.count === 0n;
  } finally {
    await database.$disconnect().catch(() => undefined);
  }
}

async function emptyClickHouseHistory(value: string): Promise<boolean> {
  const url = new URL(value);
  if (!url.hostname || !["http:", "https:"].includes(url.protocol)) throw new TypeError();
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.slice(1));
  url.username = "";
  url.password = "";
  url.pathname = "/";
  url.search = "";
  if (database) url.searchParams.set("database", database);
  url.searchParams.set(
    "query",
    "SELECT count() FROM system.tables WHERE database = currentDatabase() AND name = 'goose_db_version'"
  );
  const headers: Record<string, string> = {};
  if (username || password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return false;
  const tableCount = Number((await response.text()).trim());
  if (tableCount === 0) return true;
  if (tableCount !== 1) return false;
  url.searchParams.set("query", "SELECT count() FROM goose_db_version");
  const rows = await fetch(url, { method: "POST", headers, signal: AbortSignal.timeout(5_000) });
  return rows.ok && Number((await rows.text()).trim()) === 0;
}

async function writeEvidence(path: string, evidence: FlowcordiaSelfHostCleanDependenciesEvidence) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const information = await lstat(directory);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new TypeError("Lifecycle evidence directory is unsafe.");
  }
  await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new TypeError("Clean dependency evidence already exists.");
    }
    throw error;
  }
  await rm(temporary, { force: true });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const manifestInformation = await lstat(options.manifest);
  if (
    manifestInformation.isSymbolicLink() ||
    !manifestInformation.isFile() ||
    manifestInformation.size < 2 ||
    manifestInformation.size > 64 * 1024
  ) {
    throw new TypeError();
  }
  const manifestSource = await readFile(options.manifest, "utf8");
  const secondManifestInformation = await lstat(options.manifest);
  if (
    secondManifestInformation.isSymbolicLink() ||
    !secondManifestInformation.isFile() ||
    manifestInformation.dev !== secondManifestInformation.dev ||
    manifestInformation.ino !== secondManifestInformation.ino ||
    manifestInformation.size !== secondManifestInformation.size ||
    manifestInformation.mtimeMs !== secondManifestInformation.mtimeMs
  ) {
    throw new TypeError();
  }
  const manifest = parseFlowcordiaReleaseDistributionManifest(JSON.parse(manifestSource));
  const primaryUrl = process.env.DATABASE_URL?.trim();
  const dashboardUrl = (
    process.env.DASHBOARD_AGENT_DIRECT_URL ??
    process.env.DASHBOARD_AGENT_DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL
  )?.trim();
  const clickhouseUrl = process.env.CLICKHOUSE_URL?.trim();
  if (!primaryUrl || !dashboardUrl || !clickhouseUrl) throw new TypeError();
  const [primary, dashboard, clickhouse] = await Promise.all([
    emptyPostgresHistory(primaryUrl, '"_prisma_migrations"'),
    emptyPostgresHistory(dashboardUrl, 'drizzle."__dashboard_agent_migrations"'),
    emptyClickHouseHistory(clickhouseUrl),
  ]);
  const evidence = createFlowcordiaSelfHostCleanDependenciesEvidence({
    releaseManifest: manifest,
    checkedAt: new Date(),
    observations: {
      primary_postgresql: primary ? "READY" : "BLOCKED",
      dashboard_agent_postgresql: dashboard ? "READY" : "BLOCKED",
      clickhouse: clickhouse ? "READY" : "BLOCKED",
    },
  });
  await writeEvidence(options.output, evidence);
  console.log("Flowcordia lifecycle dependency history: READY");
  console.log(`Evidence digest: ${evidence.evidenceSha256}`);
}

void main().catch(() => {
  console.error("Flowcordia lifecycle dependency history is blocked or unavailable.");
  process.exitCode = 1;
});
