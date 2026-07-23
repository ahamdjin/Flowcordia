import { flowcordiaRecoverySha256 } from "./database-recovery";
import {
  parseFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseDistributionManifest,
} from "./release-distribution";

export const FLOWCORDIA_SELF_HOST_INSTALLATION_IDENTITY_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCIES_SCHEMA_VERSION = "0.1" as const;

export interface FlowcordiaSelfHostInstallationIdentityEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-self-host-installation-identity";
  state: "READY";
  currentReleaseId: string;
  targetReleaseId: string;
  currentApplicationCommitSha: string;
  targetApplicationCommitSha: string;
  installationSha256: string;
  checkedAt: string;
  evidenceSha256: string;
}

export const FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCY_KEYS = [
  "primary_postgresql",
  "dashboard_agent_postgresql",
  "clickhouse",
] as const;

export type FlowcordiaSelfHostCleanDependencyKey =
  (typeof FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCY_KEYS)[number];

export interface FlowcordiaSelfHostCleanDependenciesEvidence {
  schemaVersion: "0.1";
  kind: "flowcordia-self-host-clean-dependencies";
  state: "READY";
  releaseId: string;
  applicationCommitSha: string;
  manifestSha256: string;
  checkedAt: string;
  checks: Array<{ key: FlowcordiaSelfHostCleanDependencyKey; state: "READY" }>;
  evidenceSha256: string;
}

const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OPTIONAL_VALUE_KEYS = new Set(["REDIS_USERNAME", "OBJECT_STORE_FORCE_PATH_STYLE"]);
const STABLE_VALUE_KEYS = [
  "APP_ENV",
  "NODE_ENV",
  "APP_ORIGIN",
  "LOGIN_ORIGIN",
  "DATABASE_HOST",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_USERNAME",
  "REDIS_TLS_DISABLED",
  "ELECTRIC_ORIGIN",
  "RUN_REPLICATION_ENABLED",
  "EVENT_REPOSITORY_DEFAULT_STORE",
  "OBJECT_STORE_BASE_URL",
  "OBJECT_STORE_BUCKET",
  "OBJECT_STORE_REGION",
  "OBJECT_STORE_SERVICE",
  "OBJECT_STORE_DEFAULT_PROTOCOL",
  "OBJECT_STORE_FORCE_PATH_STYLE",
  "EMAIL_TRANSPORT",
  "FROM_EMAIL",
  "REPLY_TO_EMAIL",
  "GITHUB_APP_ENABLED",
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "FLOWCORDIA_PROPOSAL_EVENT_URL",
] as const;
const STABLE_SECRET_KEYS = [
  "SESSION_SECRET",
  "MAGIC_LINK_SECRET",
  "ENCRYPTION_KEY",
  "FLOWCORDIA_PROPOSAL_EVENT_SECRET",
] as const;

export class FlowcordiaSelfHostLifecyclePreflightError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaSelfHostLifecyclePreflightError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowcordiaSelfHostLifecyclePreflightError("invalid_object", `${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "unexpected_fields",
      `${label} has unexpected fields.`
    );
  }
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new FlowcordiaSelfHostLifecyclePreflightError("invalid_time", `${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new FlowcordiaSelfHostLifecyclePreflightError("invalid_time", `${label} is invalid.`);
  }
  return value;
}

function required(environment: Record<string, string | undefined>, key: string): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "missing_installation_value",
      "Lifecycle installation identity is incomplete."
    );
  }
  return value;
}

function optional(environment: Record<string, string | undefined>, key: string): string {
  return environment[key]?.trim() ?? "";
}

function connectionIdentity(value: string): string {
  try {
    const url = new URL(value);
    if (!url.hostname || !["postgres:", "postgresql:", "http:", "https:"].includes(url.protocol)) {
      throw new TypeError();
    }
    const schema = url.searchParams.get("schema") ?? "";
    return JSON.stringify({
      protocol: url.protocol,
      hostname: url.hostname.toLowerCase(),
      port: url.port,
      pathname: url.pathname,
      schema,
    });
  } catch {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "invalid_connection_identity",
      "Lifecycle connection identity is invalid."
    );
  }
}

function assertReleaseEnvironment(
  environment: Record<string, string | undefined>,
  manifest: FlowcordiaReleaseDistributionManifest
): void {
  if (
    required(environment, "FLOWCORDIA_IMAGE_REFERENCE") !== manifest.image.reference ||
    required(environment, "FLOWCORDIA_IMAGE_DIGEST") !== manifest.image.digest ||
    required(environment, "FLOWCORDIA_APPLICATION_COMMIT_SHA") !== manifest.applicationCommitSha ||
    required(environment, "FLOWCORDIA_RELEASE_MANIFEST_SHA256") !== manifest.manifestSha256 ||
    required(environment, "FLOWCORDIA_MIGRATION_CONFIRM") !== manifest.releaseId
  ) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "release_environment_mismatch",
      "Lifecycle release environment does not match its canonical manifest."
    );
  }
}

