import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const VERIFY_SCRIPT = join(ROOT, "docker/scripts/flowcordia-release-verify.mjs");
const HEALTH_SCRIPT = join(ROOT, "docker/scripts/flowcordia-operations-health.mjs");
const MIGRATION_EVIDENCE_SCRIPT = join(ROOT, "docker/scripts/flowcordia-migration-evidence.mjs");
const OPERATIONS_HEALTH_DIRECTORY = "/tmp/flowcordia";
const OPERATIONS_HEALTH_PATH = `${OPERATIONS_HEALTH_DIRECTORY}/operations-health.json`;
const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const IMAGE_DIGEST = "a".repeat(64);
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  rmSync(OPERATIONS_HEALTH_DIRECTORY, { recursive: true, force: true });
});

function releaseFixture() {
  const directory = mkdtempSync(join(tmpdir(), "flowcordia-release-script-"));
  directories.push(directory);
  const manifest = createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: "89abcdef0123456789abcdef0123456789abcdef",
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    imageReference: `ghcr.io/ahamdjin/flowcordia@sha256:${IMAGE_DIGEST}`,
    migrations: [{ name: "20260101000000_initial", checksum: "b".repeat(64) }],
  });
  const path = join(directory, "manifest.json");
  writeFileSync(path, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  return { manifest, path };
}

function verify(role: string, overrides: Record<string, string> = {}) {
  const fixture = releaseFixture();
  return {
    ...fixture,
    result: spawnSync(process.execPath, [VERIFY_SCRIPT, role], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        FLOWCORDIA_RELEASE_MANIFEST_PATH: fixture.path,
        FLOWCORDIA_RELEASE_MANIFEST_SHA256: fixture.manifest.manifestSha256,
        FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
        FLOWCORDIA_IMAGE_DIGEST: IMAGE_DIGEST,
        ...overrides,
      },
    }),
  };
}

describe("Flowcordia container release scripts", () => {
  it("accepts exact web, operations, and migration identities", () => {
    for (const role of ["web", "operations_worker", "migration"]) {
      const { result } = verify(role);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Flowcordia release process identity: READY");
      expect(result.stdout).not.toContain("ghcr.io");
    }
  });

  it("rejects another deployment digest or process role", () => {
    expect(verify("web", { FLOWCORDIA_IMAGE_DIGEST: "c".repeat(64) }).result.status).toBe(1);
    expect(verify("unknown").result.status).toBe(1);
  });

  it("rejects a malformed but readable manifest without exposing parser details", () => {
    const fixture = releaseFixture();
    const malformed = { ...fixture.manifest, releaseId: "../escape" };
    writeFileSync(fixture.path, `${JSON.stringify(malformed)}\n`, { mode: 0o600 });
    const result = spawnSync(process.execPath, [VERIFY_SCRIPT, "migration"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        FLOWCORDIA_RELEASE_MANIFEST_PATH: fixture.path,
        FLOWCORDIA_RELEASE_MANIFEST_SHA256: fixture.manifest.manifestSha256,
        FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
        FLOWCORDIA_IMAGE_DIGEST: IMAGE_DIGEST,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release process identity is unavailable or invalid");
    expect(result.stderr).not.toContain("../escape");
  });

  it("accepts only a fresh exact operations readiness pulse", () => {
    mkdirSync(OPERATIONS_HEALTH_DIRECTORY, { recursive: true, mode: 0o700 });
    writeFileSync(
      OPERATIONS_HEALTH_PATH,
      `${JSON.stringify({
        schemaVersion: "0.1",
        state: "READY",
        applicationCommitSha: APPLICATION_SHA,
        checkedAt: new Date().toISOString(),
      })}\n`,
      { mode: 0o600 }
    );

    const ready = spawnSync(process.execPath, [HEALTH_SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA },
    });
    expect(ready.status).toBe(0);
    expect(ready.stdout).toContain("Flowcordia operations health: READY");

    writeFileSync(
      OPERATIONS_HEALTH_PATH,
      `${JSON.stringify({
        schemaVersion: "0.1",
        state: "READY",
        applicationCommitSha: APPLICATION_SHA,
        checkedAt: new Date(Date.now() - 60_000).toISOString(),
      })}\n`,
      { mode: 0o600 }
    );
    const stale = spawnSync(process.execPath, [HEALTH_SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA },
    });
    expect(stale.status).toBe(1);
  });

  it("writes immutable digest-bound migration completion evidence exactly once", () => {
    const fixture = releaseFixture();
    const evidenceDirectory = join(fixture.path, "..");
    const environment = {
      ...process.env,
      FLOWCORDIA_RELEASE_MANIFEST_PATH: fixture.path,
      FLOWCORDIA_RELEASE_MANIFEST_SHA256: fixture.manifest.manifestSha256,
      FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
      FLOWCORDIA_IMAGE_DIGEST: IMAGE_DIGEST,
      FLOWCORDIA_MIGRATION_CONFIRM: fixture.manifest.releaseId,
      FLOWCORDIA_MIGRATION_EVIDENCE_DIR: evidenceDirectory,
      FLOWCORDIA_MIGRATION_COMPLETED_AT: "2026-07-23T01:00:00.000Z",
    };
    const first = spawnSync(process.execPath, [MIGRATION_EVIDENCE_SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: environment,
    });
    expect(first.status).toBe(0);
    const path = join(evidenceDirectory, `${fixture.manifest.releaseId}.json`);
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    expect(evidence).toMatchObject({
      schemaVersion: "0.2",
      kind: "flowcordia-self-host-migration",
      state: "COMPLETED",
      releaseId: fixture.manifest.releaseId,
      applicationCommitSha: APPLICATION_SHA,
      imageDigest: IMAGE_DIGEST,
      manifestSha256: fixture.manifest.manifestSha256,
      migrations: fixture.manifest.migrations,
    });
    expect(evidence.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(path).mode & 0o777).toBe(0o600);

    const second = spawnSync(process.execPath, [MIGRATION_EVIDENCE_SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: environment,
    });
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("failed safely");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(evidence);
  });

  it("rejects migration evidence for another confirmation or image", () => {
    const fixture = releaseFixture();
    const result = spawnSync(process.execPath, [MIGRATION_EVIDENCE_SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        FLOWCORDIA_RELEASE_MANIFEST_PATH: fixture.path,
        FLOWCORDIA_RELEASE_MANIFEST_SHA256: fixture.manifest.manifestSha256,
        FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
        FLOWCORDIA_IMAGE_DIGEST: "c".repeat(64),
        FLOWCORDIA_MIGRATION_CONFIRM: "another-release",
        FLOWCORDIA_MIGRATION_EVIDENCE_DIR: join(fixture.path, ".."),
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("another-release");
  });
});
