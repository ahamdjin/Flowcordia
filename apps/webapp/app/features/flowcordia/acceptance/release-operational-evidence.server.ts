export const FLOWCORDIA_RELEASE_OPERATIONAL_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

const SHA = /^[0-9a-f]{40}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;

const RELEASE_INSTALLATION_CHECKS = [
  "runtime",
  "database",
  "application",
  "github_app",
  "environment",
  "web_secrets",
  "origins",
  "studio_rollout",
  "worker",
  "worker_delivery",
  "worker_limits",
] as const;

const PROVIDER_CHECKS = [
  "application_identity",
  "email_configuration",
  "object_store_configuration",
  "email_confirmation",
  "object_store_access",
  "email_acceptance",
] as const;

const ALERT_CHECKS = [
  "release_identity",
  "application_identity",
  "worker_configuration",
  "target_selection",
  "backlog_policy",
  "canary_confirmation",
  "worker_redis",
  "channel_selection",
  "production_coverage",
  "failure_coverage",
  "channel_configuration",
  "backlog_health",
  "canary_delivery",
] as const;

export interface FlowcordiaOperationalReleaseSummary {
  provider: {
    checkedAt: string;
    emailTransport: "resend" | "smtp" | "aws-ses";
    objectStoreMode: "static_credentials" | "credential_chain";
  };
  alert: {
    checkedAt: string;
    channelType: "EMAIL" | "SLACK" | "WEBHOOK";
    pendingCount: number;
    oldestPendingAgeMs: number | null;
  };
}

export interface FlowcordiaOperationalReleaseTiming {
  provider: { startedAt: string; completedAt: string };
  alert: { startedAt: string; completedAt: string };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactObject(value: unknown, label: string, expectedKeys: readonly string[]) {
  const result = record(value, label);
  const actual = Object.keys(result).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must contain exactly ${expected.join(", ")}.`);
  }
  return result;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label} does not match the exact release.`);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return value;
}

function sha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA.test(value) || /^([0-9a-f])\1{39}$/.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function safeNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return Number(value);
}

function readyChecks(value: unknown, label: string, requiredKeys: readonly string[]): void {
  if (!Array.isArray(value) || value.length !== requiredKeys.length) {
    throw new Error(`${label} must contain exactly ${requiredKeys.length} checks.`);
  }
  const observed = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const check = exactObject(entry, `${label}.${index}`, ["key", "state", "message"]);
    if (typeof check.key !== "string" || !requiredKeys.includes(check.key)) {
      throw new Error(`${label}.${index}.key is invalid.`);
    }
    if (observed.has(check.key)) throw new Error(`${label} contains a duplicated check.`);
    observed.add(check.key);
    exact(check.state, "READY", `${label}.${index}.state`);
    if (
      typeof check.message !== "string" ||
      check.message.length < 1 ||
      check.message.length > 512
    ) {
      throw new Error(`${label}.${index}.message is invalid.`);
    }
  }
  if (requiredKeys.some((key) => !observed.has(key))) {
    throw new Error(`${label} is missing a required check.`);
  }
}

function requireFresh(input: {
  checkedAt: string;
  assembledAt: string;
  label: string;
  maximumAgeMs: number;
}): void {
  const checked = Date.parse(input.checkedAt);
  const assembled = Date.parse(input.assembledAt);
  if (checked > assembled) throw new Error(`${input.label} occurs after manifest assembly.`);
  if (assembled - checked > input.maximumAgeMs) {
    throw new Error(`${input.label} exceeds the operational evidence freshness window.`);
  }
}

function validateProvider(input: {
  evidence: Record<string, unknown>;
  applicationCommitSha: string;
  assembledAt: string;
  maximumAgeMs: number;
}) {
  const evidence = exactObject(input.evidence, "provider", [
    "schemaVersion",
    "state",
    "phase",
    "checkedAt",
    "installation",
    "providers",
    "message",
  ]);
  exact(evidence.schemaVersion, "0.1", "provider.schemaVersion");
  exact(evidence.state, "READY", "provider.state");
  exact(evidence.phase, "provider", "provider.phase");
  const checkedAt = timestamp(evidence.checkedAt, "provider.checkedAt");

  const installation = exactObject(evidence.installation, "provider.installation", [
    "schemaVersion",
    "profile",
    "state",
    "message",
    "checkedAt",
    "checks",
  ]);
  exact(installation.schemaVersion, "0.1", "provider.installation.schemaVersion");
  exact(installation.profile, "release", "provider.installation.profile");
  exact(installation.state, "READY", "provider.installation.state");
  exact(installation.checkedAt, checkedAt, "provider.installation.checkedAt");
  readyChecks(installation.checks, "provider.installation.checks", RELEASE_INSTALLATION_CHECKS);

  const providers = exactObject(evidence.providers, "provider.providers", [
    "schemaVersion",
    "state",
    "phase",
    "checkedAt",
    "applicationCommitSha",
    "emailTransport",
    "objectStoreMode",
    "checks",
    "message",
  ]);
  exact(providers.schemaVersion, "0.1", "provider.providers.schemaVersion");
  exact(providers.state, "READY", "provider.providers.state");
  exact(providers.phase, "complete", "provider.providers.phase");
  exact(providers.checkedAt, checkedAt, "provider.providers.checkedAt");
  exact(
    sha(providers.applicationCommitSha, "provider.providers.applicationCommitSha"),
    input.applicationCommitSha,
    "provider.providers.applicationCommitSha"
  );
  if (!(["resend", "smtp", "aws-ses"] as const).includes(providers.emailTransport as never)) {
    throw new Error("provider.providers.emailTransport is invalid.");
  }
  if (
    !(["static_credentials", "credential_chain"] as const).includes(
      providers.objectStoreMode as never
    )
  ) {
    throw new Error("provider.providers.objectStoreMode is invalid.");
  }
  readyChecks(providers.checks, "provider.providers.checks", PROVIDER_CHECKS);
  requireFresh({
    checkedAt,
    assembledAt: input.assembledAt,
    label: "provider.checkedAt",
    maximumAgeMs: input.maximumAgeMs,
  });
  return {
    checkedAt,
    emailTransport:
      providers.emailTransport as FlowcordiaOperationalReleaseSummary["provider"]["emailTransport"],
    objectStoreMode:
      providers.objectStoreMode as FlowcordiaOperationalReleaseSummary["provider"]["objectStoreMode"],
  };
}

