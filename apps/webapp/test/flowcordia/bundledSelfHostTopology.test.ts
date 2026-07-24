import { describe, expect, it } from "vitest";
import { presentFlowcordiaBundledSelfHostTopology } from "../../app/features/flowcordia/operations/bundled-self-host-topology";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const UPSTREAM_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const IMAGE_DIGEST = "a".repeat(64);
const IMAGE_REFERENCE = `ghcr.io/ahamdjin/flowcordia@sha256:${IMAGE_DIGEST}`;

function manifest() {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: UPSTREAM_SHA,
    createdAt: new Date("2026-07-24T20:00:00.000Z"),
    imageReference: IMAGE_REFERENCE,
    migrations: [{ name: "20260101000000_initial", checksum: "b".repeat(64) }],
  });
}

function environment(overrides: Record<string, string> = {}): Record<string, string> {
  const release = manifest();
  return {
    APP_ENV: "production",
    NODE_ENV: "production",
    APP_ORIGIN: "https://flowcordia.example.com",
    LOGIN_ORIGIN: "https://flowcordia.example.com",
    SESSION_SECRET: "S2F3qW4eR5tY6uI7oP8aS9dF0gH1jK2l",
    MAGIC_LINK_SECRET: "M3nB4vC5xZ6aS7dF8gH9jK0lQ1wE2rT3",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    DATABASE_URL:
      "postgresql://flowcordia:strong-database-password@postgres:5432/flowcordia?schema=public&sslmode=disable",
    DIRECT_URL:
      "postgresql://flowcordia:strong-database-password@postgres:5432/flowcordia?schema=public&sslmode=disable",
    FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
    GITHUB_APP_ENABLED: "1",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_SLUG: "flowcordia-example",
    GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${"a".repeat(160)}\n-----END PRIVATE KEY-----`,
    GITHUB_APP_WEBHOOK_SECRET: "W8xY7zA6bC5dE4fG3hI2jK1lM0nP9qR8",
    FLOWCORDIA_STUDIO_ENABLED: "0",
    FLOWCORDIA_PROPOSAL_EVENT_URL: "https://flowcordia.example.com/api/flowcordia/proposal-events",
    FLOWCORDIA_PROPOSAL_EVENT_SECRET: "P9oI8uY7tR6eW5qA4sD3fG2hJ1kL0mN9",
    FLOWCORDIA_BUNDLED_MODE: "1",
    CLICKHOUSE_URL:
      "http://default:strong-clickhouse-password@clickhouse:8123/default?secure=false",
    RUN_REPLICATION_CLICKHOUSE_URL:
      "http://default:strong-clickhouse-password@clickhouse:8123/default",
    ELECTRIC_ORIGIN: "http://electric:3000",
    REDIS_HOST: "redis",
    REDIS_PORT: "6379",
    REDIS_TLS_DISABLED: "true",
    REDIS_PASSWORD: "strong-redis-password-123456",
    OBJECT_STORE_BASE_URL: "http://minio:9000",
    OBJECT_STORE_SERVICE: "s3",
    OBJECT_STORE_DEFAULT_PROTOCOL: "s3",
    OBJECT_STORE_FORCE_PATH_STYLE: "true",
    OBJECT_STORE_BUCKET: "packets",
    FLOWCORDIA_OBJECT_STORE_BUCKET: "packets",
    OBJECT_STORE_REGION: "us-east-1",
    OBJECT_STORE_ACCESS_KEY_ID: "flowcordia-access-key",
    OBJECT_STORE_SECRET_ACCESS_KEY: "flowcordia-secret-access-key-123456",
    OBJECT_STORE_S3_BASE_URL: "http://minio:9000",
    OBJECT_STORE_S3_BUCKET: "packets",
    OBJECT_STORE_S3_REGION: "us-east-1",
    OBJECT_STORE_S3_SERVICE: "s3",
    OBJECT_STORE_S3_ACCESS_KEY_ID: "flowcordia-access-key",
    OBJECT_STORE_S3_SECRET_ACCESS_KEY: "flowcordia-secret-access-key-123456",
    REALTIME_STREAMS_DEFAULT_VERSION: "v2",
    REALTIME_STREAMS_S2_BASIN: "flowcordia-realtime",
    REALTIME_STREAMS_S2_ENDPOINT: "http://s2/v1",
    REALTIME_STREAMS_S2_SKIP_ACCESS_TOKENS: "true",
    DEPLOY_REGISTRY_HOST: "localhost:5000",
    DEPLOY_REGISTRY_NAMESPACE: "flowcordia",
    DEPLOY_REGISTRY_USERNAME: "flowcordia",
    DEPLOY_REGISTRY_PASSWORD: "strong-registry-password-123456",
    FLOWCORDIA_REGISTRY_AUTH_FILE: "/opt/flowcordia/registry.htpasswd",
    FLOWCORDIA_SUPERVISOR_IMAGE_REFERENCE: "ghcr.io/triggerdotdev/supervisor:v4-beta",
    TRIGGER_BOOTSTRAP_ENABLED: "1",
    TRIGGER_BOOTSTRAP_WORKER_GROUP_NAME: "bootstrap",
    TRIGGER_BOOTSTRAP_WORKER_TOKEN_PATH: "/home/node/shared/worker_token",
    MANAGED_WORKER_SECRET: "strong-managed-worker-secret-123456",
    EMAIL_TRANSPORT: "resend",
    FROM_EMAIL: "no-reply@flowcordia.example",
    REPLY_TO_EMAIL: "support@flowcordia.example",
    RESEND_API_KEY: "re_8Jk2Lm6Np0Qr4St8Uv1Wx5Yz",
    FLOWCORDIA_IMAGE_REFERENCE: IMAGE_REFERENCE,
    FLOWCORDIA_IMAGE_DIGEST: IMAGE_DIGEST,
    FLOWCORDIA_RELEASE_MANIFEST_SHA256: release.manifestSha256,
    FLOWCORDIA_RELEASE_RUNTIME_REQUIRED: "1",
    FLOWCORDIA_MIGRATION_CONFIRM: release.releaseId,
    SKIP_POSTGRES_MIGRATIONS: "1",
    SKIP_DASHBOARD_AGENT_MIGRATIONS: "1",
    SKIP_CLICKHOUSE_MIGRATIONS: "1",
    FLOWCORDIA_WEB_REPLICAS: "1",
    FLOWCORDIA_OPERATIONS_REPLICAS: "1",
    ...overrides,
  };
}

function projection(overrides: Record<string, string> = {}) {
  return presentFlowcordiaBundledSelfHostTopology({
    environment: environment(overrides),
    releaseManifest: manifest(),
    checkedAt: new Date("2026-07-24T20:30:00.000Z"),
    nodeVersion: "20.20.2",
  });
}

describe("Flowcordia bundled self-host topology", () => {
  it("accepts the exact private single-host bundle", () => {
    const result = projection();

    expect(result).toMatchObject({
      schemaVersion: "0.1",
      state: "READY",
      releaseId: "flowcordia-0.1.0-rc.1",
      applicationCommitSha: APPLICATION_SHA,
      imageDigest: IMAGE_DIGEST,
    });
    expect(result.checks).toHaveLength(8);
    expect(result.checks.every((candidate) => candidate.state === "READY")).toBe(true);
  });

  it("blocks dependency redirection away from private Compose identities", () => {
    expect(
      projection({
        DATABASE_URL:
          "postgresql://flowcordia:strong-database-password@external.example:5432/flowcordia",
      }).state
    ).toBe("BLOCKED");
    expect(projection({ REDIS_HOST: "external-redis.example" }).state).toBe("BLOCKED");
    expect(projection({ ELECTRIC_ORIGIN: "https://electric.example" }).state).toBe("BLOCKED");
    expect(projection({ CLICKHOUSE_URL: "https://clickhouse.example:8443/default" }).state).toBe(
      "BLOCKED"
    );
  });

  it("requires the canonical packets bucket for legacy and named S3 paths", () => {
    expect(projection({ OBJECT_STORE_BUCKET: "flowcordia-packets" }).state).toBe("BLOCKED");
    expect(projection({ FLOWCORDIA_OBJECT_STORE_BUCKET: "flowcordia-packets" }).state).toBe(
      "BLOCKED"
    );
    expect(projection({ OBJECT_STORE_S3_BASE_URL: "" }).state).toBe("BLOCKED");
    expect(projection({ OBJECT_STORE_S3_BUCKET: "other" }).state).toBe("BLOCKED");
    expect(projection({ OBJECT_STORE_S3_ACCESS_KEY_ID: "different-access-key" }).state).toBe(
      "BLOCKED"
    );
    expect(
      projection({ OBJECT_STORE_S3_SECRET_ACCESS_KEY: "different-secret-key-123456" }).state
    ).toBe("BLOCKED");
  });

  it("allows private HTTP only for exact MinIO and S2 service identities", () => {
    expect(projection({ OBJECT_STORE_BASE_URL: "http://minio:9001" }).state).toBe("BLOCKED");
    expect(projection({ OBJECT_STORE_BASE_URL: "http://storage:9000" }).state).toBe("BLOCKED");
    expect(projection({ REALTIME_STREAMS_S2_ENDPOINT: "http://s2:8080/v1" }).state).toBe("BLOCKED");
    expect(projection({ REALTIME_STREAMS_S2_ENDPOINT: "https://s2.example/v1" }).state).toBe(
      "BLOCKED"
    );
  });

  it("requires S2 v2, worker bootstrap, registry authentication, and migration isolation", () => {
    expect(projection({ REALTIME_STREAMS_DEFAULT_VERSION: "v1" }).state).toBe("BLOCKED");
    expect(projection({ TRIGGER_BOOTSTRAP_ENABLED: "0" }).state).toBe("BLOCKED");
    expect(projection({ DEPLOY_REGISTRY_PASSWORD: "short" }).state).toBe("BLOCKED");
    expect(projection({ SKIP_CLICKHOUSE_MIGRATIONS: "0" }).state).toBe("BLOCKED");
  });

  it("does not project credentials or private connection strings", () => {
    const serialized = JSON.stringify(projection());
    for (const forbidden of [
      "strong-database-password",
      "strong-redis-password",
      "strong-clickhouse-password",
      "strong-registry-password",
      "PRIVATE KEY",
      "postgresql://",
      "http://minio",
      "http://s2",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects an invalid check time", () => {
    expect(() =>
      presentFlowcordiaBundledSelfHostTopology({
        environment: environment(),
        releaseManifest: manifest(),
        checkedAt: new Date(Number.NaN),
        nodeVersion: "20.20.2",
      })
    ).toThrow("bundled self-host topology check time is invalid");
  });
});
