import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";
import {
  presentFlowcordiaDoctor,
  runFlowcordiaDoctor,
  writeFlowcordiaDoctorEvidence,
  type FlowcordiaDoctorObservations,
} from "../../../../docker/scripts/flowcordia-doctor.mjs";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const UPSTREAM_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const IMAGE_DIGEST = "a".repeat(64);
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "flowcordia-doctor-"));
  directories.push(directory);
  const manifest = createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: UPSTREAM_SHA,
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    imageReference: `ghcr.io/ahamdjin/flowcordia@sha256:${IMAGE_DIGEST}`,
    migrations: [{ name: "20260101000000_initial", checksum: "b".repeat(64) }],
  });
  const path = join(directory, "release.json");
  writeFileSync(path, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  return { directory, manifest, path };
}

function environment(path: string, manifestSha256: string): Record<string, string> {
  return {
    APP_ENV: "production",
    NODE_ENV: "production",
    APP_ORIGIN: "https://flowcordia.example.com",
    LOGIN_ORIGIN: "https://flowcordia.example.com",
    SESSION_SECRET: "S2F3qW4eR5tY6uI7oP8aS9dF0gH1jK2l",
    MAGIC_LINK_SECRET: "M3nB4vC5xZ6aS7dF8gH9jK0lQ1wE2rT3",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    GITHUB_APP_ENABLED: "1",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_SLUG: "flowcordia-example",
    GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${"a".repeat(160)}\n-----END PRIVATE KEY-----`,
    GITHUB_APP_WEBHOOK_SECRET: "W8xY7zA6bC5dE4fG3hI2jK1lM0nP9qR8",
    FLOWCORDIA_PROPOSAL_EVENT_URL: "https://events.example.com/flowcordia",
    FLOWCORDIA_PROPOSAL_EVENT_SECRET: "P9oI8uY7tR6eW5qA4sD3fG2hJ1kL0mN9",
    FLOWCORDIA_RELEASE_MANIFEST_PATH: path,
    FLOWCORDIA_RELEASE_MANIFEST_SHA256: manifestSha256,
    FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
    FLOWCORDIA_IMAGE_DIGEST: IMAGE_DIGEST,
    FLOWCORDIA_RELEASE_COMPONENT: "web",
    FLOWCORDIA_PROPOSAL_WORKER_ENABLED: "0",
    HTTP_SERVER_DISABLED: "false",
    FLOWCORDIA_STUDIO_ENABLED: "0",
    SKIP_POSTGRES_MIGRATIONS: "1",
    SKIP_DASHBOARD_AGENT_MIGRATIONS: "1",
    SKIP_CLICKHOUSE_MIGRATIONS: "1",
    DATABASE_URL: "postgresql://flowcordia:secret@postgres.internal:5432/flowcordia",
    REDIS_HOST: "redis.internal",
    REDIS_PORT: "6379",
    CLICKHOUSE_URL: "https://default:secret@clickhouse.internal:8443/default",
    ELECTRIC_ORIGIN: "https://electric.internal",
    OBJECT_STORE_BASE_URL: "https://s3.example.net",
    OBJECT_STORE_BUCKET: "flowcordia-packets",
    OBJECT_STORE_REGION: "us-east-1",
    OBJECT_STORE_ACCESS_KEY_ID: "AKIAFLOWCORDIA123456",
    OBJECT_STORE_SECRET_ACCESS_KEY: "vR8mQ2pL6sT0yW4cF9hJ3kN7dB1xZ5aE",
    EMAIL_TRANSPORT: "resend",
    FROM_EMAIL: "Flowcordia <no-reply@flowcordia.example>",
    REPLY_TO_EMAIL: "support@flowcordia.example",
    RESEND_API_KEY: "re_8Jk2Lm6Np0Qr4St8Uv1Wx5Yz",
  };
}

function readyObservations(): FlowcordiaDoctorObservations {
  return {
    database: "READY",
    migrations: "READY",
    redis: "READY",
    clickhouse: "READY",
    electric: "READY",
    objectStore: "READY",
    email: "READY",
    githubApp: "READY",
    workerHeartbeat: "READY",
    publicOrigin: "READY",
    publicOriginReachability: "READY",
    webHealth: "READY",
    operationsLocalHealth: "READY",
  };
}

describe("Flowcordia self-host doctor", () => {
  it("produces bounded READY evidence for one exact release", async () => {
    const { manifest, path } = fixture();
    const observe = vi.fn().mockResolvedValue(readyObservations());

    const result = await runFlowcordiaDoctor({
      environment: environment(path, manifest.manifestSha256),
      profile: "release",
      checkedAt: new Date("2026-07-23T01:00:00.000Z"),
      observe,
    });

    expect(result).toMatchObject({
      schemaVersion: "0.1",
      kind: "flowcordia-self-host-diagnostics",
      state: "READY",
      profile: "release",
      release: {
        releaseId: "flowcordia-0.1.0-rc.1",
        version: "0.1.0-rc.1",
        applicationCommitSha: APPLICATION_SHA,
        upstreamCommitSha: UPSTREAM_SHA,
        imageDigest: IMAGE_DIGEST,
        manifestSha256: manifest.manifestSha256,
      },
    });
    expect(result.checks.every((candidate) => ["READY", "SKIPPED"].includes(candidate.state))).toBe(
      true
    );
    expect(result.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(observe).toHaveBeenCalledOnce();
  });

  it("blocks before live probes when release identity moves", async () => {
    const { manifest, path } = fixture();
    const observe = vi.fn();
    const input = environment(path, manifest.manifestSha256);
    input.FLOWCORDIA_IMAGE_DIGEST = "c".repeat(64);

    const result = await runFlowcordiaDoctor({
      environment: input,
      profile: "release",
      checkedAt: new Date("2026-07-23T01:00:00.000Z"),
      observe,
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.checks.find((candidate) => candidate.key === "release_identity")?.state).toBe(
      "BLOCKED"
    );
    expect(observe).not.toHaveBeenCalled();
  });

  it("distinguishes unavailable live dependencies from blocked configuration", async () => {
    const { manifest, path } = fixture();
    const observations = readyObservations();
    observations.objectStore = "UNAVAILABLE";

    const result = await runFlowcordiaDoctor({
      environment: environment(path, manifest.manifestSha256),
      profile: "release",
      checkedAt: new Date("2026-07-23T01:00:00.000Z"),
      observe: async () => observations,
    });

    expect(result.state).toBe("UNAVAILABLE");
    expect(result.checks.find((candidate) => candidate.key === "object_store")?.state).toBe(
      "UNAVAILABLE"
    );
    expect(result.checks.find((candidate) => candidate.key === "object_store")?.message).toContain(
      "did not accept"
    );
  });

  it("uses profile-specific worker and HTTP checks", () => {
    const { manifest } = fixture();
    const web = presentFlowcordiaDoctor({
      profile: "web",
      release: manifest,
      checkedAt: new Date("2026-07-23T01:00:00.000Z"),
      releaseIdentityReady: true,
      configurationReady: true,
      observations: readyObservations(),
    });
    const operations = presentFlowcordiaDoctor({
      profile: "operations",
      release: manifest,
      checkedAt: new Date("2026-07-23T01:00:00.000Z"),
      releaseIdentityReady: true,
      configurationReady: true,
      observations: readyObservations(),
    });

    expect(web.checks.find((candidate) => candidate.key === "worker_heartbeat")?.state).toBe(
      "SKIPPED"
    );
    expect(web.checks.find((candidate) => candidate.key === "operations_local_health")?.state).toBe(
      "SKIPPED"
    );
    expect(operations.checks.find((candidate) => candidate.key === "web_health")?.state).toBe(
      "SKIPPED"
    );
    expect(
      operations.checks.find((candidate) => candidate.key === "public_origin_reachability")?.state
    ).toBe("SKIPPED");
  });

  it("writes owner-only no-overwrite diagnostics outside the repository", async () => {
    const { directory, manifest, path } = fixture();
    const evidence = await runFlowcordiaDoctor({
      environment: environment(path, manifest.manifestSha256),
      profile: "release",
      checkedAt: new Date("2026-07-23T01:00:00.000Z"),
      observe: async () => readyObservations(),
    });
    const output = join(directory, "evidence", "doctor.json");

    await writeFlowcordiaDoctorEvidence(output, evidence);

    expect(existsSync(output)).toBe(true);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(evidence);
    await expect(writeFlowcordiaDoctorEvidence(output, evidence)).rejects.toThrow(
      "output already exists"
    );
  });

  it("never projects credentials, URLs, provider errors, or database identities", async () => {
    const { manifest, path } = fixture();
    const result = await runFlowcordiaDoctor({
      environment: environment(path, manifest.manifestSha256),
      profile: "release",
      checkedAt: new Date("2026-07-23T01:00:00.000Z"),
      observe: async () => readyObservations(),
    });
    const serialized = JSON.stringify(result);

    for (const forbidden of [
      "postgresql://",
      "flowcordia.example.com",
      "PRIVATE KEY",
      "AKIAFLOWCORDIA",
      "RESEND_API_KEY",
      "secret@",
      "rawError",
      "payload",
      "customer",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
