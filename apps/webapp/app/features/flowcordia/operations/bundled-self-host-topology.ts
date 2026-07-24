import { isAbsolute } from "node:path";
import { presentFlowcordiaInstallationPreflight } from "./installation-preflight";
import {
  parseFlowcordiaReleaseDistributionManifest,
  type FlowcordiaReleaseDistributionManifest,
} from "./release-distribution";

export const FLOWCORDIA_BUNDLED_SELF_HOST_TOPOLOGY_SCHEMA_VERSION = "0.1" as const;

export type FlowcordiaBundledSelfHostTopologyCheckKey =
  | "release_identity"
  | "installation"
  | "bundled_dependencies"
  | "object_store"
  | "realtime_streaming"
  | "execution_plane"
  | "replicas"
  | "migration_policy";

export interface FlowcordiaBundledSelfHostTopologyCheck {
  key: FlowcordiaBundledSelfHostTopologyCheckKey;
  state: "READY" | "BLOCKED";
  message: string;
}

export interface FlowcordiaBundledSelfHostTopologyProjection {
  schemaVersion: "0.1";
  state: "READY" | "BLOCKED";
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  imageDigest: string;
  checkedAt: string;
  checks: FlowcordiaBundledSelfHostTopologyCheck[];
}

const POSITIVE_INTEGER = /^[1-9][0-9]{0,5}$/;
const BASIN_NAME = /^[a-z0-9][a-z0-9-]{1,62}$/;
const PLACEHOLDER = /change[-_ ]?me|replace[-_ ]?me|example|placeholder|test[-_ ]?secret/i;
const SUPERVISOR_IMAGE = /^ghcr\.io\/triggerdotdev\/supervisor(?::[^\s]+|@sha256:[0-9a-f]{64})$/;

function value(environment: Record<string, string | undefined>, key: string): string {
  return environment[key]?.trim() ?? "";
}

