#!/usr/bin/env node
import { createPrivateKey, createSign } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, link, mkdir, open, readFile, rm } from "node:fs/promises";
import { connect as connectNet } from "node:net";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { connect as connectTls } from "node:tls";
import {
  canonicalFlowcordiaValue,
  flowcordiaSha256,
  verifyFlowcordiaReleaseProcess,
} from "./flowcordia-release-contract.mjs";

export const FLOWCORDIA_DOCTOR_SCHEMA_VERSION = "0.1";
export const FLOWCORDIA_DOCTOR_PROFILES = ["web", "operations", "release"];

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SHA256 = /^[0-9a-f]{64}$/;
const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9_]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER = /change[-_ ]?me|replace[-_ ]?me|placeholder|test[-_ ]?secret/i;

function fixedCheck(key, state, readyMessage, failureMessage, skippedMessage) {
  return {
    key,
    state,
    message:
      state === "READY" ? readyMessage : state === "SKIPPED" ? skippedMessage : failureMessage,
  };
}

function requiredForProfile(profile, key) {
  if (key === "worker_heartbeat") return profile === "operations" || profile === "release";
  if (key === "operations_local_health") return profile === "operations";
  if (key === "web_health" || key === "public_origin_reachability") {
    return profile === "web" || profile === "release";
  }
  return true;
}

function observedState(observation) {
  return observation === "READY" ? "READY" : "UNAVAILABLE";
}

function boundedSecret(value, minimum) {
  return typeof value === "string" && value.length >= minimum && !PLACEHOLDER.test(value);
}

function safeUrl(value, protocols) {
  try {
    const parsed = new URL(value);
    return protocols.includes(parsed.protocol) && parsed.hostname && !parsed.hash ? parsed : null;
  } catch {
    return null;
  }
}

function configuredEmail(value) {
  if (typeof value !== "string") return false;
  const angle = /<([^<>]+)>$/.exec(value.trim());
  return EMAIL.test(angle?.[1] ?? value.trim());
}

function staticConfiguration(environment, profile) {
  const appOrigin = safeUrl(environment.APP_ORIGIN, ["https:"]);
  const loginOrigin = safeUrl(environment.LOGIN_ORIGIN, ["https:"]);
  const eventUrl = safeUrl(environment.FLOWCORDIA_PROPOSAL_EVENT_URL, ["https:"]);
  const component = environment.FLOWCORDIA_RELEASE_COMPONENT;
  const roleReady =
    profile === "release" ||
    (profile === "web" &&
      component === "web" &&
      environment.FLOWCORDIA_PROPOSAL_WORKER_ENABLED === "0" &&
      environment.HTTP_SERVER_DISABLED !== "true") ||
    (profile === "operations" &&
      component === "operations_worker" &&
      environment.FLOWCORDIA_PROPOSAL_WORKER_ENABLED === "1" &&
      environment.HTTP_SERVER_DISABLED === "true" &&
      environment.FLOWCORDIA_STUDIO_ENABLED === "0");

  return Boolean(
    environment.APP_ENV === "production" &&
    environment.NODE_ENV === "production" &&
    appOrigin &&
    loginOrigin &&
    appOrigin.origin === loginOrigin.origin &&
    boundedSecret(environment.SESSION_SECRET, 32) &&
    boundedSecret(environment.MAGIC_LINK_SECRET, 32) &&
    /^[0-9a-f]{32}$/.test(environment.ENCRYPTION_KEY ?? "") &&
    environment.GITHUB_APP_ENABLED === "1" &&
    /^[1-9][0-9]{0,19}$/.test(environment.GITHUB_APP_ID ?? "") &&
    /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(environment.GITHUB_APP_SLUG ?? "") &&
    boundedSecret(environment.GITHUB_APP_PRIVATE_KEY, 128) &&
    boundedSecret(environment.GITHUB_APP_WEBHOOK_SECRET, 32) &&
    eventUrl &&
    boundedSecret(environment.FLOWCORDIA_PROPOSAL_EVENT_SECRET, 32) &&
    environment.SKIP_POSTGRES_MIGRATIONS === "1" &&
    environment.SKIP_DASHBOARD_AGENT_MIGRATIONS === "1" &&
    environment.SKIP_CLICKHOUSE_MIGRATIONS === "1" &&
    roleReady
  );
}

