import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { createPreviewRuntimeAdapters, executeFlowcordiaWorkflow } from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "callable",
    name: "Callable",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
        outputSchema: {
          type: "object",
          required: ["orderId"],
          properties: { orderId: { type: "string" } },
          additionalProperties: false,
        },
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 200, y: 0 },
        configuration: {},
        inputSchema: {
          type: "object",
          required: ["orderId"],
          properties: { orderId: { type: "string" } },
          additionalProperties: false,
        },
      },
    ],
    edges: [{ id: "trigger-output", source: "trigger", target: "output" }],
  };
}

describe("Flowcordia callable runtime boundaries", () => {
  it("enforces the trigger input contract", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { unexpected: true },
      createPreviewRuntimeAdapters()
    );
    expect(result.success).toBe(false);
    expect(result.failedNodeId).toBe("trigger");
    expect(result.traces.at(-1)?.message).toContain("Trigger input failed schema validation");
  });

  it("enforces the output return contract", async () => {
    const invalid = workflow();
    invalid.nodes[1]!.inputSchema = {
      type: "object",
      required: ["accepted"],
      properties: { accepted: { type: "boolean" } },
    };
    const result = await executeFlowcordiaWorkflow(
      invalid,
      { orderId: "order_1" },
      createPreviewRuntimeAdapters()
    );
    expect(result.success).toBe(false);
    expect(result.failedNodeId).toBe("output");
    expect(result.traces.at(-1)?.message).toContain("Output output failed schema validation");
  });
});
