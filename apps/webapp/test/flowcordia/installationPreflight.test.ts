import { describe, expect, it } from "vitest";
import {
  presentFlowcordiaInstallationPreflight,
  type FlowcordiaInstallationPreflightInput,
} from "../../app/features/flowcordia/operations/installation-preflight";

const applicationSha = "0123456789abcdef0123456789abcdef01234567";
const privateKey = `-----BEGIN PRIVATE KEY-----\n${"a".repeat(160)}\n-----END PRIVATE KEY-----`;

function environment(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    SESSION_SECRET: "s".repeat(40),
    MAGIC_LINK_SECRET: "m".repeat(40),
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    PROVIDER_SECRET: "provider-4d5acdfb7e6866db93ed63b9",
    COORDINATOR_SECRET: "coordinator-035caec12f77512860228f88",
    MANAGED_WORKER_SECRET: "worker-0e3b895ca9b91313a052ef57",
    DATABASE_URL: "postgresql://flowcordia:secret@postgres:5432/flowcordia",
    DIRECT_URL: "postgresql://flowcordia:secret@postgres:5432/flowcordia",
    APP_ORIGIN: "https://flowcordia.example.com",
    LOGIN_ORIGIN: "https://flowcordia.example.com",
    APP_ENV: "production",
    NODE_ENV: "production",
    GITHUB_APP_ENABLED: "1",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_APP_WEBHOOK_SECRET: "w".repeat(40),
    GITHUB_APP_SLUG: "flowcordia-app",
    FLOWCORDIA_APPLICATION_COMMIT_SHA: applicationSha,
    FLOWCORDIA_STUDIO_ENABLED: "0",
    FLOWCORDIA_PROPOSAL_WORKER_ENABLED: "1",
    FLOWCORDIA_PROPOSAL_EVENT_URL: "https://events.example.com/flowcordia",
    FLOWCORDIA_PROPOSAL_EVENT_SECRET: "e".repeat(40),
    ...overrides,
  };
}

function preflight(
  overrides: Partial<FlowcordiaInstallationPreflightInput> = {}
): FlowcordiaInstallationPreflightInput {
  return {
    environment: environment(),
    profile: "release",
    nodeVersion: "20.20.2",
    checkedAt: new Date("2026-07-21T17:00:00.000Z"),
    ...overrides,
  };
}

