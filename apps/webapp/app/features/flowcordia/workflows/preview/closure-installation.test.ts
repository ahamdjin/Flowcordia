import { describe, expect, it } from "vitest";
import {
  evaluateFlowcordiaPreviewClosureInstallation,
  resolveFlowcordiaPreviewClosureExpectation,
} from "./closure-installation";

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    workflowId: "root",
    closureSchemaVersion: "0.1",
    closureDigest: "a".repeat(64),
    closureWorkflowIds: ["child", "root"],
    ...overrides,
  };
}

describe("Flowcordia preview closure installation", () => {
  it("proves every expected workflow on the exact worker while ignoring unrelated tasks", () => {
    expect(
      evaluateFlowcordiaPreviewClosureInstallation({
        proposal: proposal(),
        installedTaskIdentifiers: ["flowcordia-child", "flowcordia-root", "unrelated-task"],
      })
    ).toEqual({
      state: "READY",
      schemaVersion: "0.1",
      digest: "a".repeat(64),
      expectedCount: 2,
      installedCount: 2,
      missingWorkflowIds: [],
    });
  });

  it("reports bounded missing workflow IDs", () => {
    expect(
      evaluateFlowcordiaPreviewClosureInstallation({
        proposal: proposal(),
        installedTaskIdentifiers: ["flowcordia-root"],
      })
    ).toMatchObject({
      state: "WAITING",
      installedCount: 1,
      missingWorkflowIds: ["child"],
    });
  });

  it("fails closed on duplicate expected tasks", () => {
    expect(
      evaluateFlowcordiaPreviewClosureInstallation({
        proposal: proposal(),
        installedTaskIdentifiers: ["flowcordia-child", "flowcordia-child", "flowcordia-root"],
      }).state
    ).toBe("INVALID");
  });

  it("distinguishes legacy unrecorded and malformed closure identity", () => {
    expect(
      resolveFlowcordiaPreviewClosureExpectation(
        proposal({
          closureSchemaVersion: null,
          closureDigest: null,
          closureWorkflowIds: [],
        })
      )
    ).toMatchObject({ success: false, proof: { state: "NOT_RECORDED" } });
    expect(
      resolveFlowcordiaPreviewClosureExpectation(
        proposal({ closureWorkflowIds: ["root", "child"] })
      )
    ).toMatchObject({ success: false, proof: { state: "INVALID" } });
  });
});
