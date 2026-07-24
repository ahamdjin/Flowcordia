import { describe, expect, it } from "vitest";
import type { JsonObject, WorkflowDefinition } from "@flowcordia/workflow";
import {
  compileWorkflowToTriggerTask,
  createPreviewRuntimeAdapters,
  createTriggerRuntimeAdapters,
  executeFlowcordiaWorkflow,
} from "../src/index.js";

function workflow(configuration: JsonObject): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "parent-workflow",
    name: "Parent workflow",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "child",
        kind: "subflow",
        operation: "subflow.invoke",
        position: { x: 200, y: 0 },
        configuration,
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
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
      { id: "trigger-child", source: "trigger", target: "child" },
      { id: "child-output", source: "child", target: "output" },
    ],
  };
}

describe("Flowcordia composable subflows", () => {
  it("previews one typed child invocation without side effects", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow({ workflowId: "child-workflow", mode: "single" }),
      { orderId: "order_1" },
      createPreviewRuntimeAdapters({ subflowOutputs: { child: { accepted: true } } })
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ accepted: true });
    expect(result.traces.find((trace) => trace.nodeId === "child")?.status).toBe("SUCCEEDED");
  });

  it("fans out a bounded array through one runtime adapter call", async () => {
    const invocations: unknown[] = [];
    const adapters = createTriggerRuntimeAdapters({
      wait: async () => undefined,
      authorizeHttp: () => true,
      invokeSubflow: async (input) => {
        invocations.push(input);
        return input.payloads.map((payload) => ({ payload, completed: true }));
      },
    });
    const result = await executeFlowcordiaWorkflow(
      workflow({
        workflowId: "child-workflow",
        mode: "batch",
        itemsPath: "orders",
        maxItems: 3,
      }),
      { orders: [{ id: 1 }, { id: 2 }] },
      adapters
    );

    expect(result.success).toBe(true);
    expect(invocations).toEqual([
      {
        taskId: "flowcordia-child-workflow",
        payloads: [{ id: 1 }, { id: 2 }],
      },
    ]);
    expect(result.output).toEqual([
      { payload: { id: 1 }, completed: true },
      { payload: { id: 2 }, completed: true },
    ]);
  });

  it("projects subflow schema failures with an accurate boundary label", async () => {
    const invalid = workflow({ workflowId: "child-workflow", mode: "single" });
    invalid.nodes[1]!.inputSchema = {
      type: "object",
      required: ["orderId"],
      properties: { orderId: { type: "string" } },
    };
    const result = await executeFlowcordiaWorkflow(
      invalid,
      { unexpected: true },
      createPreviewRuntimeAdapters()
    );

    expect(result.success).toBe(false);
    expect(result.traces.at(-1)?.message).toContain("Subflow input failed schema validation");
    expect(result.traces.at(-1)?.message).not.toContain("Function input");
  });

  it("fails closed when fan-out exceeds its reviewed limit", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow({
        workflowId: "child-workflow",
        mode: "batch",
        itemsPath: "orders",
        maxItems: 1,
      }),
      { orders: [{ id: 1 }, { id: 2 }] },
      createPreviewRuntimeAdapters()
    );

    expect(result.success).toBe(false);
    expect(result.failedNodeId).toBe("child");
    expect(result.traces.at(-1)?.message).toContain("1-item limit");
  });

  it("generates native version-locked batch waits without Promise parallelism", () => {
    const result = compileWorkflowToTriggerTask(
      workflow({ workflowId: "child-workflow", mode: "single" })
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.artifact.source).toContain("batch.triggerAndWait");
    expect(result.artifact.source).toContain("{ id: taskId, payload }");
    expect(result.artifact.source).not.toContain("Promise.all");
    expect(result.artifact.source).not.toContain("run.error");
  });

  it("rejects direct recursive invocation", () => {
    const result = compileWorkflowToTriggerTask(
      workflow({ workflowId: "parent-workflow", mode: "single" })
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues[0]?.message).toContain("cannot invoke itself");
  });
});