function installationProjection(environment: Record<string, string | undefined>): unknown {
  return {
    values: Object.fromEntries(
      STABLE_VALUE_KEYS.map((key) => [
        key,
        OPTIONAL_VALUE_KEYS.has(key) ? optional(environment, key) : required(environment, key),
      ])
    ),
    connections: {
      primaryPostgresql: connectionIdentity(required(environment, "DATABASE_URL")),
      directPostgresql: connectionIdentity(required(environment, "DIRECT_URL")),
      dashboardAgentPostgresql: connectionIdentity(
        optional(environment, "DASHBOARD_AGENT_DIRECT_URL") ||
          optional(environment, "DASHBOARD_AGENT_DATABASE_URL") ||
          required(environment, "DIRECT_URL")
      ),
      clickhouse: connectionIdentity(required(environment, "CLICKHOUSE_URL")),
      replicationClickhouse: connectionIdentity(
        required(environment, "RUN_REPLICATION_CLICKHOUSE_URL")
      ),
    },
    stableSecretDigests: Object.fromEntries(
      STABLE_SECRET_KEYS.map((key) => [key, flowcordiaRecoverySha256(required(environment, key))])
    ),
  };
}

function installationWithoutDigest(
  evidence:
    | FlowcordiaSelfHostInstallationIdentityEvidence
    | Omit<FlowcordiaSelfHostInstallationIdentityEvidence, "evidenceSha256">
): Omit<FlowcordiaSelfHostInstallationIdentityEvidence, "evidenceSha256"> {
  return {
    schemaVersion: evidence.schemaVersion,
    kind: evidence.kind,
    state: evidence.state,
    currentReleaseId: evidence.currentReleaseId,
    targetReleaseId: evidence.targetReleaseId,
    currentApplicationCommitSha: evidence.currentApplicationCommitSha,
    targetApplicationCommitSha: evidence.targetApplicationCommitSha,
    installationSha256: evidence.installationSha256,
    checkedAt: evidence.checkedAt,
  };
}

export function createFlowcordiaSelfHostInstallationIdentityEvidence(input: {
  currentManifest: unknown;
  targetManifest: unknown;
  currentEnvironment: Record<string, string | undefined>;
  targetEnvironment: Record<string, string | undefined>;
  checkedAt: Date;
}): FlowcordiaSelfHostInstallationIdentityEvidence {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "invalid_time",
      "Lifecycle installation check time is invalid."
    );
  }
  const current = parseFlowcordiaReleaseDistributionManifest(input.currentManifest);
  const target = parseFlowcordiaReleaseDistributionManifest(input.targetManifest);
  if (
    current.releaseId === target.releaseId ||
    current.applicationCommitSha === target.applicationCommitSha ||
    current.image.digest === target.image.digest
  ) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "mixed_release",
      "Lifecycle releases must be exact and distinct."
    );
  }
  assertReleaseEnvironment(input.currentEnvironment, current);
  assertReleaseEnvironment(input.targetEnvironment, target);
  const currentProjection = installationProjection(input.currentEnvironment);
  const targetProjection = installationProjection(input.targetEnvironment);
  const currentDigest = flowcordiaRecoverySha256(currentProjection);
  const targetDigest = flowcordiaRecoverySha256(targetProjection);
  if (currentDigest !== targetDigest) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "installation_mismatch",
      "Current and target releases do not describe the same installation."
    );
  }
  const withoutDigest: Omit<FlowcordiaSelfHostInstallationIdentityEvidence, "evidenceSha256"> = {
    schemaVersion: FLOWCORDIA_SELF_HOST_INSTALLATION_IDENTITY_SCHEMA_VERSION,
    kind: "flowcordia-self-host-installation-identity",
    state: "READY",
    currentReleaseId: current.releaseId,
    targetReleaseId: target.releaseId,
    currentApplicationCommitSha: current.applicationCommitSha,
    targetApplicationCommitSha: target.applicationCommitSha,
    installationSha256: currentDigest,
    checkedAt: input.checkedAt.toISOString(),
  };
  return { ...withoutDigest, evidenceSha256: flowcordiaRecoverySha256(withoutDigest) };
}

