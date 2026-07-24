import { describe, expect, it } from "vitest";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";
import { presentFlowcordiaSelfHostTopology } from "../../app/features/flowcordia/operations/self-host-topology";

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
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
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
    PROVIDER_SECRET: "provider-4d5acdfb7e6866db93ed63b9",
    COORDINATOR_SECRET: "coordinator-035caec12f77512860228f88",
    MANAGED_WORKER_SECRET: "worker-0e3b895ca9b91313a052ef57",
    DATABASE_URL: "postgresql://flowcordia:strong@postgres.internal:5432/flowcordia",
    DIRECT_URL: "postgresql://migrator:strong@postgres.internal:5432/flowcordia",
    DATABASE_HOST: "postgres.internal:5432",
    FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
    GITHUB_APP_ENABLED: "1",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_SLUG: "flowcordia-example",
    GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${"a".repeat(160)}\n-----END PRIVATE KEY-----`,
    GITHUB_APP_WEBHOOK_SECRET: "W8xY7zA6bC5dE4fG3hI2jK1lM0nP9qR8",
    FLOWCORDIA_STUDIO_ENABLED: "0",
    FLOWCORDIA_PROPOSAL_EVENT_URL: "https://events.example.com/flowcordia",
    FLOWCORDIA_PROPOSAL_EVENT_SECRET: "P9oI8uY7tR6eW5qA4sD3fG2hJ1kL0mN9",
    CLICKHOUSE_URL: "https://default:strong@clickhouse.internal:8443/default",
    RUN_REPLICATION_CLICKHOUSE_URL: "https://default:strong@clickhouse.internal:8443/default",
    ELECTRIC_ORIGIN: "https://electric.internal",
    REDIS_HOST: "redis.internal",
    REDIS_PORT: "6379",
    DEPLOY_REGISTRY_HOST: "registry.internal:5000",
    DEPLOY_REGISTRY_NAMESPACE: "flowcordia",
    OBJECT_STORE_BASE_URL: "https://s3.example.net",
    OBJECT_STORE_SERVICE: "s3",
    OBJECT_STORE_BUCKET: "flowcordia-packets",
    OBJECT_STORE_REGION: "us-east-1",
    OBJECT_STORE_ACCESS_KEY_ID: "AKIAFLOWCORDIA123456",
    OBJECT_STORE_SECRET_ACCESS_KEY: "vR8mQ2pL6sT0yW4cF9hJ3kN7dB1xZ5aE",
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
  return presentFlowcordiaSelfHostTopology({
    environment: environment(overrides),
    releaseManifest: manifest(),
    checkedAt: new Date("2026-07-23T00:30:00.000Z"),
    nodeVersion: "20.20.2",
  });
}

describe("Flowcordia production self-host topology", () => {
  it("accepts one exact immutable single-host application plane", () => {
    const result = projection();

    expect(result).toMatchObject({
      schemaVersion: "0.1",
      state: "READY",
      releaseId: "flowcordia-0.1.0-rc.1",
      applicationCommitSha: APPLICATION_SHA,
      imageDigest: IMAGE_DIGEST,
    });
    expect(result.checks).toHaveLength(9);
    expect(result.checks.every((candidate) => candidate.state === "READY")).toBe(true);
  });

  it("blocks another image, application, or manifest identity", () => {
    expect(projection({ FLOWCORDIA_IMAGE_DIGEST: "c".repeat(64) }).state).toBe("BLOCKED");
    expect(projection({ FLOWCORDIA_APPLICATION_COMMIT_SHA: UPSTREAM_SHA }).state).toBe("BLOCKED");
    expect(projection({ FLOWCORDIA_RELEASE_MANIFEST_SHA256: "d".repeat(64) }).state).toBe(
      "BLOCKED"
    );
  });

  it("blocks application replicas that can race the migration job", () => {
    const result = projection({ SKIP_POSTGRES_MIGRATIONS: "0" });

    expect(result.state).toBe("BLOCKED");
    expect(result.checks.find((candidate) => candidate.key === "migration_policy")?.state).toBe(
      "BLOCKED"
    );
  });

  it("blocks unsupported replica counts instead of implying Compose HA", () => {
    expect(projection({ FLOWCORDIA_WEB_REPLICAS: "2" }).state).toBe("BLOCKED");
    expect(projection({ FLOWCORDIA_OPERATIONS_REPLICAS: "2" }).state).toBe("BLOCKED");
  });

  it("blocks missing external dependencies, object storage, or email", () => {
    expect(projection({ REDIS_HOST: "" }).state).toBe("BLOCKED");
    expect(projection({ DATABASE_HOST: "other.internal:5432" }).state).toBe("BLOCKED");
    expect(projection({ DEPLOY_REGISTRY_HOST: "" }).state).toBe("BLOCKED");
    expect(projection({ LOGIN_ORIGIN: "https://login.example.com" }).state).toBe("BLOCKED");
    expect(projection({ OBJECT_STORE_BASE_URL: "http://s3.internal" }).state).toBe("BLOCKED");
    expect(projection({ EMAIL_TRANSPORT: "console" }).state).toBe("BLOCKED");
  });

  it("accepts generic S3 fallback and credential-chain provider modes", () => {
    expect(
      projection({
        OBJECT_STORE_DEFAULT_PROTOCOL: "s3",
        OBJECT_STORE_ACCESS_KEY_ID: "",
        OBJECT_STORE_SECRET_ACCESS_KEY: "",
      }).state
    ).toBe("READY");
  });

  it("does not project credentials or provider values", () => {
    const serialized = JSON.stringify(projection());
    for (const forbidden of [
      "SESSION_SECRET",
      "PRIVATE KEY",
      "AKIAFLOWCORDIA",
      "RESEND_API_KEY",
      "postgresql://",
      "CLICKHOUSE_URL",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects an invalid check time", () => {
    expect(() =>
      presentFlowcordiaSelfHostTopology({
        environment: environment(),
        releaseManifest: manifest(),
        checkedAt: new Date(Number.NaN),
        nodeVersion: "20.20.2",
      })
    ).toThrow("topology check time is invalid");
  });
});
