export const FLOWCORDIA_ALERT_PREFLIGHT_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_ALERT_CANARY_CONFIRMATION =
  "EXECUTE_EXACT_FLOWCORDIA_ALERT_CANARY" as const;
export const FLOWCORDIA_ALERT_DEFAULT_MAX_PENDING = 100;
export const FLOWCORDIA_ALERT_DEFAULT_MAX_OLDEST_PENDING_AGE_MS = 5 * 60 * 1_000;

export type FlowcordiaAlertState = "READY" | "BLOCKED" | "UNAVAILABLE";
export type FlowcordiaAlertChannelType = "EMAIL" | "SLACK" | "WEBHOOK";
export type FlowcordiaAlertPhase = "configuration" | "worker" | "channel" | "delivery" | "complete";

export type FlowcordiaAlertCheckKey =
  | "release_identity"
  | "application_identity"
  | "worker_configuration"
  | "target_selection"
  | "backlog_policy"
  | "canary_confirmation"
  | "worker_redis"
  | "channel_selection"
  | "production_coverage"
  | "failure_coverage"
  | "channel_configuration"
  | "backlog_health"
  | "canary_delivery";

export interface FlowcordiaAlertCheck {
  key: FlowcordiaAlertCheckKey;
  state: FlowcordiaAlertState;
  message: string;
}

export interface FlowcordiaAlertConfigurationProjection {
  schemaVersion: "0.1";
  state: "READY" | "BLOCKED";
  releaseId: string;
  checkedAt: string;
  applicationCommitSha: string;
  maxPendingAlerts: number;
  maxOldestPendingAgeMs: number;
  checks: FlowcordiaAlertCheck[];
  message: string;
}

export interface FlowcordiaAlertChannelObservation {
  found: boolean;
  enabled: boolean;
  type?: FlowcordiaAlertChannelType;
  productionCovered: boolean;
  failureCoverage: boolean;
  propertiesReady: boolean;
  integrationReady: boolean;
  pendingCount: number;
  oldestPendingAgeMs: number | null;
}

export interface FlowcordiaAlertPreflightProjection {
  schemaVersion: "0.1";
  state: FlowcordiaAlertState;
  phase: FlowcordiaAlertPhase;
  releaseId: string;
  checkedAt: string;
  applicationCommitSha: string;
  channelType: FlowcordiaAlertChannelType | "unresolved";
  backlog: {
    pendingCount: number | null;
    oldestPendingAgeMs: number | null;
  };
  checks: FlowcordiaAlertCheck[];
  message: string;
}

export interface FlowcordiaAlertConfigurationInput {
  environment: Record<string, string | undefined>;
  expectedApplicationCommitSha: string;
  releaseId: string;
  projectRef: string;
  channelRef: string;
  confirmation?: string;
  checkedAt: Date;
  maxPendingAlerts?: number;
  maxOldestPendingAgeMs?: number;
}

const SHA = /^[0-9a-f]{40}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const PUBLIC_REF = /^[A-Za-z0-9_-]{3,255}$/;
const PLACEHOLDER = /^(?:change-me|changeme|example|placeholder|replace-me|todo|undefined|null)$/i;

function value(environment: Record<string, string | undefined>, key: string): string {
  const candidate = environment[key]?.trim() ?? "";
  return PLACEHOLDER.test(candidate) ? "" : candidate;
}

function exactApplicationSha(candidate: string): boolean {
  return SHA.test(candidate) && !/^([0-9a-f])\1{39}$/.test(candidate);
}

