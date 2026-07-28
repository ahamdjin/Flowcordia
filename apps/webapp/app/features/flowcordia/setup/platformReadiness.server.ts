import { performance } from "node:perf_hooks";
import { prisma } from "~/db.server";
import { env } from "~/env.server";
import { createRedisClient } from "~/redis.server";
import { logger } from "~/services/logger.server";
import { singleton } from "~/utils/singleton";
import { hasObjectStoreClient, verifyObjectStoreConnection } from "~/v3/objectStore.server";

export type PlatformReadinessId =
  | "application-origin"
  | "postgresql"
  | "redis"
  | "clickhouse"
  | "object-storage";

export type PlatformReadinessState = "ready" | "not-configured" | "misconfigured" | "unreachable";

export type PlatformReadinessResult = {
  id: PlatformReadinessId;
  name: string;
  state: PlatformReadinessState;
  summary: string;
  recovery: string | null;
  checkedAt: string;
  latencyMs: number | null;
};

type ProbeFailureKind = "timeout" | "authentication" | "unreachable" | "invalid-response";

class ProbeFailure extends Error {
  constructor(
    readonly kind: ProbeFailureKind,
    message: string
  ) {
    super(message);
    this.name = "ProbeFailure";
  }
}

const READINESS_CACHE_TTL_MS = 15_000;
const PROBE_TIMEOUT_MS = 4_000;

type CachedReadiness = {
  expiresAt: number;
  promise: Promise<PlatformReadinessResult[]>;
};

const readinessCache = singleton(
  "flowcordiaPlatformReadinessCache",
  () => new Map<string, CachedReadiness>()
);

function roundedLatency(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function result(input: Omit<PlatformReadinessResult, "checkedAt">): PlatformReadinessResult {
  return { ...input, checkedAt: new Date().toISOString() };
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function evaluateApplicationOrigin(input: {
  appOrigin: string;
  loginOrigin: string;
  requestOrigin: string;
  appEnv?: string;
}): PlatformReadinessResult {
  let appUrl: URL;
  let loginUrl: URL;
  let requestUrl: URL;

  try {
    appUrl = new URL(input.appOrigin);
    loginUrl = new URL(input.loginOrigin);
    requestUrl = new URL(input.requestOrigin);
  } catch {
    return result({
      id: "application-origin",
      name: "Application URL",
      state: "misconfigured",
      summary: "The application, login, or observed browser origin is not a valid absolute URL.",
      recovery:
        "Set APP_ORIGIN and LOGIN_ORIGIN to the exact public absolute URL, then restart the web application.",
      latencyMs: null,
    });
  }

  if (appUrl.origin !== loginUrl.origin) {
    return result({
      id: "application-origin",
      name: "Application URL",
      state: "misconfigured",
      summary: "APP_ORIGIN and LOGIN_ORIGIN point to different public origins.",
      recovery:
        "Set APP_ORIGIN and LOGIN_ORIGIN to the same public origin so login links and callbacks return to this installation.",
      latencyMs: null,
    });
  }

  if (appUrl.origin !== requestUrl.origin) {
    return result({
      id: "application-origin",
      name: "Application URL",
      state: "misconfigured",
      summary: "The configured application origin does not match the URL used by this browser.",
      recovery:
        "Set APP_ORIGIN and LOGIN_ORIGIN to the browser-visible URL, including its scheme and port, then restart Flowcordia.",
      latencyMs: null,
    });
  }

  if (
    input.appEnv === "production" &&
    appUrl.protocol !== "https:" &&
    !isLoopbackHostname(appUrl.hostname)
  ) {
    return result({
      id: "application-origin",
      name: "Application URL",
      state: "misconfigured",
      summary: "The production application origin is not protected by HTTPS.",
      recovery:
        "Terminate TLS at the reverse proxy and set APP_ORIGIN and LOGIN_ORIGIN to the resulting https:// URL.",
      latencyMs: null,
    });
  }

  return result({
    id: "application-origin",
    name: "Application URL",
    state: "ready",
    summary: "The configured login and application origins match the browser-visible URL.",
    recovery: null,
    latencyMs: null,
  });
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs = PROBE_TIMEOUT_MS): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ProbeFailure("timeout", `Probe exceeded ${timeoutMs}ms.`)),
          timeoutMs
        );
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function classifyFailure(input: {
  id: PlatformReadinessId;
  name: string;
  error: unknown;
  startedAt: number;
  recovery: string;
  authenticationRecovery?: string;
}): PlatformReadinessResult {
  const failure = input.error instanceof ProbeFailure ? input.error : undefined;
  const authenticationFailure = failure?.kind === "authentication";

  logger.warn("Flowcordia platform readiness probe failed", {
    readinessId: input.id,
    failureKind: failure?.kind ?? "unreachable",
  });

  return result({
    id: input.id,
    name: input.name,
    state: authenticationFailure ? "misconfigured" : "unreachable",
    summary:
      failure?.kind === "timeout"
        ? "The service did not answer within four seconds."
        : authenticationFailure
          ? "The service rejected the configured credentials."
          : failure?.kind === "invalid-response"
            ? "The service answered, but not with the expected readiness response."
            : "Flowcordia could not reach the service with the current configuration.",
    recovery:
      authenticationFailure && input.authenticationRecovery
        ? input.authenticationRecovery
        : input.recovery,
    latencyMs: roundedLatency(input.startedAt),
  });
}

