import { describe, expect, it, vi } from "vitest";
import type { FlowcordiaApprovalResult } from "@flowcordia/workflow";
import {
  FlowcordiaApprovalDecisionError,
  decideFlowcordiaApproval,
  type FlowcordiaApprovalDecisionDependencies,
  type FlowcordiaApprovalDecisionReservation,
  type FlowcordiaApprovalTarget,
} from "~/features/flowcordia/workflows/approval/decision";

const now = new Date("2026-07-24T21:00:00.000Z");

function target(overrides: Partial<FlowcordiaApprovalTarget> = {}): FlowcordiaApprovalTarget {
  return {
    internalWaitpointId: "wp_internal",
    waitpointId: "waitpoint_public",
    workflowId: "approval-workflow",
    runId: "run_123",
    nodeId: "approval",
    prompt: "Approve this order?",
    instruction: "Check the amount.",
    requireComment: false,
    timeoutAt: "2026-07-25T21:00:00.000Z",
    status: "PENDING",
    createdAt: now,
    output: null,
    outputType: "application/json",
    outputIsError: false,
    ...overrides,
  };
}

function dependencies(overrides: Partial<FlowcordiaApprovalDecisionDependencies> = {}) {
  let observed: FlowcordiaApprovalResult = {
    decision: "approved",
    comment: null,
    decidedAt: now.toISOString(),
  };
  const reservation: FlowcordiaApprovalDecisionReservation = {
    ...target(),
    requestId: "00000000-0000-4000-8000-000000000001",
    status: "PENDING",
    decision: "approved",
    comment: null,
    decidedAt: now.toISOString(),
    decidedByUserId: "user_1",
  };
  const result: FlowcordiaApprovalDecisionDependencies = {
    now: () => now,
    loadTarget: vi.fn(async () => target()),
    reserve: vi.fn(async () => reservation),
    complete: vi.fn(async ({ result }) => {
      observed = result;
    }),
    reload: vi.fn(async () => ({
      status: "COMPLETED",
      output: JSON.stringify(observed),
      outputType: "application/json",
      outputIsError: false,
    })),
    markCompleted: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    ...overrides,
  };
  return result;
}

const command = {
  waitpointId: "waitpoint_public",
  expectedWorkflowId: "approval-workflow",
  expectedRunId: "run_123",
  expectedNodeId: "approval",
  requestId: "00000000-0000-4000-8000-000000000001",
  decision: "approved" as const,
  comment: null,
  userId: "user_1",
};

describe("Flowcordia approval decision fencing", () => {
  it("completes and verifies the exact reserved decision", async () => {
    const deps = dependencies();
    const result = await decideFlowcordiaApproval(command, deps);
    expect(result).toMatchObject({ status: "completed", idempotent: false });
    expect(deps.complete).toHaveBeenCalledOnce();
    expect(deps.markCompleted).toHaveBeenCalledOnce();
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("requires a bounded comment when the workflow contract requires one", async () => {
    const deps = dependencies({ loadTarget: vi.fn(async () => target({ requireComment: true })) });
    await expect(decideFlowcordiaApproval(command, deps)).rejects.toMatchObject({
      code: "approval_comment_required",
      status: 400,
    });
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it("rejects a competing request before completing the waitpoint", async () => {
    const deps = dependencies({
      reserve: vi.fn(async () => ({
        ...target(),
        requestId: "00000000-0000-4000-8000-000000000099",
        status: "PENDING",
        decision: "rejected",
        comment: "Another reviewer claimed this.",
        decidedAt: now.toISOString(),
        decidedByUserId: "user_2",
      })),
    });
    await expect(decideFlowcordiaApproval(command, deps)).rejects.toMatchObject({
      code: "approval_conflict",
      status: 409,
    });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("recovers the same request after the waitpoint completed but before the receipt finalized", async () => {
    const deps = dependencies({ loadTarget: vi.fn(async () => target({ status: "COMPLETED" })) });
    const result = await decideFlowcordiaApproval(command, deps);
    expect(result.idempotent).toBe(false);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.markCompleted).toHaveBeenCalledOnce();
  });

  it("fails closed when authoritative output differs from the reservation", async () => {
    const deps = dependencies({
      reload: vi.fn(async () => ({
        status: "COMPLETED",
        output: JSON.stringify({
          decision: "rejected",
          comment: null,
          decidedAt: now.toISOString(),
        }),
        outputType: "application/json",
        outputIsError: false,
      })),
    });
    await expect(decideFlowcordiaApproval(command, deps)).rejects.toBeInstanceOf(
      FlowcordiaApprovalDecisionError
    );
    expect(deps.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ code: "authoritative_decision_mismatch" })
    );
  });
});
