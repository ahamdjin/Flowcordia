import { presentFlowcordiaInstallationPreflight } from "./installation-preflight";
import {
  parseFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseDistributionManifest,
} from "./release-distribution";

export const FLOWCORDIA_SELF_HOST_TOPOLOGY_SCHEMA_VERSION = "0.1" as const;

export type FlowcordiaSelfHostTopologyCheckKey =
  | "release_identity"
  | "installation"
  | "dependencies"
  | "object_store"
  | "email"
  | "replicas"
  | "migration_policy";

export interface FlowcordiaSelfHostTopologyCheck {
  key: FlowcordiaSelfHostTopologyCheckKey;
  state: "READY" | "BLOCKED";
  message: string;
}

export interface FlowcordiaSelfHostTopologyProjection {
  schemaVersion: "0.1";
  state: "READY" | "BLOCKED";
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  imageDigest: string;
  checkedAt: string;
  checks: FlowcordiaSelfHostTopologyCheck[];
}

const POSITIVE_INTEGER = /^[1-9][0-9]{0,5}$/;
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PLACEHOLDER = /change[-_ ]?me|replace[-_ ]?me|example|placeholder|test[-_ ]?secret/i;

function value(environment: Record<string, string | undefined>, key: string): string {
  return environment[key]?.trim() ?? "";
}

function check(
  key: FlowcordiaSelfHostTopologyCheckKey,
  ready: boolean,
  readyMessage: string,
  blockedMessage: string
): FlowcordiaSelfHostTopologyCheck {
  return {
    key,
    state: ready ? "READY" : "BLOCKED",
    message: ready ? readyMessage : blockedMessage,
  };
}