async function probePostgresql(): Promise<PlatformReadinessResult> {
  const startedAt = performance.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`);
    return result({
      id: "postgresql",
      name: "PostgreSQL",
      state: "ready",
      summary: "The primary application database accepted a query.",
      recovery: null,
      latencyMs: roundedLatency(startedAt),
    });
  } catch (error) {
    return classifyFailure({
      id: "postgresql",
      name: "PostgreSQL",
      error,
      startedAt,
      recovery:
        "Verify DATABASE_URL, database credentials, network access, and PostgreSQL health, then run the database migrations and retry.",
    });
  }
}

async function probeRedis(): Promise<PlatformReadinessResult> {
  if (!env.REDIS_HOST) {
    return result({
      id: "redis",
      name: "Redis",
      state: "not-configured",
      summary: "No Redis host is configured.",
      recovery:
        "Set REDIS_HOST, REDIS_PORT, and any required Redis credentials, then restart Flowcordia.",
      latencyMs: null,
    });
  }

  const startedAt = performance.now();
  const client = createRedisClient("flowcordia:platform-readiness", {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT ?? 6379,
    username: env.REDIS_USERNAME,
    password: env.REDIS_PASSWORD,
    tlsDisabled: env.REDIS_TLS_DISABLED === "true",
    maxRetriesPerRequest: 1,
  });

  try {
    const response = await withTimeout(client.ping());
    if (response !== "PONG") {
      throw new ProbeFailure("invalid-response", "Redis did not return PONG.");
    }

    return result({
      id: "redis",
      name: "Redis",
      state: "ready",
      summary: "Redis accepted a PING command.",
      recovery: null,
      latencyMs: roundedLatency(startedAt),
    });
  } catch (error) {
    return classifyFailure({
      id: "redis",
      name: "Redis",
      error,
      startedAt,
      recovery:
        "Verify REDIS_HOST, REDIS_PORT, TLS mode, credentials, and network access, then restart Redis or Flowcordia as needed.",
      authenticationRecovery:
        "Correct REDIS_USERNAME and REDIS_PASSWORD so they match the Redis server, then restart Flowcordia.",
    });
  } finally {
    client.disconnect();
  }
}

function clickhouseRequest(urlValue: string): { url: URL; headers: Headers } {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new ProbeFailure("invalid-response", "CLICKHOUSE_URL is not an absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProbeFailure("invalid-response", "CLICKHOUSE_URL must use HTTP or HTTPS.");
  }

  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8" });
  if (url.username || url.password) {
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64")}`
    );
    url.username = "";
    url.password = "";
  }

  return { url, headers };
}

