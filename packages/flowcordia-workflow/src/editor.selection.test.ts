import { describe, expect, it } from "vitest";
import { applyWorkflowEdit } from "./editor.js";
import type { WorkflowDefinition } from "./types.js";

function referenceWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "selection_reference",
    name: "Selection reference",
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
        id: "http_action",
        name: "HTTP request",
        kind: "action",
        operation: "action.http",
        position: { x: 360, y: 80 },
        configuration: { method: "GET", url: "https://example.com" },
        inputSchema: { type: "object" },
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
    edges: [
      { id: "manual_to_http", source: "manual_trigger", target: "http_action" },
      { id: "http_to_output", source: "http_action", target: "output" },
    ],
  };
}

describe("workflow selection edit commands", () => {
  it("moves a selected group in one validated edit", () => {
    const result = applyWorkflowEdit(referenceWorkflow(), {
      type: "move_nodes",
      moves: [
        { nodeId: "http_action", position: { x: 400, y: 160 } },
        { nodeId: "output", position: { x: 680, y: 160 } },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.nodes.find((node) => node.id === "http_action")?.position).toEqual({
      x: 400,
      y: 160,
    });
    expect(result.workflow.nodes.find((node) => node.id === "output")?.position).toEqual({
      x: 680,
      y: 160,
    });
  });

  it("duplicates canonical nodes and only their internal connections", () => {
    const result = applyWorkflowEdit(referenceWorkflow(), {
      type: "duplicate_subgraph",
      nodeIds: ["http_action", "output"],
      offset: { x: 40, y: 40 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.nodes.find((node) => node.id === "http_action_copy")).toMatchObject({
      name: "HTTP request copy",
      operation: "action.http",
      position: { x: 400, y: 120 },
      configuration: { method: "GET", url: "https://example.com" },
    });
    expect(result.workflow.nodes.find((node) => node.id === "output_copy")).toMatchObject({
      name: "Output copy",
      position: { x: 680, y: 120 },
    });
    expect(result.workflow.edges).toContainEqual(
      expect.objectContaining({ source: "http_action_copy", target: "output_copy" })
    );
    expect(result.workflow.edges).not.toContainEqual(
      expect.objectContaining({ source: "manual_trigger", target: "http_action_copy" })
    );
  });

  it("rejects missing and duplicate selection identities without mutating the caller", () => {
    const workflow = referenceWorkflow();
    const snapshot = structuredClone(workflow);

    expect(
      applyWorkflowEdit(workflow, {
        type: "duplicate_subgraph",
        nodeIds: ["http_action", "missing_node"],
        offset: { x: 40, y: 40 },
      })
    ).toMatchObject({ success: false, code: "node_not_found" });
    expect(
      applyWorkflowEdit(workflow, {
        type: "move_nodes",
        moves: [
          { nodeId: "http_action", position: { x: 0, y: 0 } },
          { nodeId: "http_action", position: { x: 40, y: 40 } },
        ],
      })
    ).toMatchObject({ success: false, code: "invalid_result" });
    expect(workflow).toEqual(snapshot);
  });
});
