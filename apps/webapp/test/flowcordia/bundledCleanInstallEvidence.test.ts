import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW,
  parseFlowcordiaBundledCleanInstallEvidence,
} from "../../app/features/flowcordia/operations/bundled-clean-install";

const APPLICATION_SHA = "a".repeat(40);

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "0.1",
    kind: "flowcordia-bundled-clean-install",
    result: "READY",
    phase: "complete",
    cleanup: "READY",
    source: {
      runId: "90",
      runAttempt: 1,
      workflowPath: FLOWCORDIA_BUNDLED_CLEAN_INSTALL_WORKFLOW,
      sourceCommitSha: APPLICATION_SHA,
    },
    publicationRunId: "80",
    releaseId: "flowcordia-0.5.0",
    applicationCommitSha: APPLICATION_SHA,
    applicationManifestSha256: "1".repeat(64),
    applicationImageDigest: "2".repeat(64),
    bundledManifestSha256: "3".repeat(64),
    compatibilityVersion: 1,
    startedAt: "2026-07-20T14:00:00.000Z",
    completedAt: "2026-07-20T14:30:00.000Z",
    ...overrides,
  };
}

describe("Flowcordia bundled clean-install evidence", () => {
  it("accepts one complete exact-source READY artifact", () => {
    expect(parseFlowcordiaBundledCleanInstallEvidence(evidence())).toEqual(evidence());
  });

  it("rejects failed cleanup, missing source, and mutable identity", () => {
    expect(() =>
      parseFlowcordiaBundledCleanInstallEvidence(evidence({ cleanup: "BLOCKED" }))
    ).toThrow("not READY");
    expect(() =>
      parseFlowcordiaBundledCleanInstallEvidence(evidence({ source: undefined }))
    ).toThrow();
    expect(() =>
      parseFlowcordiaBundledCleanInstallEvidence(
        evidence({ bundledManifestSha256: "latest" })
      )
    ).toThrow();
  });

  it("rejects another workflow, application revision, or invalid chronology", () => {
    expect(() =>
      parseFlowcordiaBundledCleanInstallEvidence(
        evidence({
          source: {
            runId: "90",
            runAttempt: 1,
            workflowPath: ".github/workflows/other.yml",
            sourceCommitSha: APPLICATION_SHA,
          },
        })
      )
    ).toThrow();
    expect(() =>
      parseFlowcordiaBundledCleanInstallEvidence(evidence({ applicationCommitSha: "main" }))
    ).toThrow();
    expect(() =>
      parseFlowcordiaBundledCleanInstallEvidence(
        evidence({ completedAt: "2026-07-20T13:59:59.000Z" })
      )
    ).toThrow("chronology");
  });
});