function integer(raw: string, fallback: number, minimum: number, maximum: number): number | null {
  if (!raw) return fallback;
  if (!/^[0-9]+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function presentCheck(
  key: FlowcordiaAlertCheckKey,
  ready: boolean,
  readyMessage: string,
  blockedMessage: string
): FlowcordiaAlertCheck {
  return {
    key,
    state: ready ? "READY" : "BLOCKED",
    message: ready ? readyMessage : blockedMessage,
  };
}

function alertWorkerConfigurationReady(environment: Record<string, string | undefined>): boolean {
  const host = value(environment, "ALERTS_WORKER_REDIS_HOST") || value(environment, "REDIS_HOST");
  const port = integer(
    value(environment, "ALERTS_WORKER_REDIS_PORT") || value(environment, "REDIS_PORT"),
    6379,
    1,
    65_535
  );
  const tlsDisabled =
    value(environment, "ALERTS_WORKER_REDIS_TLS_DISABLED") ||
    value(environment, "REDIS_TLS_DISABLED") ||
    "false";
  const workers = integer(value(environment, "ALERTS_WORKER_CONCURRENCY_WORKERS"), 1, 1, 64);
  const tasksPerWorker = integer(
    value(environment, "ALERTS_WORKER_CONCURRENCY_TASKS_PER_WORKER"),
    10,
    1,
    100
  );
  const concurrencyLimit = integer(
    value(environment, "ALERTS_WORKER_CONCURRENCY_LIMIT"),
    10,
    1,
    1_000
  );
  const pollInterval = integer(
    value(environment, "ALERTS_WORKER_POLL_INTERVAL"),
    1_000,
    50,
    60_000
  );
  const shutdownTimeout = integer(
    value(environment, "ALERTS_WORKER_SHUTDOWN_TIMEOUT_MS"),
    60_000,
    5_000,
    300_000
  );
  return (
    value(environment, "ALERTS_WORKER_ENABLED") === "true" &&
    Boolean(host) &&
    port !== null &&
    ["true", "false"].includes(tlsDisabled) &&
    workers !== null &&
    tasksPerWorker !== null &&
    concurrencyLimit !== null &&
    concurrencyLimit >= Math.min(workers * tasksPerWorker, 1_000) &&
    pollInterval !== null &&
    shutdownTimeout !== null &&
    shutdownTimeout > pollInterval
  );
}

export function presentFlowcordiaAlertConfiguration(
  input: FlowcordiaAlertConfigurationInput
): FlowcordiaAlertConfigurationProjection {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new TypeError("Flowcordia alert check time is invalid.");
  }

  const maxPendingAlerts = input.maxPendingAlerts ?? FLOWCORDIA_ALERT_DEFAULT_MAX_PENDING;
  const maxOldestPendingAgeMs =
    input.maxOldestPendingAgeMs ?? FLOWCORDIA_ALERT_DEFAULT_MAX_OLDEST_PENDING_AGE_MS;
  const policyReady =
    Number.isSafeInteger(maxPendingAlerts) &&
    maxPendingAlerts >= 0 &&
    maxPendingAlerts <= 10_000 &&
    Number.isSafeInteger(maxOldestPendingAgeMs) &&
    maxOldestPendingAgeMs >= 60_000 &&
    maxOldestPendingAgeMs <= 24 * 60 * 60 * 1_000;

  const deployedApplicationCommitSha = value(
    input.environment,
    "FLOWCORDIA_APPLICATION_COMMIT_SHA"
  );
  const applicationReady =
    exactApplicationSha(input.expectedApplicationCommitSha) &&
    exactApplicationSha(deployedApplicationCommitSha) &&
    input.expectedApplicationCommitSha === deployedApplicationCommitSha;

  const checks: FlowcordiaAlertCheck[] = [
    presentCheck(
      "release_identity",
      RELEASE_ID.test(input.releaseId),
      "The alert canary is bound to a versioned release identity.",
      "The alert canary release identity is missing or malformed."
    ),
    presentCheck(
      "application_identity",
      applicationReady,
      "The expected and deployed application revisions match exactly.",
      "The expected or deployed application revision is invalid, placeholder-backed, or mismatched."
    ),
    presentCheck(
      "worker_configuration",
      alertWorkerConfigurationReady(input.environment),
      "The alerts worker and its bounded Redis/concurrency settings are enabled.",
      "The alerts worker is disabled or its Redis, concurrency, polling, or shutdown settings are incomplete or invalid."
    ),
    presentCheck(
      "target_selection",
      PUBLIC_REF.test(input.projectRef) && PUBLIC_REF.test(input.channelRef),
      "An exact bounded project and alert-channel target were selected.",
      "An exact bounded project and alert-channel target are required."
    ),
    presentCheck(
      "backlog_policy",
      policyReady,
      "Pending-alert count and age policies are bounded.",
      "Pending-alert count or age policy is outside the supported bounds."
    ),
    presentCheck(
      "canary_confirmation",
      input.confirmation === FLOWCORDIA_ALERT_CANARY_CONFIRMATION,
      "An operator explicitly authorized one fixed alert canary.",
      "The exact alert-canary confirmation is required before any delivery adapter is contacted."
    ),
  ];

  const state = checks.some((entry) => entry.state === "BLOCKED") ? "BLOCKED" : "READY";
  return {
    schemaVersion: FLOWCORDIA_ALERT_PREFLIGHT_SCHEMA_VERSION,
    state,
    releaseId: input.releaseId,
    checkedAt: input.checkedAt.toISOString(),
    applicationCommitSha: input.expectedApplicationCommitSha,
    maxPendingAlerts,
    maxOldestPendingAgeMs,
    checks,
    message:
      state === "READY"
        ? "Alert readiness configuration is ready for bounded live verification."
        : "Alert readiness is blocked before Redis, database, Slack, webhook, or email contact.",
  };
}

export function presentFlowcordiaAlertChannelChecks(input: {
  observation: FlowcordiaAlertChannelObservation;
  maxPendingAlerts: number;
  maxOldestPendingAgeMs: number;
}): FlowcordiaAlertCheck[] {
  const observation = input.observation;
  const backlogReady =
    observation.pendingCount <= input.maxPendingAlerts &&
    (observation.oldestPendingAgeMs === null ||
      observation.oldestPendingAgeMs <= input.maxOldestPendingAgeMs);
  return [
    presentCheck(
      "channel_selection",
      observation.found && observation.enabled,
      "The exact alert channel exists and is enabled.",
      "The exact alert channel is missing or disabled."
    ),
    presentCheck(
      "production_coverage",
      observation.productionCovered,
      "The alert channel covers production environments.",
      "The alert channel does not cover production environments."
    ),
    presentCheck(
      "failure_coverage",
      observation.failureCoverage,
      "The alert channel covers task-run and deployment failures.",
      "The alert channel must cover both task-run and deployment failures."
    ),
    presentCheck(
      "channel_configuration",
      observation.propertiesReady && observation.integrationReady,
      "The selected channel uses complete bounded delivery configuration.",
      "The selected channel configuration or required integration is missing, malformed, or unsupported."
    ),
    presentCheck(
      "backlog_health",
      backlogReady,
      "The selected channel has no excessive or stale pending-alert backlog.",
      "The selected channel has too many pending alerts or its oldest pending alert exceeds policy."
    ),
  ];
}