function check(
  key: FlowcordiaBundledSelfHostTopologyCheckKey,
  ready: boolean,
  readyMessage: string,
  blockedMessage: string
): FlowcordiaBundledSelfHostTopologyCheck {
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

function exactEndpoint(candidate: string, expected: string): boolean {
  try {
    return new URL(candidate).toString() === new URL(expected).toString();
  } catch {
    return false;
  }
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

function bundledDependenciesReady(environment: Record<string, string | undefined>): boolean {
  const database = boundedUrl(value(environment, "DATABASE_URL"), ["postgres:", "postgresql:"]);
  const direct = boundedUrl(value(environment, "DIRECT_URL"), ["postgres:", "postgresql:"]);
  const clickhouse = boundedUrl(value(environment, "CLICKHOUSE_URL"), ["http:"]);
  const replication = boundedUrl(value(environment, "RUN_REPLICATION_CLICKHOUSE_URL"), ["http:"]);

  return Boolean(
    value(environment, "FLOWCORDIA_BUNDLED_MODE") === "1" &&
    database?.hostname === "postgres" &&
    database.port === "5432" &&
    database.username &&
    database.pathname === "/flowcordia" &&
    direct?.hostname === "postgres" &&
    direct.port === "5432" &&
    direct.username &&
    direct.pathname === "/flowcordia" &&
    clickhouse?.hostname === "clickhouse" &&
    clickhouse.port === "8123" &&
    replication?.hostname === "clickhouse" &&
    replication.port === "8123" &&
    exactEndpoint(value(environment, "ELECTRIC_ORIGIN"), "http://electric:3000") &&
    value(environment, "REDIS_HOST") === "redis" &&
    value(environment, "REDIS_PORT") === "6379" &&
    value(environment, "REDIS_TLS_DISABLED") === "true" &&
    secret(value(environment, "REDIS_PASSWORD"))
  );
}

function objectStoreReady(environment: Record<string, string | undefined>): boolean {
  const accessKey = value(environment, "OBJECT_STORE_ACCESS_KEY_ID");
  const secretKey = value(environment, "OBJECT_STORE_SECRET_ACCESS_KEY");

  return Boolean(
    exactEndpoint(value(environment, "OBJECT_STORE_BASE_URL"), "http://minio:9000") &&
    value(environment, "OBJECT_STORE_SERVICE") === "s3" &&
    value(environment, "OBJECT_STORE_DEFAULT_PROTOCOL") === "s3" &&
    value(environment, "OBJECT_STORE_FORCE_PATH_STYLE") === "true" &&
    value(environment, "OBJECT_STORE_BUCKET") === "packets" &&
    value(environment, "FLOWCORDIA_OBJECT_STORE_BUCKET") === "packets" &&
    value(environment, "OBJECT_STORE_REGION") === "us-east-1" &&
    secret(accessKey, 12) &&
    secret(secretKey, 24) &&
    exactEndpoint(value(environment, "OBJECT_STORE_S3_BASE_URL"), "http://minio:9000") &&
    value(environment, "OBJECT_STORE_S3_BUCKET") === "packets" &&
    value(environment, "OBJECT_STORE_S3_REGION") === "us-east-1" &&
    value(environment, "OBJECT_STORE_S3_SERVICE") === "s3" &&
    value(environment, "OBJECT_STORE_S3_ACCESS_KEY_ID") === accessKey &&
    value(environment, "OBJECT_STORE_S3_SECRET_ACCESS_KEY") === secretKey
  );
}

function realtimeStreamingReady(environment: Record<string, string | undefined>): boolean {
  return (
    value(environment, "REALTIME_STREAMS_DEFAULT_VERSION") === "v2" &&
    BASIN_NAME.test(value(environment, "REALTIME_STREAMS_S2_BASIN")) &&
    exactEndpoint(value(environment, "REALTIME_STREAMS_S2_ENDPOINT"), "http://s2/v1") &&
    value(environment, "REALTIME_STREAMS_S2_SKIP_ACCESS_TOKENS") === "true"
  );
}

function executionPlaneReady(environment: Record<string, string | undefined>): boolean {
  const registryAuthFile = value(environment, "FLOWCORDIA_REGISTRY_AUTH_FILE");
  const supervisorImage = value(environment, "FLOWCORDIA_SUPERVISOR_IMAGE_REFERENCE");

  return Boolean(
    value(environment, "TRIGGER_BOOTSTRAP_ENABLED") === "1" &&
    value(environment, "TRIGGER_BOOTSTRAP_WORKER_GROUP_NAME") === "bootstrap" &&
    value(environment, "TRIGGER_BOOTSTRAP_WORKER_TOKEN_PATH") ===
      "/home/node/shared/worker_token" &&
    value(environment, "DEPLOY_REGISTRY_HOST") === "localhost:5000" &&
    value(environment, "DEPLOY_REGISTRY_NAMESPACE") === "flowcordia" &&
    value(environment, "DEPLOY_REGISTRY_USERNAME") === "flowcordia" &&
    secret(value(environment, "DEPLOY_REGISTRY_PASSWORD")) &&
    secret(value(environment, "MANAGED_WORKER_SECRET")) &&
    isAbsolute(registryAuthFile) &&
    SUPERVISOR_IMAGE.test(supervisorImage)
  );
}

export function presentFlowcordiaBundledSelfHostTopology(input: {
  environment: Record<string, string | undefined>;
  releaseManifest: unknown;
  checkedAt: Date;
  nodeVersion: string;
}): FlowcordiaBundledSelfHostTopologyProjection {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new TypeError("Flowcordia bundled self-host topology check time is invalid.");
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

  const checks: FlowcordiaBundledSelfHostTopologyCheck[] = [
    check(
      "release_identity",
      releaseIdentityReady(input.environment, manifest),
      "Image, application, and manifest identities match one immutable release.",
      "Image, application, or manifest identity does not match the selected release."
    ),
    check(
      "installation",
      installation.state === "READY",
      "Bundled release configuration passes the existing web and operations preflight.",
      "Bundled release configuration is blocked by the existing installation preflight."
    ),
    check(
      "bundled_dependencies",
      bundledDependenciesReady(input.environment),
      "PostgreSQL, Redis, ClickHouse, and Electric use the exact private Compose identities.",
      "A bundled PostgreSQL, Redis, ClickHouse, or Electric connection is missing or unsafe."
    ),
    check(
      "object_store",
      objectStoreReady(input.environment),
      "MinIO serves the canonical packets bucket through matching legacy and named S3 providers.",
      "The bundled MinIO bucket, legacy provider, or named S3 provider is incomplete or inconsistent."
    ),
    check(
      "realtime_streaming",
      realtimeStreamingReady(input.environment),
      "S2 realtime streams v2 use the exact private basin endpoint.",
      "The bundled S2 realtime-stream configuration is missing or unsafe."
    ),
    check(
      "execution_plane",
      executionPlaneReady(input.environment),
      "The registry bootstrap and Trigger.dev supervisor connection are explicitly configured.",
      "The bundled registry, worker bootstrap, or supervisor connection is incomplete."
    ),
    check(
      "replicas",
      webReplicas === 1 && operationsReplicas === 1,
      "The supported bundled topology uses exactly one web and one operations replica.",
      "The bundled single-host topology supports exactly one web and one operations replica."
    ),
    check(
      "migration_policy",
      value(input.environment, "FLOWCORDIA_MIGRATION_CONFIRM") === manifest.releaseId &&
        value(input.environment, "SKIP_POSTGRES_MIGRATIONS") === "1" &&
        value(input.environment, "SKIP_DASHBOARD_AGENT_MIGRATIONS") === "1" &&
        value(input.environment, "SKIP_CLICKHOUSE_MIGRATIONS") === "1",
      "The release-confirmed migration job remains the only migration owner.",
      "Migration confirmation is stale or an application replica can execute migrations."
    ),
  ];
  const state = checks.some((candidate) => candidate.state === "BLOCKED") ? "BLOCKED" : "READY";

  return {
    schemaVersion: FLOWCORDIA_BUNDLED_SELF_HOST_TOPOLOGY_SCHEMA_VERSION,
    state,
    releaseId: manifest.releaseId,
    version: manifest.version,
    applicationCommitSha: manifest.applicationCommitSha,
    imageDigest: manifest.image.digest,
    checkedAt: input.checkedAt.toISOString(),
    checks,
  };
}
