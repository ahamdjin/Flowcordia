import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import {
  compileWorkflowToTriggerTask,
  createPreviewRuntimeAdapters,
  createTriggerRuntimeAdapters,
  executeFlowcordiaWorkflow,
} from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "approval-workflow",
    name: "Approval workflow",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "approval",
        kind: "approval",
        operation: "approval.human",
        position: { x: 200, y: 0 },
        configuration: {
          prompt: "Approve this order?",
          instruction: "Check the amount.",
          timeoutSeconds: 3_600,
          requireComment: true,
        },
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 400, y: 0 },
        configuration: {},
      },
    ],
    edges: [
      { id: "trigger-approval", source: "trigger", target: "approval" },
      { id: "approval-output", source: "approval", target: "output" },
    ],
  };
}

describe("Flowcordia durable human approval runtime", () => {
  it("simulates one strict approval result without creating a live waitpoint", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { orderId: "order_1" },
      createPreviewRuntimeAdapters()
    );
    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      decision: "approved",
      comment: null,
      decidedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(result.traces[1]?.message).toContain("simulated");
  });

  it("returns the exact live decision through the runtime adapter", async () => {
    const adapters = createTriggerRuntimeAdapters({
      wait: async () => undefined,
      authorizeHttp: () => true,
      approval: async () => ({
        decision: "rejected",
        comment: "Amount is incorrect.",
        decidedAt: "2026-07-24T20:00:00.000Z",
      }),
    });
    const result = await executeFlowcordiaWorkflow(workflow(), {}, adapters);
    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({ decision: "rejected" });
  });

  it("fails closed on malformed live approval output", async () => {
    const adapters = createTriggerRuntimeAdapters({
      wait: async () => undefined,
      authorizeHttp: () => true,
      approval: async () => ({ decision: "approved" }) as never,
    });
    const result = await executeFlowcordiaWorkflow(workflow(), {}, adapters);
    expect(result.success).toBe(false);
    expect(result.failedNodeId).toBe("approval");
  });

  it("generates an idempotent MANUAL waitpoint per exact run and node", () => {
    const result = compileWorkflowToTriggerTask(workflow());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artifact.source).toContain("wait.createToken");
    expect(result.artifact.source).toContain("wait.forToken");
    expect(result.artifact.source).toContain("ctx.run.id");
    expect(result.artifact.source).toContain(
      "flowcordia-approval:${workflow.id}:${flowcordiaRunId}:${node.id}"
    );
    expect(result.artifact.source).toContain('tags: ["flowcordia:approval"]');
    expect(result.artifact.source).toContain('metadata.set("flowcordiaApproval"');
    expect(result.artifact.source).not.toContain("publicAccessToken");
    expect(result.artifact.source).not.toContain("token.url");
  });
});