function integer(
  environment: Record<string, string | undefined>,
  key: string,
  minimum: number,
  maximum: number
): number | null {
  const raw = value(environment, key);
  if (!POSITIVE_INTEGER.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function boundedUrl(candidate: string, protocols: readonly string[]): URL | null {
  try {
    const parsed = new URL(candidate);
    return protocols.includes(parsed.protocol) && parsed.hostname && !parsed.hash ? parsed : null;
  } catch {
    return null;
  }
}

function secret(candidate: string, minimumLength = 24): boolean {
  return candidate.length >= minimumLength && !PLACEHOLDER.test(candidate);
}

function releaseIdentityReady(
  environment: Record<string, string | undefined>,
  manifest: FlowcordiaReleaseDistributionManifest
): boolean {
  return (
    value(environment, "FLOWCORDIA_IMAGE_REFERENCE") === manifest.image.reference &&
    value(environment, "FLOWCORDIA_IMAGE_DIGEST") === manifest.image.digest &&
    value(environment, "FLOWCORDIA_APPLICATION_COMMIT_SHA") === manifest.applicationCommitSha &&
    value(environment, "FLOWCORDIA_RELEASE_MANIFEST_SHA256") === manifest.manifestSha256 &&
    value(environment, "FLOWCORDIA_RELEASE_RUNTIME_REQUIRED") === "1"
  );
}

function dependenciesReady(environment: Record<string, string | undefined>): boolean {
  const database = boundedUrl(value(environment, "DATABASE_URL"), ["postgres:", "postgresql:"]);
  const direct = boundedUrl(value(environment, "DIRECT_URL"), ["postgres:", "postgresql:"]);
  const clickhouse = boundedUrl(value(environment, "CLICKHOUSE_URL"), ["http:", "https:"]);
  const replication = boundedUrl(value(environment, "RUN_REPLICATION_CLICKHOUSE_URL"), [
    "http:",
    "https:",
  ]);
  const electric = boundedUrl(value(environment, "ELECTRIC_ORIGIN"), ["http:", "https:"]);
  const redisHost = value(environment, "REDIS_HOST");
  const redisPort = integer(environment, "REDIS_PORT", 1, 65_535);

  return Boolean(
    database?.username &&
    database.pathname.length > 1 &&
    direct?.username &&
    direct.pathname.length > 1 &&
    clickhouse &&
    replication &&
    electric &&
    HOSTNAME.test(redisHost) &&
    redisPort
  );
}

function objectStoreReady(environment: Record<string, string | undefined>): boolean {
  const endpoint = boundedUrl(value(environment, "OBJECT_STORE_BASE_URL"), ["https:"]);
  return Boolean(
    endpoint &&
    value(environment, "OBJECT_STORE_SERVICE") === "s3" &&
    value(environment, "OBJECT_STORE_BUCKET").length >= 3 &&
    value(environment, "OBJECT_STORE_REGION") &&
    secret(value(environment, "OBJECT_STORE_ACCESS_KEY_ID"), 12) &&
    secret(value(environment, "OBJECT_STORE_SECRET_ACCESS_KEY"), 24)
  );
}

function emailReady(environment: Record<string, string | undefined>): boolean {
  const transport = value(environment, "EMAIL_TRANSPORT");
  const common =
    value(environment, "FROM_EMAIL").includes("@") &&
    value(environment, "REPLY_TO_EMAIL").includes("@");
  if (!common) return false;
  if (transport === "resend") return secret(value(environment, "RESEND_API_KEY"), 20);
  if (transport === "smtp") {
    return Boolean(
      HOSTNAME.test(value(environment, "SMTP_HOST")) &&
      integer(environment, "SMTP_PORT", 1, 65_535) &&
      value(environment, "SMTP_USER") &&
      secret(value(environment, "SMTP_PASSWORD"), 12)
    );
  }
  return transport === "aws-ses";
}

export function presentFlowcordiaSelfHostTopology(input: {
  environment: Record<string, string | undefined>;
  releaseManifest: unknown;
  checkedAt: Date;
  nodeVersion: string;
}): FlowcordiaSelfHostTopologyProjection {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new TypeError("Flowcordia self-host topology check time is invalid.");
  }

  const manifest = parseFlowcordiaReleaseDistributionManifest(input.releaseManifest);
  const installation = presentFlowcordiaInstallationPreflight({
    environment: {
      ...input.environment,
      FLOWCORDIA_PROPOSAL_WORKER_ENABLED: "1",
    },
    profile: "release",
    nodeVersion: input.nodeVersion,
    checkedAt: input.checkedAt,
  });
  const webReplicas = integer(input.environment, "FLOWCORDIA_WEB_REPLICAS", 1, 8);
  const operationsReplicas = integer(input.environment, "FLOWCORDIA_OPERATIONS_REPLICAS", 1, 4);

  const checks: FlowcordiaSelfHostTopologyCheck[] = [
    check(
      "release_identity",
      releaseIdentityReady(input.environment, manifest),
      "Image, application, and manifest identities match one immutable release.",
      "Image, application, or manifest identity does not match the selected release."
    ),
    check(
      "installation",
      installation.state === "READY",
      "Release installation configuration passes the deterministic web and worker preflight.",
      "Release installation configuration is blocked by the deterministic preflight."
    ),
    check(
      "dependencies",
      dependenciesReady(input.environment),
      "PostgreSQL, Redis, ClickHouse, replication, and Electric dependency configuration is bounded.",
      "One or more required PostgreSQL, Redis, ClickHouse, replication, or Electric dependencies are invalid."
    ),
    check(
      "object_store",
      objectStoreReady(input.environment),
      "The S3-compatible object-store configuration uses HTTPS and non-placeholder credentials.",
      "The required HTTPS S3-compatible object-store configuration is incomplete or unsafe."
    ),
    check(
      "email",
      emailReady(input.environment),
      "A production email transport is configured with bounded provider settings.",
      "A supported production email transport is not fully configured."
    ),
    check(
      "replicas",
      webReplicas === 1 && operationsReplicas === 1,
      "The supported single-host topology uses exactly one web and one operations replica.",
      "The initial Docker Compose topology supports exactly one web and one operations replica."
    ),
    check(
      "migration_policy",
      value(input.environment, "FLOWCORDIA_MIGRATION_CONFIRM") === manifest.releaseId &&
        value(input.environment, "SKIP_POSTGRES_MIGRATIONS") === "1" &&
        value(input.environment, "SKIP_DASHBOARD_AGENT_MIGRATIONS") === "1" &&
        value(input.environment, "SKIP_CLICKHOUSE_MIGRATIONS") === "1",
      "The one-shot migration job is release-confirmed and application replicas cannot race migrations.",
      "Migration confirmation is stale or application replica migration skips are not enforced."
    ),
  ];
  const state = checks.some((candidate) => candidate.state === "BLOCKED") ? "BLOCKED" : "READY";

  return {
    schemaVersion: FLOWCORDIA_SELF_HOST_TOPOLOGY_SCHEMA_VERSION,
    state,
    releaseId: manifest.releaseId,
    version: manifest.version,
    applicationCommitSha: manifest.applicationCommitSha,
    imageDigest: manifest.image.digest,
    checkedAt: input.checkedAt.toISOString(),
    checks,
  };
}
