import { describe, expect, it } from "vitest";
import { applyWorkflowEdit } from "./editor.js";
import type { WorkflowDefinition } from "./types.js";

function referenceWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "quick_create_reference",
    name: "Quick create reference",
    nodes: [
      {
        id: "manual_trigger",
        name: "Manual trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 80, y: 80 },
        configuration: {},
        outputSchema: { type: "object" },
      },
      {
        id: "output",
        name: "Output",
        kind: "output",
        operation: "output.return",
        position: { x: 640, y: 80 },
        configuration: {},
        inputSchema: { type: "object" },
      },
    ],
    edges: [{ id: "manual_trigger_to_output", source: "manual_trigger", target: "output" }],
  };
}

describe("fast workflow creation commands", () => {
  it("adds and connects a catalog node atomically", () => {
    const result = applyWorkflowEdit(referenceWorkflow(), {
      type: "add_connected_node",
      templateId: "http_action",
      source: "manual_trigger",
      position: { x: 360, y: 240 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const created = result.workflow.nodes.find((node) => node.id === "http_action");
    expect(created?.operation).toBe("action.http");
    expect(result.workflow.edges).toContainEqual(
      expect.objectContaining({ source: "manual_trigger", target: "http_action" })
    );
  });

  it("inserts a catalog node into an existing edge in one validated edit", () => {
    const result = applyWorkflowEdit(referenceWorkflow(), {
      type: "insert_node_on_edge",
      templateId: "wait",
      edgeId: "manual_trigger_to_output",
      position: { x: 360, y: 80 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.edges).toContainEqual({
      id: "manual_trigger_to_output",
      source: "manual_trigger",
      target: "wait",
    });
    expect(result.workflow.edges).toContainEqual(
      expect.objectContaining({ source: "wait", target: "output" })
    );
  });

  it("rejects templates that cannot sit between the existing source and target", () => {
    const workflow = referenceWorkflow();
    const snapshot = structuredClone(workflow);
    const result = applyWorkflowEdit(workflow, {
      type: "insert_node_on_edge",
      templateId: "output",
      edgeId: "manual_trigger_to_output",
      position: { x: 360, y: 80 },
    });

    expect(result).toMatchObject({
      success: false,
      code: "unsupported_connection",
    });
    expect(workflow).toEqual(snapshot);
  });
});