function timeoutSignal(milliseconds) {
  return AbortSignal.timeout(milliseconds);
}

function webRequire() {
  return createRequire(join(ROOT, "apps/webapp/package.json"));
}

function rootRequire() {
  return createRequire(import.meta.url);
}

async function probeDatabase(environment, release) {
  let database;
  try {
    const generated = rootRequire()(join(ROOT, "internal-packages/database/generated/prisma"));
    const parsed = new URL(environment.DATABASE_URL);
    parsed.searchParams.set("connection_limit", "1");
    parsed.searchParams.set("pool_timeout", "5");
    parsed.searchParams.set("connection_timeout", "5");
    parsed.searchParams.set("application_name", "flowcordia-doctor");
    database = new generated.PrismaClient({
      datasources: { db: { url: parsed.toString() } },
      log: [],
    });
    await database.$queryRawUnsafe("SELECT 1");
    const rows = await database.$queryRawUnsafe(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name'
    );
    if (
      !Array.isArray(rows) ||
      rows.length !== release.migrations.count ||
      rows.some(
        (row) =>
          !row ||
          !MIGRATION_NAME.test(row.migration_name) ||
          !SHA256.test(row.checksum) ||
          !(row.finished_at instanceof Date) ||
          row.rolled_back_at !== null
      ) ||
      flowcordiaSha256(
        rows.map((row) => ({ name: row.migration_name, checksum: row.checksum }))
      ) !== release.migrations.sha256
    ) {
      return { database: "READY", migrations: "UNAVAILABLE", heartbeat: "UNAVAILABLE" };
    }
    const heartbeatRows = await database.$queryRawUnsafe(
      'SELECT "healthyUntil" FROM "FlowcordiaOperationsWorkerHeartbeat" WHERE "workerName" = \'proposal-operations\''
    );
    const healthyUntil = Array.isArray(heartbeatRows) ? heartbeatRows[0]?.healthyUntil : undefined;
    return {
      database: "READY",
      migrations: "READY",
      heartbeat:
        healthyUntil instanceof Date && healthyUntil.getTime() > Date.now()
          ? "READY"
          : "UNAVAILABLE",
    };
  } catch {
    return { database: "UNAVAILABLE", migrations: "UNAVAILABLE", heartbeat: "UNAVAILABLE" };
  } finally {
    await database?.$disconnect().catch(() => undefined);
  }
}

async function probeRedis(environment) {
  let client;
  try {
    const loaded = webRequire()("ioredis");
    const Redis = loaded.default ?? loaded;
    client = new Redis({
      host: environment.REDIS_HOST,
      port: Number(environment.REDIS_PORT),
      username: environment.REDIS_USERNAME || undefined,
      password: environment.REDIS_PASSWORD || undefined,
      tls: environment.REDIS_TLS_DISABLED === "true" ? undefined : {},
      lazyConnect: true,
      connectTimeout: 5_000,
      commandTimeout: 5_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: null,
    });
    await client.connect();
    return (await client.ping()) === "PONG" ? "READY" : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  } finally {
    await client?.quit().catch(() => undefined);
    client?.disconnect();
  }
}