async function probeClickhouse(): Promise<PlatformReadinessResult> {
  const configuredUrl = process.env.CLICKHOUSE_URL?.trim();
  if (!configuredUrl) {
    return result({
      id: "clickhouse",
      name: "ClickHouse",
      state: "not-configured",
      summary: "CLICKHOUSE_URL is not configured.",
      recovery:
        "Set CLICKHOUSE_URL to the ClickHouse HTTP endpoint, including the database and credentials, then restart Flowcordia.",
      latencyMs: null,
    });
  }

  const startedAt = performance.now();
  try {
    const { url, headers } = clickhouseRequest(configuredUrl);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: "SELECT 1 AS ready FORMAT JSONEachRow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      throw new ProbeFailure("authentication", "ClickHouse rejected the credentials.");
    }
    if (!response.ok) {
      throw new ProbeFailure("unreachable", `ClickHouse returned HTTP ${response.status}.`);
    }

    const body = await response.text();
    if (!body.includes('"ready":1')) {
      throw new ProbeFailure("invalid-response", "ClickHouse returned an unexpected query result.");
    }

    return result({
      id: "clickhouse",
      name: "ClickHouse",
      state: "ready",
      summary: "ClickHouse accepted a read-only query.",
      recovery: null,
      latencyMs: roundedLatency(startedAt),
    });
  } catch (error) {
    const normalizedError =
      error instanceof DOMException && error.name === "TimeoutError"
        ? new ProbeFailure("timeout", error.message)
        : error;
    return classifyFailure({
      id: "clickhouse",
      name: "ClickHouse",
      error: normalizedError,
      startedAt,
      recovery:
        "Verify CLICKHOUSE_URL, the HTTP transport, database availability, and network access, then run ClickHouse migrations and retry.",
      authenticationRecovery:
        "Correct the username and password embedded in CLICKHOUSE_URL, then restart Flowcordia.",
    });
  }
}

async function probeObjectStorage(): Promise<PlatformReadinessResult> {
  if (!hasObjectStoreClient()) {
    return result({
      id: "object-storage",
      name: "Object storage",
      state: "not-configured",
      summary: "No usable object-storage configuration was found.",
      recovery:
        "Configure the object-store base URL, bucket, region, protocol, and credentials, then restart Flowcordia.",
      latencyMs: null,
    });
  }

  const startedAt = performance.now();
  try {
    await withTimeout(verifyObjectStoreConnection());
    return result({
      id: "object-storage",
      name: "Object storage",
      state: "ready",
      summary: "The configured object-storage bucket accepted a verification request.",
      recovery: null,
      latencyMs: roundedLatency(startedAt),
    });
  } catch (error) {
    return classifyFailure({
      id: "object-storage",
      name: "Object storage",
      error,
      startedAt,
      recovery:
        "Verify the object-store endpoint, bucket name, region, credentials, path-style mode, and network access, then retry.",
      authenticationRecovery:
        "Correct the object-store access key and secret key, or the workload identity permissions, then retry.",
    });
  }
}

async function runPlatformReadiness(requestOrigin: string): Promise<PlatformReadinessResult[]> {
  const origin = evaluateApplicationOrigin({
    appOrigin: env.APP_ORIGIN,
    loginOrigin: env.LOGIN_ORIGIN,
    requestOrigin,
    appEnv: env.APP_ENV,
  });

  const [postgresql, redis, clickhouse, objectStorage] = await Promise.all([
    probePostgresql(),
    probeRedis(),
    probeClickhouse(),
    probeObjectStorage(),
  ]);

  return [origin, postgresql, redis, clickhouse, objectStorage];
}

export async function getPlatformReadiness(input: {
  requestOrigin: string;
  force?: boolean;
}): Promise<PlatformReadinessResult[]> {
  const cacheKey = input.requestOrigin;
  const now = Date.now();
  const cached = readinessCache.get(cacheKey);
  if (!input.force && cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = runPlatformReadiness(input.requestOrigin).catch((error) => {
    readinessCache.delete(cacheKey);
    throw error;
  });
  readinessCache.set(cacheKey, { expiresAt: now + READINESS_CACHE_TTL_MS, promise });
  return promise;
}
