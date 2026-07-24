import { describe, expect, it } from "vitest";
import {
  normalizeFlowcordiaApprovalComment,
  parseFlowcordiaApprovalRunMetadata,
  parseStoredFlowcordiaApprovalResult,
} from "~/features/flowcordia/workflows/approval/contract";

describe("Flowcordia approval inbox contracts", () => {
  it("accepts only the exact current approval identity", () => {
    const metadata = JSON.stringify({
      flowcordiaApproval: {
        schemaVersion: "0.1",
        state: "WAITING",
        waitpointId: "waitpoint_public",
        workflowId: "approval-workflow",
        runId: "run_123",
        nodeId: "approval",
        prompt: "Approve this order?",
        instruction: "Check the amount.",
        requireComment: true,
        timeoutAt: "2026-07-25T21:00:00.000Z",
      },
    });
    expect(
      parseFlowcordiaApprovalRunMetadata({
        metadata,
        waitpointId: "waitpoint_public",
        runId: "run_123",
      })
    ).toMatchObject({ workflowId: "approval-workflow", requireComment: true });
    expect(
      parseFlowcordiaApprovalRunMetadata({
        metadata,
        waitpointId: "waitpoint_other",
        runId: "run_123",
      })
    ).toBeNull();
  });

  it("rejects callback or token fields hidden inside run metadata", () => {
    const metadata = JSON.stringify({
      flowcordiaApproval: {
        schemaVersion: "0.1",
        state: "WAITING",
        waitpointId: "waitpoint_public",
        workflowId: "approval-workflow",
        runId: "run_123",
        nodeId: "approval",
        prompt: "Approve?",
        instruction: "",
        requireComment: false,
        timeoutAt: "2026-07-25T21:00:00.000Z",
        publicAccessToken: "secret",
      },
    });
    expect(
      parseFlowcordiaApprovalRunMetadata({
        metadata,
        waitpointId: "waitpoint_public",
        runId: "run_123",
      })
    ).toBeNull();
  });

  it("parses only strict inline JSON completion output", () => {
    expect(
      parseStoredFlowcordiaApprovalResult({
        status: "COMPLETED",
        output: JSON.stringify({
          decision: "approved",
          comment: null,
          decidedAt: "2026-07-24T21:00:00.000Z",
        }),
        outputType: "application/json",
        outputIsError: false,
      })
    ).toMatchObject({ success: true });
    expect(
      parseStoredFlowcordiaApprovalResult({
        status: "COMPLETED",
        output: "{}",
        outputType: "application/store",
        outputIsError: false,
      }).success
    ).toBe(false);
  });

  it("normalizes blank comments without inventing audit text", () => {
    expect(normalizeFlowcordiaApprovalComment("   ")).toBeNull();
    expect(normalizeFlowcordiaApprovalComment("  checked  ")).toBe("checked");
  });
});
