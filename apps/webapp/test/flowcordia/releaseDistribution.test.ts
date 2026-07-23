import { describe, expect, it } from "vitest";
import {
  createFlowcordiaReleaseDistributionManifest,
  parseFlowcordiaReleaseDistributionManifest,
} from "../../app/features/flowcordia/operations/release-distribution";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const UPSTREAM_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const IMAGE_DIGEST = "a".repeat(64);
const IMAGE_REFERENCE = `ghcr.io/ahamdjin/flowcordia@sha256:${IMAGE_DIGEST}`;
const MIGRATIONS = [
  { name: "20260101000000_initial", checksum: "b".repeat(64) },
  { name: "20260102000000_release_identity", checksum: "c".repeat(64) },
] as const;

function manifest() {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: UPSTREAM_SHA,
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    imageReference: IMAGE_REFERENCE,
    migrations: MIGRATIONS,
  });
}

describe("Flowcordia release distribution manifest", () => {
  it("binds one immutable image and exact application revision across web and worker", () => {
    const result = manifest();

    expect(result.schemaVersion).toBe("0.1");
    expect(result.kind).toBe("flowcordia-self-host-release");
    expect(result.image).toEqual({ reference: IMAGE_REFERENCE, digest: IMAGE_DIGEST });
    expect(result.runtime).toEqual({ node: "20.20.2", pnpm: "10.33.2" });
    expect(result.components).toEqual([
      { name: "web", applicationCommitSha: APPLICATION_SHA, imageDigest: IMAGE_DIGEST },
      {
        name: "operations_worker",
        applicationCommitSha: APPLICATION_SHA,
        imageDigest: IMAGE_DIGEST,
      },
    ]);
    expect(result.migrations.count).toBe(2);
    expect(result.migrations.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parseFlowcordiaReleaseDistributionManifest(result)).toEqual(result);
  });

  it("produces one deterministic canonical digest for identical release inputs", () => {
    expect(manifest().manifestSha256).toBe(manifest().manifestSha256);
  });

  it("rejects mutable image tags", () => {
    expect(() =>
      createFlowcordiaReleaseDistributionManifest({
        releaseId: "flowcordia-0.1.0-rc.1",
        version: "0.1.0-rc.1",
        applicationCommitSha: APPLICATION_SHA,
        upstreamCommitSha: UPSTREAM_SHA,
        createdAt: new Date("2026-07-23T00:00:00.000Z"),
        imageReference: "ghcr.io/ahamdjin/flowcordia:0.1.0-rc.1",
        migrations: MIGRATIONS,
      })
    ).toThrow("immutable sha256 digest");
  });

  it("rejects unordered or rewritten migration inventory", () => {
    expect(() =>
      createFlowcordiaReleaseDistributionManifest({
        releaseId: "flowcordia-0.1.0-rc.1",
        version: "0.1.0-rc.1",
        applicationCommitSha: APPLICATION_SHA,
        upstreamCommitSha: UPSTREAM_SHA,
        createdAt: new Date("2026-07-23T00:00:00.000Z"),
        imageReference: IMAGE_REFERENCE,
        migrations: [...MIGRATIONS].reverse(),
      })
    ).toThrow("complete, unique, ordered, and checksum-bound");
  });

  it("rejects mixed component image or application identity", () => {
    const result = manifest();
    const tampered = structuredClone(result);
    tampered.components[1]!.imageDigest = "d".repeat(64);

    expect(() => parseFlowcordiaReleaseDistributionManifest(tampered)).toThrow(
      "Every release component must use the exact application revision and immutable image digest"
    );
  });

  it("rejects unexpected or sensitive manifest fields", () => {
    const tampered = { ...manifest(), secret: "must-not-enter-release-manifests" };

    expect(() => parseFlowcordiaReleaseDistributionManifest(tampered)).toThrow(
      "Release manifest has unexpected fields"
    );
  });

  it("rejects unsupported runtime identity and canonical digest tampering", () => {
    const runtimeTampered = structuredClone(manifest()) as unknown as {
      runtime: { node: string; pnpm: string };
    };
    runtimeTampered.runtime.node = "22.0.0";
    expect(() => parseFlowcordiaReleaseDistributionManifest(runtimeTampered)).toThrow(
      "supported FlowCordia toolchain"
    );

    const digestTampered = structuredClone(manifest());
    digestTampered.manifestSha256 = "e".repeat(64);
    expect(() => parseFlowcordiaReleaseDistributionManifest(digestTampered)).toThrow(
      "canonical content"
    );
  });
});
