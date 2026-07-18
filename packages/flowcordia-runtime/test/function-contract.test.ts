import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it, vi } from "vitest";
import {
  compileWorkflowToTriggerTask,
  createPreviewRuntimeAdapters,
  createTriggerRuntimeAdapters,
  executeFlowcordiaWorkflow,
  type FlowcordiaCodeHandler,
} from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "typed_function",
    name: "Typed function",
    nodes: [
      {
        id: "manual_trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "function_qualify",
        kind: "code",
        operation: "code.task",
        position: { x: 280, y: 0 },
        configuration: { functionId: "qualify_lead" },
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["leadId"],
          properties: { leadId: { type: "string", minLength: 1 } },
        },
        outputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["qualified"],
          properties: { qualified: { type: "boolean" } },
        },
        codeReference: { path: "src/functions/qualifyLead.ts", exportName: "qualifyLead" },
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 560, y: 0 },
        configuration: {},
      },
    ],
    edges: [
      {
        id: "trigger_to_function",
        source: "manual_trigger",
        target: "function_qualify",
      },
      {
        id: "function_to_output",
        source: "function_qualify",
        target: "output",
      },
    ],
  };
}

function liveAdapters(handler: FlowcordiaCodeHandler) {
  return createTriggerRuntimeAdapters({
    codeHandlers: { function_qualify: handler },
    wait: async () => undefined,
    authorizeHttp: () => true,
  });
}

describe("repository function runtime contract", () => {
  it("validates input before invoking repository code", async () => {
    const handler = vi.fn(async () => ({ qualified: true }));
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { wrong: "shape" },
      liveAdapters(handler)
    );

    expect(result).toMatchObject({
      success: false,
      failedNodeId: "function_qualify",
      traces: expect.arrayContaining([
        expect.objectContaining({
          nodeId: "function_qualify",
          status: "FAILED",
          message: expect.stringContaining("input failed schema validation"),
        }),
      ]),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("validates repository output before downstream nodes receive it", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { leadId: "lead_123" },
      liveAdapters(async () => ({ qualified: "yes" }))
    );

    expect(result).toMatchObject({
      success: false,
      failedNodeId: "function_qualify",
      traces: expect.arrayContaining([
        expect.objectContaining({
          nodeId: "function_qualify",
          status: "FAILED",
          message: expect.stringContaining("output failed schema validation"),
        }),
      ]),
    });
  });

  it("uses an exact node-scoped repository fixture mock during structural preview", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { leadId: "lead_123" },
      createPreviewRuntimeAdapters({
        codeMocks: { function_qualify: { qualified: true } },
      })
    );

    expect(result).toMatchObject({
      success: true,
      output: { qualified: true },
      traces: expect.arrayContaining([
        expect.objectContaining({
          nodeId: "function_qualify",
          status: "SUCCEEDED",
          output: { qualified: true },
        }),
      ]),
    });
  });

  it("uses a schema-shaped structural preview without executing repository code", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { leadId: "lead_123" },
      createPreviewRuntimeAdapters()
    );

    expect(result).toMatchObject({
      success: true,
      output: { qualified: false },
      traces: expect.arrayContaining([
        expect.objectContaining({
          nodeId: "function_qualify",
          status: "SUCCEEDED",
          output: { qualified: false },
        }),
      ]),
    });
  });

  it("generates an exact-version validation task from the same static import", () => {
    const result = compileWorkflowToTriggerTask(workflow());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artifact.validationTaskId).toBe("flowcordia-validate-typed_function");
    expect(result.artifact.source).toContain(
      'id: "flowcordia-validate-typed_function"'
    );
    expect(result.artifact.source).toContain("executeFlowcordiaFunctionValidationSuite");
    expect(result.artifact.source).toContain(
      '"qualify_lead": {\n    inputSchema:'
    );
    expect(result.artifact.source).toContain("handler: flowcordiaCode0Handler");
    expect(result.artifact.source).toContain('metadata.set("flowcordiaValidation"');
    expect(result.artifact.source).not.toContain("mockOutput");
    expect(result.artifact.source).not.toContain("fixtureId: \"qualified_lead\"");
  });
});