export function parseFlowcordiaSelfHostInstallationIdentityEvidence(
  value: unknown,
  currentManifestValue?: unknown,
  targetManifestValue?: unknown
): FlowcordiaSelfHostInstallationIdentityEvidence {
  const evidence = record(value, "Lifecycle installation identity evidence");
  exactKeys(
    evidence,
    [
      "checkedAt",
      "currentApplicationCommitSha",
      "currentReleaseId",
      "evidenceSha256",
      "installationSha256",
      "kind",
      "schemaVersion",
      "state",
      "targetApplicationCommitSha",
      "targetReleaseId",
    ],
    "Lifecycle installation identity evidence"
  );
  if (
    evidence.schemaVersion !== FLOWCORDIA_SELF_HOST_INSTALLATION_IDENTITY_SCHEMA_VERSION ||
    evidence.kind !== "flowcordia-self-host-installation-identity" ||
    evidence.state !== "READY" ||
    typeof evidence.currentReleaseId !== "string" ||
    !RELEASE_ID.test(evidence.currentReleaseId) ||
    typeof evidence.targetReleaseId !== "string" ||
    !RELEASE_ID.test(evidence.targetReleaseId) ||
    evidence.currentReleaseId === evidence.targetReleaseId ||
    typeof evidence.currentApplicationCommitSha !== "string" ||
    !SHA.test(evidence.currentApplicationCommitSha) ||
    /^([0-9a-f])\1{39}$/.test(evidence.currentApplicationCommitSha) ||
    typeof evidence.targetApplicationCommitSha !== "string" ||
    !SHA.test(evidence.targetApplicationCommitSha) ||
    /^([0-9a-f])\1{39}$/.test(evidence.targetApplicationCommitSha) ||
    evidence.currentApplicationCommitSha === evidence.targetApplicationCommitSha ||
    !SHA256.test(String(evidence.installationSha256)) ||
    !SHA256.test(String(evidence.evidenceSha256))
  ) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "invalid_installation_evidence",
      "Lifecycle installation identity evidence is invalid."
    );
  }
  const parsed: FlowcordiaSelfHostInstallationIdentityEvidence = {
    schemaVersion: "0.1",
    kind: "flowcordia-self-host-installation-identity",
    state: "READY",
    currentReleaseId: evidence.currentReleaseId,
    targetReleaseId: evidence.targetReleaseId,
    currentApplicationCommitSha: evidence.currentApplicationCommitSha,
    targetApplicationCommitSha: evidence.targetApplicationCommitSha,
    installationSha256: String(evidence.installationSha256),
    checkedAt: timestamp(evidence.checkedAt, "Lifecycle installation check time"),
    evidenceSha256: String(evidence.evidenceSha256),
  };
  if (flowcordiaRecoverySha256(installationWithoutDigest(parsed)) !== parsed.evidenceSha256) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "invalid_installation_digest",
      "Lifecycle installation identity evidence digest is invalid."
    );
  }
  if (currentManifestValue !== undefined && targetManifestValue !== undefined) {
    const current = parseFlowcordiaReleaseDistributionManifest(currentManifestValue);
    const target = parseFlowcordiaReleaseDistributionManifest(targetManifestValue);
    if (
      parsed.currentReleaseId !== current.releaseId ||
      parsed.targetReleaseId !== target.releaseId ||
      parsed.currentApplicationCommitSha !== current.applicationCommitSha ||
      parsed.targetApplicationCommitSha !== target.applicationCommitSha
    ) {
      throw new FlowcordiaSelfHostLifecyclePreflightError(
        "installation_release_mismatch",
        "Lifecycle installation identity evidence does not match the selected releases."
      );
    }
  }
  return parsed;
}

function cleanWithoutDigest(
  evidence:
    | FlowcordiaSelfHostCleanDependenciesEvidence
    | Omit<FlowcordiaSelfHostCleanDependenciesEvidence, "evidenceSha256">
): Omit<FlowcordiaSelfHostCleanDependenciesEvidence, "evidenceSha256"> {
  return {
    schemaVersion: evidence.schemaVersion,
    kind: evidence.kind,
    state: evidence.state,
    releaseId: evidence.releaseId,
    applicationCommitSha: evidence.applicationCommitSha,
    manifestSha256: evidence.manifestSha256,
    checkedAt: evidence.checkedAt,
    checks: evidence.checks,
  };
}

