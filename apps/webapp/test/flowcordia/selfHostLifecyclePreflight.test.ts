import { describe, expect, it } from "vitest";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";
import {
  createFlowcordiaSelfHostCleanDependenciesEvidence,
  createFlowcordiaSelfHostInstallationIdentityEvidence,
  parseFlowcordiaSelfHostCleanDependenciesEvidence,
  parseFlowcordiaSelfHostInstallationIdentityEvidence,
} from "../../app/features/flowcordia/operations/self-host-lifecycle-preflight";

const CURRENT_SHA = "0123456789abcdef0123456789abcdef01234567";
const TARGET_SHA = "1123456789abcdef0123456789abcdef01234567";
const UPSTREAM_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const FIRST_MIGRATION = { name: "20260101000000_initial", checksum: "b".repeat(64) };

function release(releaseId: string, version: string, applicationSha: string, image: string) {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId,
    version,
    applicationCommitSha: applicationSha,
    upstreamCommitSha: UPSTREAM_SHA,
    createdAt: new Date(
      version === "0.1.0" ? "2026-07-23T00:00:00.000Z" : "2026-07-23T00:10:00.000Z"
    ),
    imageReference: `ghcr.io/ahamdjin/flowcordia@sha256:${image}`,
    migrations: [FIRST_MIGRATION],
  });
}

function environment(manifest: ReturnType<typeof release>) {
  return {
    APP_ENV: "production",
    NODE_ENV: "production",
    APP_ORIGIN: "https://flowcordia.example.com",
    LOGIN_ORIGIN: "https://flowcordia.example.com",
    DATABASE_HOST: "postgres.internal:5432",
    DATABASE_URL:
      "postgresql://flowcordia:password@postgres.internal:5432/flowcordia?schema=public",
    DIRECT_URL: "postgresql://migrator:password@postgres.internal:5432/flowcordia?schema=public",
    REDIS_HOST: "redis.internal",
    REDIS_PORT: "6379",
    REDIS_USERNAME: "flowcordia",
    REDIS_TLS_DISABLED: "false",
    ELECTRIC_ORIGIN: "https://electric.internal",
    RUN_REPLICATION_ENABLED: "1",
    EVENT_REPOSITORY_DEFAULT_STORE: "clickhouse_v2",
    CLICKHOUSE_URL: "https://default:password@clickhouse.internal:8443/default",
    RUN_REPLICATION_CLICKHOUSE_URL: "https://default:password@clickhouse.internal:8443/default",
    OBJECT_STORE_BASE_URL: "https://s3.example.net",
    OBJECT_STORE_BUCKET: "flowcordia-packets",
    OBJECT_STORE_REGION: "us-east-1",
    OBJECT_STORE_SERVICE: "s3",
    OBJECT_STORE_DEFAULT_PROTOCOL: "s3",
    OBJECT_STORE_FORCE_PATH_STYLE: "false",
    EMAIL_TRANSPORT: "resend",
    FROM_EMAIL: "Flowcordia <no-reply@flowcordia.example>",
    REPLY_TO_EMAIL: "support@flowcordia.example",
    GITHUB_APP_ENABLED: "1",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_SLUG: "flowcordia-example",
    FLOWCORDIA_PROPOSAL_EVENT_URL: "https://flowcordia.example.com/api/flowcordia/proposal-events",
    SESSION_SECRET: "S2F3qW4eR5tY6uI7oP8aS9dF0gH1jK2l",
    MAGIC_LINK_SECRET: "M3nB4vC5xZ6aS7dF8gH9jK0lQ1wE2rT3",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    FLOWCORDIA_PROPOSAL_EVENT_SECRET: "P9oI8uY7tR6eW5qA4sD3fG2hJ1kL0mN9",
    FLOWCORDIA_IMAGE_REFERENCE: manifest.image.reference,
    FLOWCORDIA_IMAGE_DIGEST: manifest.image.digest,
    FLOWCORDIA_APPLICATION_COMMIT_SHA: manifest.applicationCommitSha,
    FLOWCORDIA_RELEASE_MANIFEST_SHA256: manifest.manifestSha256,
    FLOWCORDIA_MIGRATION_CONFIRM: manifest.releaseId,
  };
}

describe("Flowcordia self-host lifecycle preflight", () => {
  it("binds distinct releases to one stable installation without exposing values", () => {
    const current = release("flowcordia-0.1.0", "0.1.0", CURRENT_SHA, "a".repeat(64));
    const target = release("flowcordia-0.2.0", "0.2.0", TARGET_SHA, "c".repeat(64));
    const evidence = createFlowcordiaSelfHostInstallationIdentityEvidence({
      currentManifest: current,
      targetManifest: target,
      currentEnvironment: environment(current),
      targetEnvironment: environment(target),
      checkedAt: new Date("2026-07-23T01:01:00.000Z"),
    });

    expect(parseFlowcordiaSelfHostInstallationIdentityEvidence(evidence, current, target)).toEqual(
      evidence
    );
    expect(evidence.installationSha256).toMatch(/^[0-9a-f]{64}$/);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("postgres.internal");
    expect(serialized).not.toContain("flowcordia.example.com");
    expect(serialized).not.toContain("SESSION_SECRET");
  });

  it("rejects another database, public origin, or stable secret", () => {
    const current = release("flowcordia-0.1.0", "0.1.0", CURRENT_SHA, "a".repeat(64));
    const target = release("flowcordia-0.2.0", "0.2.0", TARGET_SHA, "c".repeat(64));
    for (const mutate of [
      (value: Record<string, string>) => {
        const url = new URL(value.DATABASE_URL);
        url.pathname = "/other";
        value.DATABASE_URL = url.toString();
      },
      (value: Record<string, string>) => (value.APP_ORIGIN = "https://other.example.com"),
      (value: Record<string, string>) =>
        (value.ENCRYPTION_KEY = "abcdef0123456789abcdef0123456789"),
    ]) {
      const targetEnvironment = environment(target);
      mutate(targetEnvironment);
      expect(() =>
        createFlowcordiaSelfHostInstallationIdentityEvidence({
          currentManifest: current,
          targetManifest: target,
          currentEnvironment: environment(current),
          targetEnvironment,
          checkedAt: new Date("2026-07-23T01:01:00.000Z"),
        })
      ).toThrow("same installation");
    }
  });

  it("requires all owned migration histories to be empty before install", () => {
    const current = release("flowcordia-0.1.0", "0.1.0", CURRENT_SHA, "a".repeat(64));
    const evidence = createFlowcordiaSelfHostCleanDependenciesEvidence({
      releaseManifest: current,
      checkedAt: new Date("2026-07-23T01:02:00.000Z"),
      observations: {
        primary_postgresql: "READY",
        dashboard_agent_postgresql: "READY",
        clickhouse: "READY",
      },
    });

    expect(parseFlowcordiaSelfHostCleanDependenciesEvidence(evidence, current)).toEqual(evidence);
    expect(() =>
      createFlowcordiaSelfHostCleanDependenciesEvidence({
        releaseManifest: current,
        checkedAt: new Date("2026-07-23T01:02:00.000Z"),
        observations: {
          primary_postgresql: "READY",
          dashboard_agent_postgresql: "BLOCKED",
          clickhouse: "READY",
        },
      })
    ).toThrow("not empty");
  });
});
