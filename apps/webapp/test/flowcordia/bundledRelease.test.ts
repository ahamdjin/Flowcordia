import { describe, expect, it } from "vitest";
import {
  assertFlowcordiaBundledReleaseEnvironment,
  createFlowcordiaBundledReleaseManifest,
  FLOWCORDIA_BUNDLED_IMAGE_BINDINGS,
  parseFlowcordiaBundledReleaseManifest,
} from "../../app/features/flowcordia/operations/bundled-release";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const APPLICATION_DIGEST = "a".repeat(64);

function applicationManifest() {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: "89abcdef0123456789abcdef0123456789abcdef",
    createdAt: new Date("2026-07-24T20:00:00.000Z"),
    imageReference: `ghcr.io/ahamdjin/flowcordia@sha256:${APPLICATION_DIGEST}`,
    migrations: [{ name: "20260101000000_initial", checksum: "b".repeat(64) }],
  });
}

function environment(): Record<string, string> {
  return Object.fromEntries(
    FLOWCORDIA_BUNDLED_IMAGE_BINDINGS.map((binding, index) => [
      binding.environmentKey,
      `registry.example.com/flowcordia/${binding.name}:compat-1@sha256:${(index + 1)
        .toString(16)
        .repeat(64)}`,
    ])
  );
}

function bundledManifest() {
  return createFlowcordiaBundledReleaseManifest({
    compatibilityVersion: 1,
    createdAt: new Date("2026-07-24T20:05:00.000Z"),
    applicationManifest: applicationManifest(),
    environment: environment(),
  });
}

describe("Flowcordia bundled release manifest", () => {
  it("binds the application release and complete canonical image set", () => {
    const manifest = bundledManifest();

    expect(manifest).toMatchObject({
      schemaVersion: "0.1",
      kind: "flowcordia-bundled-self-host-release",
      compatibilityVersion: 1,
      platform: "linux/amd64",
      application: {
        releaseId: "flowcordia-0.1.0-rc.1",
        applicationCommitSha: APPLICATION_SHA,
        imageDigest: APPLICATION_DIGEST,
      },
    });
    expect(manifest.images.map((candidate) => candidate.name)).toEqual(
      FLOWCORDIA_BUNDLED_IMAGE_BINDINGS.map((binding) => binding.name)
    );
    expect(parseFlowcordiaBundledReleaseManifest(manifest)).toEqual(manifest);
  });

  it("rejects tag-only dependency images", () => {
    expect(() =>
      createFlowcordiaBundledReleaseManifest({
        compatibilityVersion: 1,
        createdAt: new Date("2026-07-24T20:05:00.000Z"),
        applicationManifest: applicationManifest(),
        environment: {
          ...environment(),
          FLOWCORDIA_SUPERVISOR_IMAGE_REFERENCE: "ghcr.io/triggerdotdev/supervisor:v4-beta",
        },
      })
    ).toThrow("immutable @sha256");
  });

  it("rejects mutation after canonical digest creation", () => {
    const manifest = bundledManifest();
    expect(() =>
      parseFlowcordiaBundledReleaseManifest({
        ...manifest,
        images: manifest.images.map((candidate, index) =>
          index === 0 ? { ...candidate, name: "redis" } : candidate
        ),
      })
    ).toThrow();
  });

  it("requires deployment environment and manifest to agree exactly", () => {
    const manifest = bundledManifest();
    const exactEnvironment = {
      ...environment(),
      FLOWCORDIA_BUNDLED_RELEASE_MANIFEST_SHA256: manifest.manifestSha256,
    };
    expect(
      assertFlowcordiaBundledReleaseEnvironment({
        environment: exactEnvironment,
        applicationManifest: applicationManifest(),
        bundledManifest: manifest,
      }).manifestSha256
    ).toBe(manifest.manifestSha256);

    expect(() =>
      assertFlowcordiaBundledReleaseEnvironment({
        environment: {
          ...exactEnvironment,
          FLOWCORDIA_REDIS_IMAGE_REFERENCE: `redis:7@sha256:${"f".repeat(64)}`,
        },
        applicationManifest: applicationManifest(),
        bundledManifest: manifest,
      })
    ).toThrow("does not match");
  });
});
