import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

describe("Flowcordia published-image doctor source", () => {
  it("reuses one strict release contract for startup and diagnostics", () => {
    const contract = source("docker/scripts/flowcordia-release-contract.mjs");
    const verifier = source("docker/scripts/flowcordia-release-verify.mjs");
    const doctor = source("docker/scripts/flowcordia-doctor.mjs");

    expect(contract).toContain("verifyFlowcordiaReleaseProcess");
    expect(contract).toContain("unexpected_fields");
    expect(contract).toContain("changed while being read");
    expect(contract).toContain("flowcordia-self-host-release");
    expect(verifier).toContain("verifyFlowcordiaReleaseProcess");
    expect(doctor).toContain("verifyFlowcordiaReleaseProcess");
    expect(verifier).not.toContain("canonical(value)");
    expect(doctor).not.toContain("console.error(error");
  });

  it("probes real owned dependencies without mutating customer data", () => {
    const doctor = source("docker/scripts/flowcordia-doctor.mjs");

    expect(doctor).toContain(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"'
    );
    expect(doctor).toContain("FlowcordiaOperationsWorkerHeartbeat");
    expect(doctor).toContain("client.ping()");
    expect(doctor).toContain("SELECT 1");
    expect(doctor).toContain("HeadBucketCommand");
    expect(doctor).toContain('fetch("https://api.github.com/app"');
    expect(doctor).toContain("/healthcheck");
    expect(doctor).not.toContain("PutObjectCommand");
    expect(doctor).not.toContain("sendPlainTextEmail");
    expect(doctor).not.toContain("docker.sock");
  });

  it("preserves only bounded support evidence", () => {
    const doctor = source("docker/scripts/flowcordia-doctor.mjs");

    expect(doctor).toContain("flowcordia-self-host-diagnostics");
    expect(doctor).toContain("evidenceSha256");
    expect(doctor).toContain("output must be outside the repository");
    expect(doctor).toContain('open(temporary, "wx", 0o600)');
    expect(doctor).toContain("output already exists");
    expect(doctor).not.toContain("providerError");
    expect(doctor).not.toContain("databaseUrl:");
    expect(doctor).not.toContain("secretValue:");
  });

  it("distinguishes configuration blockers from live unavailability", () => {
    const doctor = source("docker/scripts/flowcordia-doctor.mjs");

    expect(doctor).toContain('state === "BLOCKED"');
    expect(doctor).toContain('state === "UNAVAILABLE"');
    expect(doctor).toContain("release_identity");
    expect(doctor).toContain("application_configuration");
    expect(doctor).toContain("public_origin_reachability");
    expect(doctor).toContain("operations_local_health");
  });
});
