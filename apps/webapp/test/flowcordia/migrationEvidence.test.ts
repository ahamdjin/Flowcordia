import { describe, expect, it } from "vitest";
import {
  createFlowcordiaMigrationCompletionEvidence,
  flowcordiaMigrationEvidenceSha256,
  parseFlowcordiaMigrationCompletionEvidence,
} from "../../app/features/flowcordia/operations/migration-evidence";
import { createFlowcordiaReleaseDistributionManifest } from "../../app/features/flowcordia/operations/release-distribution";

const APPLICATION_SHA = "0123456789abcdef0123456789abcdef01234567";
const IMAGE_DIGEST = "a".repeat(64);

function manifest() {
  return createFlowcordiaReleaseDistributionManifest({
    releaseId: "flowcordia-0.1.0-rc.1",
    version: "0.1.0-rc.1",
    applicationCommitSha: APPLICATION_SHA,
    upstreamCommitSha: "89abcdef0123456789abcdef0123456789abcdef",
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    imageReference: `ghcr.io/ahamdjin/flowcordia@sha256:${IMAGE_DIGEST}`,
    migrations: [{ name: "20260101000000_initial", checksum: "b".repeat(64) }],
  });
}

describe("Flowcordia migration completion evidence", () => {
  it("binds one exact release and deterministic migration inventory", () => {
    const release = manifest();
    const evidence = createFlowcordiaMigrationCompletionEvidence({
      releaseManifest: release,
      completedAt: "2026-07-23T01:00:00.000Z",
    });

    expect(parseFlowcordiaMigrationCompletionEvidence(evidence, release)).toEqual(evidence);
    expect(evidence).toMatchObject({
      schemaVersion: "0.2",
      kind: "flowcordia-self-host-migration",
      state: "COMPLETED",
      releaseId: release.releaseId,
      version: release.version,
      applicationCommitSha: APPLICATION_SHA,
      imageDigest: IMAGE_DIGEST,
      manifestSha256: release.manifestSha256,
      migrations: release.migrations,
    });
    expect(evidence.evidenceSha256).toBe(
      flowcordiaMigrationEvidenceSha256({
        schemaVersion: evidence.schemaVersion,
        kind: evidence.kind,
        state: evidence.state,
        releaseId: evidence.releaseId,
        version: evidence.version,
        applicationCommitSha: evidence.applicationCommitSha,
        imageDigest: evidence.imageDigest,
        manifestSha256: evidence.manifestSha256,
        migrations: evidence.migrations,
        completedAt: evidence.completedAt,
      })
    );
  });

  it("rejects malformed standalone identity and another release", () => {
    const release = manifest();
    const evidence = createFlowcordiaMigrationCompletionEvidence({
      releaseManifest: release,
      completedAt: "2026-07-23T01:00:00.000Z",
    });

    expect(() =>
      parseFlowcordiaMigrationCompletionEvidence({
        ...evidence,
        applicationCommitSha: "0".repeat(40),
      })
    ).toThrow("evidence is invalid");
    expect(() =>
      parseFlowcordiaMigrationCompletionEvidence(evidence, {
        ...release,
        manifestSha256: "c".repeat(64),
      })
    ).toThrow();
  });

  it("rejects rewritten migration or evidence digests", () => {
    const release = manifest();
    const evidence = createFlowcordiaMigrationCompletionEvidence({
      releaseManifest: release,
      completedAt: "2026-07-23T01:00:00.000Z",
    });

    expect(() =>
      parseFlowcordiaMigrationCompletionEvidence({
        ...evidence,
        migrations: { ...evidence.migrations, sha256: "c".repeat(64) },
      })
    ).toThrow("digest is invalid");
    expect(() =>
      parseFlowcordiaMigrationCompletionEvidence({
        ...evidence,
        evidenceSha256: "d".repeat(64),
      })
    ).toThrow("digest is invalid");
  });
});
