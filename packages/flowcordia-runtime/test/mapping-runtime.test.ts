import type { JsonObject, WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  compileWorkflowToTriggerTask,
  createPreviewRuntimeAdapters,
  executeFlowcordiaWorkflow,
} from "../src/index.js";

function workflow(configuration: JsonObject): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "mapping_contract",
    name: "Mapping contract",
    nodes: [
      {
        id: "start",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "map_data",
        kind: "control",
        operation: "data.map",
        position: { x: 240, y: 0 },
        configuration,
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 480, y: 0 },
        configuration: {},
      },
    ],
    edges: [
      { id: "start_to_map", source: "start", target: "map_data" },
      { id: "map_to_output", source: "map_data", target: "output" },
    ],
  };
}

const configuration = {
  mode: "replace",
  entries: [
    { target: "customer.email", source: "contact.email", required: true },
    { target: "customer.plan", value: "pro" },
  ],
} satisfies JsonObject;

describe("Flowcordia mapped workflow runtime", () => {
  it("executes the same deterministic mapper during structural preview", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(configuration),
      { contact: { email: "person@example.com" } },
      createPreviewRuntimeAdapters()
    );
    expect(result).toMatchObject({
      success: true,
      output: { customer: { email: "person@example.com", plan: "pro" } },
    });
  });

  it("returns a bounded node failure for a missing required source", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(configuration),
      {},
      createPreviewRuntimeAdapters()
    );
    expect(result).toMatchObject({ success: false, failedNodeId: "map_data" });
    expect(result.traces.at(-1)?.message).toBe(
      'Required mapping source "contact.email" is unavailable.'
    );
  });

  it("serializes the reviewed mapping into generated Trigger.dev code", () => {
    const result = compileWorkflowToTriggerTask(workflow(configuration));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artifact.source).toContain('"operation": "data.map"');
    expect(result.artifact.source).toContain('"target": "customer.email"');
    expect(result.artifact.source).not.toContain("eval(");
    expect(result.artifact.source).not.toContain("new Function");
  });

  it("rejects unsafe mapping configuration before code generation", () => {
    const result = compileWorkflowToTriggerTask(
      workflow({
        mode: "replace",
        entries: [{ target: "__proto__.admin", value: true }],
      })
    );
    expect(result).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: "invalid_configuration", nodeId: "map_data" })],
    });
  });
});
