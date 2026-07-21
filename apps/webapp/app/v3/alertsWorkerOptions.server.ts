import type { RedisOptions } from "ioredis";

export type FlowcordiaAlertsWorkerEnvironment = Record<
  string,
  string | number | boolean | undefined
>;

function text(
  environment: FlowcordiaAlertsWorkerEnvironment,
  primary: string,
  fallback?: string
): string | undefined {
  const value = environment[primary] ?? (fallback ? environment[fallback] : undefined);
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function port(environment: FlowcordiaAlertsWorkerEnvironment): number {
  const candidate = text(environment, "ALERTS_WORKER_REDIS_PORT", "REDIS_PORT");
  const parsed = Number(candidate ?? 6379);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new TypeError("Alerts worker Redis port is invalid.");
  }
  return parsed;
}

export function alertsWorkerRedisOptions(
  environment: FlowcordiaAlertsWorkerEnvironment
): RedisOptions {
  const host = text(environment, "ALERTS_WORKER_REDIS_HOST", "REDIS_HOST");
  if (!host) {
    throw new TypeError("Alerts worker Redis host is required.");
  }
  const tlsDisabled =
    text(environment, "ALERTS_WORKER_REDIS_TLS_DISABLED", "REDIS_TLS_DISABLED") === "true";
  return {
    keyPrefix: "alerts:worker:",
    host,
    port: port(environment),
    username: text(environment, "ALERTS_WORKER_REDIS_USERNAME", "REDIS_USERNAME"),
    password: text(environment, "ALERTS_WORKER_REDIS_PASSWORD", "REDIS_PASSWORD"),
    enableAutoPipelining: true,
    ...(tlsDisabled ? {} : { tls: {} }),
  };
}