describe("Flowcordia installation preflight", () => {
  it("accepts one complete release profile without exposing values", () => {
    const sentinel = "do-not-serialize-this-secret";
    const projection = presentFlowcordiaInstallationPreflight(
      preflight({
        environment: environment({
          SESSION_SECRET: `${sentinel}${"s".repeat(40)}`,
        }),
      })
    );

    expect(projection).toMatchObject({
      schemaVersion: "0.1",
      profile: "release",
      state: "READY",
      checkedAt: "2026-07-21T17:00:00.000Z",
    });
    expect(projection.checks.every((check) => check.state === "READY")).toBe(true);
    expect(JSON.stringify(projection)).not.toContain(sentinel);
    expect(JSON.stringify(projection)).not.toContain("postgresql://");
    expect(JSON.stringify(projection)).not.toContain("PRIVATE KEY");
  });

  it("accepts GitHub App RSA keys with escaped newlines", () => {
    const rsaPrivateKey = `-----BEGIN RSA PRIVATE KEY-----\\n${"b".repeat(160)}\\n-----END RSA PRIVATE KEY-----`;
    const projection = presentFlowcordiaInstallationPreflight(
      preflight({
        environment: environment({ GITHUB_APP_PRIVATE_KEY: rsaPrivateKey }),
      })
    );

    expect(projection.checks.find((check) => check.key === "github_app")).toMatchObject({
      state: "READY",
    });
    expect(JSON.stringify(projection)).not.toContain(rsaPrivateKey);
  });

  it("blocks placeholders, unsafe origins, missing worker delivery, and a wrong runtime", () => {
    const projection = presentFlowcordiaInstallationPreflight(
      preflight({
        nodeVersion: "22.0.0",
        environment: environment({
          SESSION_SECRET: "abcdef1234",
          APP_ORIGIN: "http://flowcordia.example.com",
          FLOWCORDIA_APPLICATION_COMMIT_SHA: "a".repeat(40),
          FLOWCORDIA_PROPOSAL_EVENT_URL: "http://events.example.com/flowcordia",
          FLOWCORDIA_PROPOSAL_EVENT_SECRET: "test-secret",
        }),
      })
    );

    expect(projection.state).toBe("BLOCKED");
    expect(
      projection.checks.filter((check) => check.state === "BLOCKED").map((check) => check.key)
    ).toEqual(["runtime", "application", "web_secrets", "origins", "worker_delivery"]);
  });

  it("keeps global Studio disabled unless the invocation explicitly accepts it", () => {
    const unsafe = presentFlowcordiaInstallationPreflight(
      preflight({ environment: environment({ FLOWCORDIA_STUDIO_ENABLED: "1" }) })
    );
    expect(unsafe.checks.find((check) => check.key === "studio_rollout")).toMatchObject({
      state: "BLOCKED",
    });

    const accepted = presentFlowcordiaInstallationPreflight(
      preflight({
        environment: environment({ FLOWCORDIA_STUDIO_ENABLED: "1" }),
        allowGlobalStudio: true,
      })
    );
    expect(accepted.state).toBe("READY");
    expect(accepted.checks.find((check) => check.key === "studio_rollout")).toMatchObject({
      state: "READY",
    });
  });

  it("validates worker timing relationships instead of only individual ranges", () => {
    const staleBeforeLease = presentFlowcordiaInstallationPreflight(
      preflight({
        profile: "worker",
        environment: environment({
          FLOWCORDIA_PROPOSAL_RECONCILIATION_LEASE_MS: "300000",
          FLOWCORDIA_PROPOSAL_RECONCILIATION_STALE_MS: "120000",
          FLOWCORDIA_PROPOSAL_RECONCILIATION_REFRESH_MS: "60000",
        }),
      })
    );

    expect(staleBeforeLease.state).toBe("BLOCKED");
    expect(staleBeforeLease.checks.find((check) => check.key === "worker_limits")).toMatchObject({
      state: "BLOCKED",
    });

    const timeoutBeyondLease = presentFlowcordiaInstallationPreflight(
      preflight({
        profile: "worker",
        environment: environment({
          FLOWCORDIA_PROPOSAL_EVENT_TIMEOUT_MS: "60000",
          FLOWCORDIA_PROPOSAL_OUTBOX_LEASE_MS: "30000",
          FLOWCORDIA_PROPOSAL_GITHUB_TIMEOUT_MS: "60000",
          FLOWCORDIA_PROPOSAL_RECONCILIATION_LEASE_MS: "30000",
        }),
      })
    );
    expect(timeoutBeyondLease.checks.find((check) => check.key === "worker_limits")).toMatchObject({
      state: "BLOCKED",
    });
  });

  it("validates the deployment environment for worker-only profiles", () => {
    const projection = presentFlowcordiaInstallationPreflight(
      preflight({
        profile: "worker",
        environment: environment({ APP_ENV: "invalid", NODE_ENV: "invalid" }),
      })
    );

    expect(projection.checks.find((check) => check.key === "environment")).toMatchObject({
      state: "BLOCKED",
    });
  });

  it("allows local HTTP origins only for a non-release web profile", () => {
    const local = presentFlowcordiaInstallationPreflight(
      preflight({
        profile: "web",
        environment: environment({
          APP_ENV: "development",
          NODE_ENV: "development",
          APP_ORIGIN: "http://localhost:3030",
          LOGIN_ORIGIN: "http://localhost:3030",
        }),
      })
    );
    expect(local.state).toBe("READY");

    const release = presentFlowcordiaInstallationPreflight(
      preflight({
        environment: environment({
          APP_ORIGIN: "http://localhost:3030",
          LOGIN_ORIGIN: "http://localhost:3030",
        }),
      })
    );
    expect(release.checks.find((check) => check.key === "origins")).toMatchObject({
      state: "BLOCKED",
    });
  });

  it("rejects invalid profile and time inputs before producing evidence", () => {
    expect(() =>
      presentFlowcordiaInstallationPreflight(
        preflight({ profile: "invalid" as FlowcordiaInstallationPreflightInput["profile"] })
      )
    ).toThrow("profile is invalid");
    expect(() =>
      presentFlowcordiaInstallationPreflight(preflight({ checkedAt: new Date("invalid") }))
    ).toThrow("check time is invalid");
  });
});