async function probeClickHouse(environment) {
  try {
    const parsed = safeUrl(environment.CLICKHOUSE_URL, ["http:", "https:"]);
    if (!parsed) return "UNAVAILABLE";
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.pathname = "/";
    parsed.searchParams.set("query", "SELECT 1");
    const headers = {};
    if (username || password) {
      headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
    const response = await fetch(parsed, { method: "POST", headers, signal: timeoutSignal(5_000) });
    return response.ok && (await response.text()).trim() === "1" ? "READY" : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

async function probeTcpUrl(value) {
  const parsed = safeUrl(value, ["http:", "https:"]);
  if (!parsed) return "UNAVAILABLE";
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  return new Promise((resolvePromise) => {
    let settled = false;
    let socket;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(state);
    };
    if (parsed.protocol === "https:") {
      socket = connectTls({
        host: parsed.hostname,
        port,
        servername: parsed.hostname,
        rejectUnauthorized: true,
      });
      socket.once("secureConnect", () => finish("READY"));
    } else {
      socket = connectNet({ host: parsed.hostname, port });
      socket.once("connect", () => finish("READY"));
    }
    socket.setTimeout(5_000);
    socket.once("timeout", () => finish("UNAVAILABLE"));
    socket.once("error", () => finish("UNAVAILABLE"));
  });
}

export function resolveFlowcordiaDoctorObjectStoreEndpoint(environment) {
  const endpoint = safeUrl(environment.OBJECT_STORE_BASE_URL, ["http:", "https:"]);
  if (!endpoint) return null;
  if (endpoint.protocol === "https:") return endpoint;
  const privateBundledMinio =
    environment.FLOWCORDIA_BUNDLED_MODE === "1" &&
    endpoint.toString() === new URL("http://minio:9000").toString() &&
    environment.OBJECT_STORE_BUCKET === "packets" &&
    environment.OBJECT_STORE_FORCE_PATH_STYLE === "true";
  return privateBundledMinio ? endpoint : null;
}

async function probeObjectStore(environment) {
  let client;
  try {
    const loaded = webRequire()("@aws-sdk/client-s3");
    const endpoint = resolveFlowcordiaDoctorObjectStoreEndpoint(environment);
    if (
      !endpoint ||
      !environment.OBJECT_STORE_BUCKET ||
      !environment.OBJECT_STORE_REGION ||
      !environment.OBJECT_STORE_ACCESS_KEY_ID ||
      !environment.OBJECT_STORE_SECRET_ACCESS_KEY
    ) {
      return "UNAVAILABLE";
    }
    client = new loaded.S3Client({
      endpoint: endpoint.toString(),
      region: environment.OBJECT_STORE_REGION,
      credentials: {
        accessKeyId: environment.OBJECT_STORE_ACCESS_KEY_ID,
        secretAccessKey: environment.OBJECT_STORE_SECRET_ACCESS_KEY,
      },
      forcePathStyle: environment.OBJECT_STORE_FORCE_PATH_STYLE === "true",
      maxAttempts: 1,
    });
    await client.send(new loaded.HeadBucketCommand({ Bucket: environment.OBJECT_STORE_BUCKET }), {
      abortSignal: timeoutSignal(5_000),
    });
    return "READY";
  } catch {
    return "UNAVAILABLE";
  } finally {
    client?.destroy();
  }
}

function emailConfiguration(environment) {
  if (!configuredEmail(environment.FROM_EMAIL) || !configuredEmail(environment.REPLY_TO_EMAIL)) {
    return "UNAVAILABLE";
  }
  if (environment.EMAIL_TRANSPORT === "resend") {
    return boundedSecret(environment.RESEND_API_KEY, 20) ? "READY" : "UNAVAILABLE";
  }
  if (environment.EMAIL_TRANSPORT === "smtp") {
    return environment.SMTP_HOST &&
      Number(environment.SMTP_PORT) > 0 &&
      boundedSecret(environment.SMTP_PASSWORD, 12)
      ? "READY"
      : "UNAVAILABLE";
  }
  return environment.EMAIL_TRANSPORT === "aws-ses" ? "READY" : "UNAVAILABLE";
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function probeGithubApp(environment) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(
      JSON.stringify({ iat: now - 30, exp: now + 480, iss: environment.GITHUB_APP_ID })
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    const privateKey = environment.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");
    const signature = signer.sign(createPrivateKey(privateKey), "base64url");
    const response = await fetch("https://api.github.com/app", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${header}.${payload}.${signature}`,
        "User-Agent": "flowcordia-doctor",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: timeoutSignal(8_000),
    });
    if (!response.ok) return "UNAVAILABLE";
    const body = await response.json();
    return String(body.id) === environment.GITHUB_APP_ID &&
      body.slug === environment.GITHUB_APP_SLUG
      ? "READY"
      : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

async function probeHttp(url, allowHttp = false) {
  try {
    const parsed = safeUrl(url, allowHttp ? ["http:", "https:"] : ["https:"]);
    if (!parsed) return "UNAVAILABLE";
    const response = await fetch(parsed, { redirect: "error", signal: timeoutSignal(8_000) });
    return response.ok ? "READY" : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

async function probeOperationsLocalHealth(environment) {
  try {
    const path = "/tmp/flowcordia/operations-health.json";
    const information = await lstat(path);
    if (
      information.isSymbolicLink() ||
      !information.isFile() ||
      information.size < 2 ||
      information.size > 1024
    ) {
      return "UNAVAILABLE";
    }
    const value = JSON.parse(await readFile(path, "utf8"));
    const checkedAt = new Date(value.checkedAt);
    return value.schemaVersion === "0.1" &&
      value.state === "READY" &&
      value.applicationCommitSha === environment.FLOWCORDIA_APPLICATION_COMMIT_SHA &&
      Number.isFinite(checkedAt.getTime()) &&
      checkedAt.toISOString() === value.checkedAt &&
      Date.now() - checkedAt.getTime() <= 45_000
      ? "READY"
      : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

async function defaultObservations(environment, release, profile) {
  const database = await probeDatabase(environment, release);
  const [redis, clickhouse, electric, objectStore, githubApp] = await Promise.all([
    probeRedis(environment),
    probeClickHouse(environment),
    probeTcpUrl(environment.ELECTRIC_ORIGIN),
    probeObjectStore(environment),
    probeGithubApp(environment),
  ]);
  const appOrigin = safeUrl(environment.APP_ORIGIN, ["https:"]);
  const publicHealth = appOrigin ? new URL("/healthcheck", appOrigin).toString() : "";
  const internalHealth =
    environment.FLOWCORDIA_DOCTOR_WEB_HEALTH_URL ||
    (profile === "web" ? "http://127.0.0.1:3000/healthcheck" : "http://web:3000/healthcheck");
  return {
    database: database.database,
    migrations: database.migrations,
    redis,
    clickhouse,
    electric,
    objectStore,
    email: emailConfiguration(environment),
    githubApp,
    workerHeartbeat: database.heartbeat,
    publicOrigin: appOrigin ? "READY" : "UNAVAILABLE",
    publicOriginReachability: requiredForProfile(profile, "public_origin_reachability")
      ? await probeHttp(publicHealth)
      : "SKIPPED",
    webHealth: requiredForProfile(profile, "web_health")
      ? await probeHttp(internalHealth, true)
      : "SKIPPED",
    operationsLocalHealth: requiredForProfile(profile, "operations_local_health")
      ? await probeOperationsLocalHealth(environment)
      : "SKIPPED",
  };
}

export function presentFlowcordiaDoctor(input) {
  const profileState = (key, observation) =>
    requiredForProfile(input.profile, key) ? observedState(observation) : "SKIPPED";
  const checks = [
    fixedCheck(
      "release_identity",
      input.releaseIdentityReady ? "READY" : "BLOCKED",
      "Release manifest, application, image, runtime, and process identity agree.",
      "Release identity is missing, malformed, or inconsistent.",
      "Release identity is not applicable."
    ),
    fixedCheck(
      "application_configuration",
      input.configurationReady ? "READY" : "BLOCKED",
      "Production secrets, origins, GitHub App, worker delivery, migration isolation, and process mode are bounded.",
      "Production configuration is incomplete, unsafe, or inconsistent with the process profile.",
      "Application configuration is not applicable."
    ),
    fixedCheck(
      "database_connection",
      observedState(input.observations.database),
      "PostgreSQL accepted a bounded read-only probe.",
      "PostgreSQL did not accept the bounded read-only probe.",
      "PostgreSQL was not checked."
    ),
    fixedCheck(
      "database_migrations",
      observedState(input.observations.migrations),
      "Applied Prisma migrations match the exact release inventory.",
      "Applied Prisma migrations do not match the exact release inventory.",
      "Prisma migrations were not checked."
    ),
    fixedCheck(
      "redis",
      observedState(input.observations.redis),
      "Redis accepted authentication and PING.",
      "Redis did not accept authentication and PING.",
      "Redis was not checked."
    ),
    fixedCheck(
      "clickhouse",
      observedState(input.observations.clickhouse),
      "ClickHouse accepted a bounded SELECT 1 probe.",
      "ClickHouse did not accept a bounded SELECT 1 probe.",
      "ClickHouse was not checked."
    ),
    fixedCheck(
      "electric",
      observedState(input.observations.electric),
      "Electric completed a bounded transport connection.",
      "Electric did not complete a bounded transport connection.",
      "Electric was not checked."
    ),
    fixedCheck(
      "object_store",
      observedState(input.observations.objectStore),
      "The configured object-store bucket accepted a read-only HEAD probe.",
      "The configured object-store bucket did not accept the read-only HEAD probe.",
      "Object storage was not checked."
    ),
    fixedCheck(
      "email_configuration",
      observedState(input.observations.email),
      "A supported non-console product-email transport is configured.",
      "A supported non-console product-email transport is not fully configured.",
      "Product email was not checked."
    ),
    fixedCheck(
      "github_app",
      observedState(input.observations.githubApp),
      "GitHub authenticated the exact configured App identity.",
      "GitHub did not authenticate the exact configured App identity.",
      "GitHub App identity was not checked."
    ),
    fixedCheck(
      "worker_heartbeat",
      profileState("worker_heartbeat", input.observations.workerHeartbeat),
      "The dedicated Flowcordia operations worker heartbeat is fresh.",
      "The dedicated Flowcordia operations worker heartbeat is unavailable or stale.",
      "The web-only profile does not require a worker heartbeat."
    ),
    fixedCheck(
      "public_origin",
      observedState(input.observations.publicOrigin),
      "The advertised application origin is canonical HTTPS.",
      "The advertised application origin is not canonical HTTPS.",
      "The public origin was not checked."
    ),
    fixedCheck(
      "public_origin_reachability",
      profileState("public_origin_reachability", input.observations.publicOriginReachability),
      "The advertised HTTPS origin served a successful health response without redirect.",
      "The advertised HTTPS origin did not serve a successful direct health response.",
      "The operations-only profile does not require public HTTP reachability."
    ),
    fixedCheck(
      "web_health",
      profileState("web_health", input.observations.webHealth),
      "The selected web replica served a successful internal health response.",
      "The selected web replica did not serve a successful internal health response.",
      "The operations-only profile does not require internal web health."
    ),
    fixedCheck(
      "operations_local_health",
      profileState("operations_local_health", input.observations.operationsLocalHealth),
      "The operations event loop refreshed the exact-revision local readiness pulse.",
      "The operations event loop local readiness pulse is unavailable or stale.",
      "The selected profile does not inspect process-local operations readiness."
    ),
  ];
  const state = checks.some((candidate) => candidate.state === "BLOCKED")
    ? "BLOCKED"
    : checks.some((candidate) => candidate.state === "UNAVAILABLE")
      ? "UNAVAILABLE"
      : "READY";
  const withoutDigest = {
    schemaVersion: FLOWCORDIA_DOCTOR_SCHEMA_VERSION,
    kind: "flowcordia-self-host-diagnostics",
    state,
    profile: input.profile,
    release: {
      releaseId: input.release.releaseId,
      version: input.release.version,
      applicationCommitSha: input.release.applicationCommitSha,
      upstreamCommitSha: input.release.upstreamCommitSha,
      imageDigest: input.release.image.digest,
      manifestSha256: input.release.manifestSha256,
    },
    checkedAt: input.checkedAt.toISOString(),
    checks,
  };
  return { ...withoutDigest, evidenceSha256: flowcordiaSha256(withoutDigest) };
}

export async function runFlowcordiaDoctor(input) {
  const checkedAt = input.checkedAt ?? new Date();
  if (!FLOWCORDIA_DOCTOR_PROFILES.includes(input.profile) || Number.isNaN(checkedAt.getTime())) {
    throw new TypeError("Flowcordia doctor input is invalid.");
  }
  let release;
  let releaseIdentityReady = true;
  try {
    release = await verifyFlowcordiaReleaseProcess({
      path: input.environment.FLOWCORDIA_RELEASE_MANIFEST_PATH,
      expectedManifestDigest: input.environment.FLOWCORDIA_RELEASE_MANIFEST_SHA256,
      applicationCommitSha: input.environment.FLOWCORDIA_APPLICATION_COMMIT_SHA,
      imageDigest: input.environment.FLOWCORDIA_IMAGE_DIGEST,
      component: input.profile === "operations" ? "operations_worker" : "web",
    });
  } catch {
    releaseIdentityReady = false;
    release = {
      releaseId: "unavailable",
      version: "0.0.0",
      applicationCommitSha: "0".repeat(40),
      upstreamCommitSha: "0".repeat(40),
      image: { digest: "0".repeat(64) },
      manifestSha256: "0".repeat(64),
      migrations: { count: 0, sha256: "0".repeat(64) },
    };
  }
  const configurationReady = staticConfiguration(input.environment, input.profile);
  const observations =
    releaseIdentityReady && configurationReady
      ? await (input.observe ?? defaultObservations)(input.environment, release, input.profile)
      : {
          database: "UNAVAILABLE",
          migrations: "UNAVAILABLE",
          redis: "UNAVAILABLE",
          clickhouse: "UNAVAILABLE",
          electric: "UNAVAILABLE",
          objectStore: "UNAVAILABLE",
          email: "UNAVAILABLE",
          githubApp: "UNAVAILABLE",
          workerHeartbeat: "UNAVAILABLE",
          publicOrigin: safeUrl(input.environment.APP_ORIGIN, ["https:"]) ? "READY" : "UNAVAILABLE",
          publicOriginReachability: "UNAVAILABLE",
          webHealth: "UNAVAILABLE",
          operationsLocalHealth: "UNAVAILABLE",
        };
  return presentFlowcordiaDoctor({
    profile: input.profile,
    release,
    checkedAt,
    releaseIdentityReady,
    configurationReady,
    observations,
  });
}

export async function writeFlowcordiaDoctorEvidence(path, evidence) {
  if (!isAbsolute(path)) throw new TypeError("Flowcordia doctor output path must be absolute.");
  const target = resolve(path);
  const repositoryRelative = relative(ROOT, target);
  if (
    repositoryRelative === "" ||
    (!repositoryRelative.startsWith("..") && !isAbsolute(repositoryRelative))
  ) {
    throw new TypeError("Flowcordia doctor output must be outside the repository.");
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(target), `.flowcordia-doctor-${process.pid}-${Date.now()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(
      `${JSON.stringify(canonicalFlowcordiaValue(evidence), null, 2)}\n`,
      "utf8"
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    if (error?.code === "EEXIST") {
      throw new TypeError("Flowcordia doctor output already exists.");
    }
    throw error;
  }
  await rm(temporary, { force: true });
}

function usage() {
  console.error(
    "Usage: node ./scripts/flowcordia-doctor.mjs --profile <web|operations|release> [--json] [--output <absolute-path>]"
  );
  process.exit(2);
}

function parseOptions(args) {
  let profile = "release";
  let json = false;
  let output;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--profile") {
      profile = args[index + 1];
      index += 1;
    } else if (argument === "--json") {
      json = true;
    } else if (argument === "--output") {
      output = args[index + 1];
      index += 1;
    } else {
      usage();
    }
  }
  if (!FLOWCORDIA_DOCTOR_PROFILES.includes(profile) || (output !== undefined && !output)) usage();
  return { profile, json, output };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const evidence = await runFlowcordiaDoctor({
    environment: process.env,
    profile: options.profile,
  });
  if (options.output) await writeFlowcordiaDoctorEvidence(resolve(options.output), evidence);
  if (options.json) {
    console.log(JSON.stringify(evidence, null, 2));
  } else {
    console.log(`Flowcordia doctor: ${evidence.state}`);
    console.log(`Release: ${evidence.release.releaseId}`);
    console.log(`Application: ${evidence.release.applicationCommitSha}`);
    console.log(`Image digest: ${evidence.release.imageDigest}`);
    for (const candidate of evidence.checks) {
      console.log(`[${candidate.state}] ${candidate.key}: ${candidate.message}`);
    }
  }
  process.exitCode = evidence.state === "READY" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(() => {
    console.error("Flowcordia doctor failed safely.");
    process.exitCode = 1;
  });
}
