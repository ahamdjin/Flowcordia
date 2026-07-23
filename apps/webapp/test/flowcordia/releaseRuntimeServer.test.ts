import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";
import {
  loadFlowcordiaReleaseRuntimeIdentity,
  type FlowcordiaReleaseRuntimeEnvironment,
} from "../../app/features/flowcordia/operations/release-runtime.server";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const UPSTREAM_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const IMAGE_DIGEST = "a".repeat(64);
const directories: string[] = [];

function releaseManifest() {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: UPSTREAM_SHA,
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    imageReference: `ghcr.io/ahamdjin/flowcordia@sha256:${IMAGE_DIGEST}`,
    migrations: [{ name: "20260101000000_initial", checksum: "b".repeat(64) }],
  });
}

function manifestFile(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), "flowcordia-release-runtime-"));
  directories.push(directory);
  const path = join(directory, "release.json");
  writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
  return path;
}

function environment(
  path: string,
  overrides: FlowcordiaReleaseRuntimeEnvironment = {}
): FlowcordiaReleaseRuntimeEnvironment {
  const manifest = releaseManifest();
  return {
    FLOWCORDIA_RELEASE_RUNTIME_REQUIRED: "1",
    FLOWCORDIA_RELEASE_MANIFEST_PATH: path,
    FLOWCORDIA_RELEASE_MANIFEST_SHA256: manifest.manifestSha256,
    FLOWCORDIA_RELEASE_COMPONENT: "web",
    FLOWCORDIA_APPLICATION_COMMIT_SHA: APPLICATION_SHA,
    FLOWCORDIA_IMAGE_DIGEST: IMAGE_DIGEST,
    FLOWCORDIA_PROPOSAL_WORKER_ENABLED: "0",
    FLOWCORDIA_STUDIO_ENABLED: "0",
    HTTP_SERVER_DISABLED: "false",
    ...overrides,
  };
}

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop()!, { recursive: true, force: true });
  }
});

describe("Flowcordia release runtime loader", () => {
  it("loads one bounded regular manifest and returns safe runtime identity", () => {
    const manifest = releaseManifest();
    const path = manifestFile(`${JSON.stringify(manifest)}\n`);

    expect(
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: environment(path),
        nodeVersion: "20.20.2",
      })
    ).toMatchObject({
      state: "READY",
      releaseId: manifest.releaseId,
      component: "web",
      manifestSha256: manifest.manifestSha256,
    });
  });

  it("remains dark by default without touching a manifest path", () => {
    expect(
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: {
          FLOWCORDIA_RELEASE_RUNTIME_REQUIRED: "0",
          FLOWCORDIA_RELEASE_MANIFEST_PATH: "/does/not/exist",
        },
        nodeVersion: "20.20.2",
      })
    ).toBeUndefined();
  });

  it("rejects invalid enforcement and relative paths", () => {
    expect(() =>
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: { FLOWCORDIA_RELEASE_RUNTIME_REQUIRED: "true" },
        nodeVersion: "20.20.2",
      })
    ).toThrow("must be 0 or 1");

    expect(() =>
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: environment("release.json"),
        nodeVersion: "20.20.2",
      })
    ).toThrow("absolute bounded path");
  });

  it("rejects symbolic links and unavailable files with fixed errors", () => {
    const manifest = releaseManifest();
    const target = manifestFile(JSON.stringify(manifest));
    const link = join(target.slice(0, target.lastIndexOf("/")), "release-link.json");
    symlinkSync(target, link);

    expect(() =>
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: environment(link),
        nodeVersion: "20.20.2",
      })
    ).toThrow("manifest is unavailable");

    expect(() =>
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: environment("/does/not/exist/release.json"),
        nodeVersion: "20.20.2",
      })
    ).toThrow("manifest is unavailable");
  });

  it("rejects invalid JSON and oversized files before identity validation", () => {
    const invalid = manifestFile("{not-json}");
    expect(() =>
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: environment(invalid),
        nodeVersion: "20.20.2",
      })
    ).toThrow("not valid JSON");

    const oversized = manifestFile("x".repeat(64 * 1024 + 1));
    expect(() =>
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: environment(oversized),
        nodeVersion: "20.20.2",
      })
    ).toThrow("bounded regular file");
  });

  it("enforces the isolated operations-worker process mode from environment", () => {
    const manifest = releaseManifest();
    const path = manifestFile(JSON.stringify(manifest));

    expect(
      loadFlowcordiaReleaseRuntimeIdentity({
        environment: environment(path, {
          FLOWCORDIA_RELEASE_COMPONENT: "operations_worker",
          FLOWCORDIA_PROPOSAL_WORKER_ENABLED: "1",
          FLOWCORDIA_STUDIO_ENABLED: "0",
          HTTP_SERVER_DISABLED: "true",
        }),
        nodeVersion: "20.20.2",
      })
    ).toMatchObject({ state: "READY", component: "operations_worker" });
  });
});