export function createFlowcordiaSelfHostCleanDependenciesEvidence(input: {
  releaseManifest: unknown;
  checkedAt: Date;
  observations: Record<FlowcordiaSelfHostCleanDependencyKey, "READY" | "BLOCKED">;
}): FlowcordiaSelfHostCleanDependenciesEvidence {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "invalid_time",
      "Clean dependency check time is invalid."
    );
  }
  const manifest = parseFlowcordiaReleaseDistributionManifest(input.releaseManifest);
  const checks = FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCY_KEYS.map((key) => ({
    key,
    state: input.observations[key],
  }));
  if (checks.some((check) => check.state !== "READY")) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "dependency_not_clean",
      "Lifecycle dependency history is not empty."
    );
  }
  const withoutDigest: Omit<FlowcordiaSelfHostCleanDependenciesEvidence, "evidenceSha256"> = {
    schemaVersion: FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCIES_SCHEMA_VERSION,
    kind: "flowcordia-self-host-clean-dependencies",
    state: "READY",
    releaseId: manifest.releaseId,
    applicationCommitSha: manifest.applicationCommitSha,
    manifestSha256: manifest.manifestSha256,
    checkedAt: input.checkedAt.toISOString(),
    checks: checks.map((check) => ({ key: check.key, state: "READY" as const })),
  };
  return { ...withoutDigest, evidenceSha256: flowcordiaRecoverySha256(withoutDigest) };
}

export function parseFlowcordiaSelfHostCleanDependenciesEvidence(
  value: unknown,
  releaseManifestValue?: unknown
): FlowcordiaSelfHostCleanDependenciesEvidence {
  const evidence = record(value, "Clean dependency evidence");
  exactKeys(
    evidence,
    [
      "applicationCommitSha",
      "checkedAt",
      "checks",
      "evidenceSha256",
      "kind",
      "manifestSha256",
      "releaseId",
      "schemaVersion",
      "state",
    ],
    "Clean dependency evidence"
  );
  if (
    evidence.schemaVersion !== FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCIES_SCHEMA_VERSION ||
    evidence.kind !== "flowcordia-self-host-clean-dependencies" ||
    evidence.state !== "READY" ||
    typeof evidence.releaseId !== "string" ||
    !RELEASE_ID.test(evidence.releaseId) ||
    typeof evidence.applicationCommitSha !== "string" ||
    !SHA.test(evidence.applicationCommitSha) ||
    /^([0-9a-f])\1{39}$/.test(evidence.applicationCommitSha) ||
    !SHA256.test(String(evidence.manifestSha256)) ||
    !SHA256.test(String(evidence.evidenceSha256)) ||
    !Array.isArray(evidence.checks) ||
    evidence.checks.length !== FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCY_KEYS.length
  ) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "invalid_clean_evidence",
      "Clean dependency evidence is invalid."
    );
  }
  const checks = evidence.checks.map((candidate, index) => {
    const check = record(candidate, `Clean dependency check ${index}`);
    exactKeys(check, ["key", "state"], `Clean dependency check ${index}`);
    if (
      check.key !== FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCY_KEYS[index] ||
      check.state !== "READY"
    ) {
      throw new FlowcordiaSelfHostLifecyclePreflightError(
        "invalid_clean_checks",
        "Clean dependency checks are incomplete or unordered."
      );
    }
    return { key: FLOWCORDIA_SELF_HOST_CLEAN_DEPENDENCY_KEYS[index]!, state: "READY" as const };
  });
  const parsed: FlowcordiaSelfHostCleanDependenciesEvidence = {
    schemaVersion: "0.1",
    kind: "flowcordia-self-host-clean-dependencies",
    state: "READY",
    releaseId: evidence.releaseId,
    applicationCommitSha: evidence.applicationCommitSha,
    manifestSha256: String(evidence.manifestSha256),
    checkedAt: timestamp(evidence.checkedAt, "Clean dependency check time"),
    checks,
    evidenceSha256: String(evidence.evidenceSha256),
  };
  if (flowcordiaRecoverySha256(cleanWithoutDigest(parsed)) !== parsed.evidenceSha256) {
    throw new FlowcordiaSelfHostLifecyclePreflightError(
      "invalid_clean_digest",
      "Clean dependency evidence digest is invalid."
    );
  }
  if (releaseManifestValue !== undefined) {
    const manifest = parseFlowcordiaReleaseDistributionManifest(releaseManifestValue);
    if (
      parsed.releaseId !== manifest.releaseId ||
      parsed.applicationCommitSha !== manifest.applicationCommitSha ||
      parsed.manifestSha256 !== manifest.manifestSha256
    ) {
      throw new FlowcordiaSelfHostLifecyclePreflightError(
        "clean_release_mismatch",
        "Clean dependency evidence does not match the current release."
      );
    }
  }
  return parsed;
}
