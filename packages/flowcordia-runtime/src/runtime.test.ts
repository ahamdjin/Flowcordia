import { createStudioV2SourceNode, type WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { createPreviewRuntimeAdapters, executeFlowcordiaWorkflow } from "./runtime";

function goldenWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "golden-workflow",
    name: "Golden workflow",
    nodes: [
      {
        id: "manual",
        name: "Manual",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      createStudioV2SourceNode({
        id: "source",
        position: { x: 240, y: 0 },
      }),
      {
        id: "condition",
        name: "Approved?",
        kind: "control",
        operation: "control.condition",
        position: { x: 480, y: 0 },
        configuration: { path: "approved", operator: "equals", value: true },
      },
      {
        id: "approved",
        name: "Approved output",
        kind: "output",
        operation: "output.return",
        position: { x: 720, y: -80 },
        configuration: {},
      },
      {
        id: "rejected",
        name: "Rejected output",
        kind: "output",
        operation: "output.return",
        position: { x: 720, y: 80 },
        configuration: {},
      },
    ],
    edges: [
      { id: "manual-source", source: "manual", target: "source" },
      { id: "source-condition", source: "source", target: "condition" },
      {
        id: "condition-approved",
        source: "condition",
        target: "approved",
        sourceHandle: "true",
        condition: "true",
      },
      {
        id: "condition-rejected",
        source: "condition",
        target: "rejected",
        sourceHandle: "false",
        condition: "false",
      },
    ],
    metadata: {},
  };
}

describe("executeFlowcordiaWorkflow", () => {
  it("returns bounded per-node input/output traces for the selected branch", async () => {
    const result = await executeFlowcordiaWorkflow(
      goldenWorkflow(),
      { requestId: "request-1" },
      createPreviewRuntimeAdapters({
        sourceMocks: { source: { approved: true, requestId: "request-1" } },
      }),
      { includeTraceInput: true, environment: "test", runId: "run-1" }
    );

    expect(result.success).toBe(true);
    expect(result).toMatchObject({ runId: "run-1" });
    expect(result.output).toEqual({ approved: true, requestId: "request-1" });
    expect(result.traces.map(({ nodeId, status }) => ({ nodeId, status }))).toEqual([
      { nodeId: "manual", status: "SUCCEEDED" },
      { nodeId: "source", status: "SUCCEEDED" },
      { nodeId: "condition", status: "SUCCEEDED" },
      { nodeId: "approved", status: "SUCCEEDED" },
      { nodeId: "rejected", status: "SKIPPED" },
    ]);
    expect(result.traces.find(({ nodeId }) => nodeId === "source")?.input).toEqual({
      requestId: "request-1",
    });
    expect(result.traces.find(({ nodeId }) => nodeId === "condition")?.output).toEqual({
      approved: true,
      requestId: "request-1",
    });
    for (const trace of result.traces) {
      expect(trace.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(Date.parse(trace.startedAt))).toBe(false);
      expect(Number.isNaN(Date.parse(trace.completedAt))).toBe(false);
    }
  });

  it("stops at the failed node and retains the input that caused the failure", async () => {
    const adapters = createPreviewRuntimeAdapters();
    adapters.source = async () => {
      throw new Error("Source failed deliberately.");
    };

    const result = await executeFlowcordiaWorkflow(
      goldenWorkflow(),
      { requestId: "request-2" },
      adapters,
      { includeTraceInput: true }
    );

    expect(result).toMatchObject({
      success: false,
      failedNodeId: "source",
      output: null,
    });
    expect(result.traces.at(-1)).toMatchObject({
      nodeId: "source",
      status: "FAILED",
      input: { requestId: "request-2" },
      message: "Source failed deliberately.",
    });
  });

  it("returns a traceable cancellation instead of rejecting without a result", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Cancelled by operator."));

    const result = await executeFlowcordiaWorkflow(
      goldenWorkflow(),
      { requestId: "request-3" },
      createPreviewRuntimeAdapters(),
      { signal: controller.signal, runId: "run-3", attempt: 1 }
    );

    expect(result).toMatchObject({
      success: false,
      cancelled: true,
      failedNodeId: "manual",
      runId: "run-3",
      attempt: 1,
    });
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0]).toMatchObject({
      nodeId: "manual",
      status: "CANCELLED",
      message: "Cancelled by operator.",
    });
  });
});