function validateAlert(input: {
  evidence: Record<string, unknown>;
  releaseId: string;
  applicationCommitSha: string;
  assembledAt: string;
  maximumAgeMs: number;
}) {
  const evidence = exactObject(input.evidence, "alert", [
    "schemaVersion",
    "state",
    "phase",
    "releaseId",
    "checkedAt",
    "applicationCommitSha",
    "channelType",
    "backlog",
    "checks",
    "message",
  ]);
  exact(evidence.schemaVersion, "0.1", "alert.schemaVersion");
  exact(evidence.state, "READY", "alert.state");
  exact(evidence.phase, "complete", "alert.phase");
  if (typeof evidence.releaseId !== "string" || !RELEASE_ID.test(evidence.releaseId)) {
    throw new Error("alert.releaseId is invalid.");
  }
  exact(evidence.releaseId, input.releaseId, "alert.releaseId");
  const checkedAt = timestamp(evidence.checkedAt, "alert.checkedAt");
  exact(
    sha(evidence.applicationCommitSha, "alert.applicationCommitSha"),
    input.applicationCommitSha,
    "alert.applicationCommitSha"
  );
  if (!(["EMAIL", "SLACK", "WEBHOOK"] as const).includes(evidence.channelType as never)) {
    throw new Error("alert.channelType is invalid.");
  }
  const backlog = exactObject(evidence.backlog, "alert.backlog", [
    "pendingCount",
    "oldestPendingAgeMs",
  ]);
  const pendingCount = safeNonNegativeInteger(backlog.pendingCount, "alert.backlog.pendingCount");
  const oldestPendingAgeMs =
    backlog.oldestPendingAgeMs === null
      ? null
      : safeNonNegativeInteger(backlog.oldestPendingAgeMs, "alert.backlog.oldestPendingAgeMs");
  readyChecks(evidence.checks, "alert.checks", ALERT_CHECKS);
  requireFresh({
    checkedAt,
    assembledAt: input.assembledAt,
    label: "alert.checkedAt",
    maximumAgeMs: input.maximumAgeMs,
  });
  return {
    checkedAt,
    channelType:
      evidence.channelType as FlowcordiaOperationalReleaseSummary["alert"]["channelType"],
    pendingCount,
    oldestPendingAgeMs,
  };
}

export function validateFlowcordiaOperationalReleaseEvidence(input: {
  providerEvidence: Record<string, unknown>;
  alertEvidence: Record<string, unknown>;
  releaseId: string;
  applicationCommitSha: string;
  assembledAt: string;
  maximumAgeMs?: number;
}): {
  operations: FlowcordiaOperationalReleaseSummary;
  timing: FlowcordiaOperationalReleaseTiming;
} {
  const maximumAgeMs = input.maximumAgeMs ?? FLOWCORDIA_RELEASE_OPERATIONAL_EVIDENCE_MAX_AGE_MS;
  if (
    !Number.isSafeInteger(maximumAgeMs) ||
    maximumAgeMs < 60_000 ||
    maximumAgeMs > 7 * 86_400_000
  ) {
    throw new Error("Operational evidence freshness window is invalid.");
  }
  const applicationCommitSha = sha(input.applicationCommitSha, "applicationCommitSha");
  if (!RELEASE_ID.test(input.releaseId)) throw new Error("releaseId is invalid.");
  timestamp(input.assembledAt, "assembledAt");

  const provider = validateProvider({
    evidence: input.providerEvidence,
    applicationCommitSha,
    assembledAt: input.assembledAt,
    maximumAgeMs,
  });
  const alert = validateAlert({
    evidence: input.alertEvidence,
    releaseId: input.releaseId,
    applicationCommitSha,
    assembledAt: input.assembledAt,
    maximumAgeMs,
  });
  if (Date.parse(provider.checkedAt) > Date.parse(alert.checkedAt)) {
    throw new Error("alert.checkedAt precedes provider.checkedAt.");
  }
  return {
    operations: { provider, alert },
    timing: {
      provider: { startedAt: provider.checkedAt, completedAt: provider.checkedAt },
      alert: { startedAt: alert.checkedAt, completedAt: alert.checkedAt },
    },
  };
}
