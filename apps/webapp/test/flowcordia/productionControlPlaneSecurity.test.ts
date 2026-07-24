import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  flowcordiaControlPlaneSecretIssues,
  flowcordiaControlPlaneSecretsReady,
} from "~/features/flowcordia/operations/control-plane-secrets";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia production control-plane security", () => {
  it("rejects public defaults, weak values, and shared credentials", () => {
    expect(
      flowcordiaControlPlaneSecretIssues({
        PROVIDER_SECRET: "provider-secret",
        COORDINATOR_SECRET: "short",
        MANAGED_WORKER_SECRET: "short",
      }).map((issue) => issue.code)
    ).toEqual(["known_default", "weak", "weak"]);

    const shared = "a-secure-but-shared-control-plane-secret-value";
    expect(
      flowcordiaControlPlaneSecretIssues({
        PROVIDER_SECRET: shared,
        COORDINATOR_SECRET: shared,
        MANAGED_WORKER_SECRET: "an-independent-managed-worker-secret-value",
      }).some((issue) => issue.code === "duplicate")
    ).toBe(true);
  });

  it("accepts three independent production credentials", () => {
    expect(
      flowcordiaControlPlaneSecretsReady({
        PROVIDER_SECRET: "provider-4d5acdfb7e6866db93ed63b9",
        COORDINATOR_SECRET: "coordinator-035caec12f77512860228f88",
        MANAGED_WORKER_SECRET: "worker-0e3b895ca9b91313a052ef57",
      })
    ).toBe(true);
  });

  it("never logs raw worker or Slack credentials", () => {
    const worker = source(
      "apps/webapp/app/v3/services/worker/workerGroupTokenService.server.ts"
    );
    const slack = source("apps/webapp/app/models/orgIntegration.server.ts");

    expect(worker).toContain("tokenFingerprint");
    expect(worker).toContain("managedSecretFingerprint");
    expect(worker).not.toMatch(/logger\.(?:error|warn|info|debug)\([^)]*\{\s*token(?:,|\s*:)/s);
    expect(worker).not.toMatch(/logger\.(?:error|warn|info|debug)\([^)]*managedWorkerSecret/s);
    expect(slack).not.toContain('logger.debug("Received slack access token"');
    expect(slack).not.toMatch(/logger\.debug\([^)]*\bresult\b/s);
    expect(slack).not.toMatch(/logger\.debug\([^)]*secretValue/s);
  });

  it("documents and templates every required secret", () => {
    const secrets = source("docker/flowcordia-self-host.secrets.example");
    const boundary = source("flowcordia/security/production-control-plane-authentication.md");

    for (const key of ["PROVIDER_SECRET", "COORDINATOR_SECRET", "MANAGED_WORKER_SECRET"]) {
      expect(secrets).toContain(`${key}=replace-with-at-least-32-random-characters`);
      expect(boundary).toContain(`\`${key}\``);
    }
  });
});
