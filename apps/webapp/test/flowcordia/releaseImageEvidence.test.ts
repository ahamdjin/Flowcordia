import { describe, expect, it } from "vitest";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";
import {
  createFlowcordiaReleaseImageEvidence,
  flowcordiaReleaseImageEvidenceSha256,
  parseFlowcordiaReleaseImageEvidence,
} from "../../app/features/flowcordia/operations/release-image-evidence";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const UPSTREAM_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const IMAGE_DIGEST = "a".repeat(64);

function manifest(repository = "ahamdjin/flowcordia") {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: UPSTREAM_SHA,
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    imageReference: `ghcr.io/${repository}@sha256:${IMAGE_DIGEST}`,
    migrations: [{ name: "20260101000000_initial", checksum: "b".repeat(64) }],
  });
}

function evidence(overrides: Record<string, unknown> = {}) {
  return createFlowcordiaReleaseImageEvidence({
    releaseManifest: manifest(),
    repository: "ahamdjin/flowcordia",
    runId: "29990000123",
    runAttempt: 1,
    attestationId: "123456789",
    createdAt: "2026-07-23T00:10:00.000Z",
    ...overrides,
  });
}

describe("Flowcordia release image evidence", () => {
  it("binds one verified GHCR image and official publication workflow", () => {
    expect(evidence()).toMatchObject({
      schemaVersion: "0.1",
      state: "PUBLISHED",
      releaseId: "flowcordia-0.1.0-rc.1",
      version: "0.1.0-rc.1",
      applicationCommitSha: APPLICATION_SHA,
      upstreamCommitSha: UPSTREAM_SHA,
      image: {
        name: "ghcr.io/ahamdjin/flowcordia",
        digest: IMAGE_DIGEST,
        reference: `ghcr.io/ahamdjin/flowcordia@sha256:${IMAGE_DIGEST}`,
        platform: "linux/amd64",
      },
      workflow: {
        repository: "ahamdjin/flowcordia",
        path: ".github/workflows/flowcordia-publish-self-host-image.yml",
        runId: "29990000123",
        runAttempt: 1,
        sourceRef: "refs/heads/main",
      },
      provenance: {
        attestationId: "123456789",
        predicateType: "https://slsa.dev/provenance/v1",
        signerWorkflow:
          "ahamdjin/flowcordia/.github/workflows/flowcordia-publish-self-host-image.yml",
        verified: true,
        sbom: "buildkit-spdx",
      },
    });
  });

  it("produces a deterministic digest over the bounded evidence", () => {
    const result = evidence();
    expect(result.evidenceSha256).toBe(
      flowcordiaReleaseImageEvidenceSha256({
        schemaVersion: result.schemaVersion,
        state: result.state,
        releaseId: result.releaseId,
        version: result.version,
        applicationCommitSha: result.applicationCommitSha,
        upstreamCommitSha: result.upstreamCommitSha,
        image: result.image,
        releaseManifestSha256: result.releaseManifestSha256,
        workflow: result.workflow,
        provenance: result.provenance,
        createdAt: result.createdAt,
      })
    );
  });

  it("rejects another or malformed repository identity", () => {
    expect(() => evidence({ repository: "another/flowcordia" })).toThrow(
      "canonical GHCR repository and digest"
    );
    expect(() =>
      createFlowcordiaReleaseImageEvidence({
        releaseManifest: manifest(),
        repository: "Ahmadjin/Flowcordia",
        runId: "1",
        runAttempt: 1,
        attestationId: "2",
        createdAt: "2026-07-23T00:10:00.000Z",
      })
    ).toThrow("repository identity is invalid");
  });

  it("rejects missing workflow and attestation identity", () => {
    expect(() => evidence({ runId: "0" })).toThrow("workflow run ID is invalid");
    expect(() => evidence({ runAttempt: 0 })).toThrow("workflow attempt is invalid");
    expect(() => evidence({ attestationId: "attestation-1" })).toThrow("attestation ID is invalid");
  });

  it("rejects non-canonical timestamps and does not project sensitive values", () => {
    expect(() => evidence({ createdAt: "2026-07-23" })).toThrow("publication time is invalid");
    const serialized = JSON.stringify(evidence());
    for (const forbidden of [
      "token",
      "secret",
      "password",
      "payload",
      "browser",
      "metadata-file",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("parses exact published evidence and rejects rewritten nested identity", () => {
    const release = manifest();
    const result = evidence();
    expect(parseFlowcordiaReleaseImageEvidence(result, release)).toEqual(result);
    expect(() =>
      parseFlowcordiaReleaseImageEvidence({
        ...result,
        workflow: { ...result.workflow, sourceRef: "refs/heads/feature" },
      })
    ).toThrow("source ref is invalid");
    expect(() =>
      parseFlowcordiaReleaseImageEvidence({
        ...result,
        evidenceSha256: "f".repeat(64),
      })
    ).toThrow("digest is invalid");
  });
});
