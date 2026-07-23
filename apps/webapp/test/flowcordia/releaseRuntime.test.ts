import { describe, expect, it } from "vitest";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";
import {
  presentFlowcordiaReleaseRuntimeIdentity,
  type FlowcordiaReleaseRuntimeInput,
} from "../../app/features/flowcordia/operations/release-runtime";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const UPSTREAM_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const IMAGE_DIGEST = "a".repeat(64);

function manifest() {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: UPSTREAM_SHA,
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    imageReference: `ghcr.io/ahamdjin/flowcordia@sha256:${IMAGE_DIGEST}`,
    migrations: [
      { name: "20260101000000_initial", checksum: "b".repeat(64) },
      { name: "20260102000000_runtime_identity", checksum: "c".repeat(64) },
    ],
  });
}

function input(
  overrides: Partial<FlowcordiaReleaseRuntimeInput> = {}
): FlowcordiaReleaseRuntimeInput {
  const releaseManifest = manifest();
  return {
    manifest: releaseManifest,
    component: "web",
    applicationCommitSha: APPLICATION_SHA,
    expectedManifestSha256: releaseManifest.manifestSha256,
    imageDigest: IMAGE_DIGEST,
    nodeVersion: "20.20.2",
    workerEnabled: false,
    httpServerDisabled: false,
    studioEnabled: false,
    ...overrides,
  };
}

describe("Flowcordia release runtime identity", () => {
  it("accepts one exact web runtime without exposing configuration values", () => {
    const identity = presentFlowcordiaReleaseRuntimeIdentity(input());

    expect(identity).toMatchObject({
      schemaVersion: "0.1",
      state: "READY",
      releaseId: "flowcordia-0.1.0-rc.1",
      version: "0.1.0-rc.1",
      component: "web",
      applicationCommitSha: APPLICATION_SHA,
      upstreamCommitSha: UPSTREAM_SHA,
      imageDigest: IMAGE_DIGEST,
      migrationCount: 2,
    });
    expect(identity.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(identity)).not.toContain("ghcr.io");
  });

  it("accepts one isolated operations-worker process mode", () => {
    expect(
      presentFlowcordiaReleaseRuntimeIdentity(
        input({
          component: "operations_worker",
          workerEnabled: true,
          httpServerDisabled: true,
          studioEnabled: false,
        })
      )
    ).toMatchObject({ state: "READY", component: "operations_worker" });
  });

  it("rejects manifest, application, image, and runtime drift", () => {
    expect(() =>
      presentFlowcordiaReleaseRuntimeIdentity(input({ expectedManifestSha256: "d".repeat(64) }))
    ).toThrow("does not match the deployment digest");

    expect(() =>
      presentFlowcordiaReleaseRuntimeIdentity(
        input({ applicationCommitSha: "fedcba9876543210fedcba9876543210fedcba98" })
      )
    ).toThrow("application revision does not match");

    expect(() =>
      presentFlowcordiaReleaseRuntimeIdentity(input({ imageDigest: "e".repeat(64) }))
    ).toThrow("does not match the release image");

    expect(() => presentFlowcordiaReleaseRuntimeIdentity(input({ nodeVersion: "22.0.0" }))).toThrow(
      "Node.js version does not match"
    );
  });

  it("rejects mixed web and operations-worker process roles", () => {
    expect(() => presentFlowcordiaReleaseRuntimeIdentity(input({ workerEnabled: true }))).toThrow(
      "web releases must serve HTTP with proposal operations disabled"
    );

    expect(() =>
      presentFlowcordiaReleaseRuntimeIdentity(
        input({
          component: "operations_worker",
          workerEnabled: true,
          httpServerDisabled: false,
        })
      )
    ).toThrow("operations-worker releases must disable HTTP and Studio");

    expect(() =>
      presentFlowcordiaReleaseRuntimeIdentity(
        input({
          component: "operations_worker",
          workerEnabled: true,
          httpServerDisabled: true,
          studioEnabled: true,
        })
      )
    ).toThrow("operations-worker releases must disable HTTP and Studio");
  });

  it("rejects invalid component and placeholder deployment identity", () => {
    expect(() =>
      presentFlowcordiaReleaseRuntimeIdentity(input({ component: "scheduler" }))
    ).toThrow("component is invalid");
    expect(() =>
      presentFlowcordiaReleaseRuntimeIdentity(input({ applicationCommitSha: "a".repeat(40) }))
    ).toThrow("application revision is invalid");
    expect(() =>
      presentFlowcordiaReleaseRuntimeIdentity(input({ imageDigest: "sha256:abc" }))
    ).toThrow("runtime image digest is invalid");
  });
});
