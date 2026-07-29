import { describe, expect, it } from "vitest";
import { pasteWorkflowSubgraph } from "./editor.js";
import type { WorkflowDefinition } from "./types.js";

function sourceWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "source_workflow",
    name: "Source workflow",
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

function targetWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "target_workflow",
    name: "Target workflow",
    nodes: [
      {
        id: "manual_trigger",
        name: "Target trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 40, y: 40 },
        configuration: {},
        outputSchema: { type: "object" },
      },
      {
        id: "http_action",
        name: "Existing action",
        kind: "action",
        operation: "action.http",
        position: { x: 320, y: 40 },
        configuration: { method: "POST", url: "https://target.example.com" },
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      },
    ],
    edges: [{ id: "manual_to_http", source: "manual_trigger", target: "http_action" }],
  };
}

describe("cross-workflow subgraph cloning", () => {
  it("clones canonical source nodes and only their internal edges into the target", () => {
    const result = pasteWorkflowSubgraph({
      target: targetWorkflow(),
      source: sourceWorkflow(),
      nodeIds: ["http_action", "output"],
      offset: { x: 80, y: 120 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.nodes.find((node) => node.id === "http_action_2")).toMatchObject({
      name: "HTTP request copy",
      configuration: { method: "GET", url: "https://example.com" },
      position: { x: 440, y: 200 },
    });
    expect(result.workflow.nodes.find((node) => node.id === "output")).toMatchObject({
      name: "Output copy",
      position: { x: 720, y: 200 },
    });
    expect(result.workflow.edges).toContainEqual(
      expect.objectContaining({ source: "http_action_2", target: "output" })
    );
    expect(result.workflow.edges).not.toContainEqual(
      expect.objectContaining({ source: "manual_trigger", target: "http_action_2" })
    );
  });

  it("rejects stale identities without mutating either caller", () => {
    const source = sourceWorkflow();
    const target = targetWorkflow();
    const sourceSnapshot = structuredClone(source);
    const targetSnapshot = structuredClone(target);

    expect(
      pasteWorkflowSubgraph({
        target,
        source,
        nodeIds: ["http_action", "missing_node"],
        offset: { x: 40, y: 40 },
      })
    ).toMatchObject({ success: false, code: "node_not_found" });
    expect(
      pasteWorkflowSubgraph({
        target,
        source,
        nodeIds: ["http_action", "http_action"],
        offset: { x: 40, y: 40 },
      })
    ).toMatchObject({ success: false, code: "invalid_result" });
    expect(source).toEqual(sourceSnapshot);
    expect(target).toEqual(targetSnapshot);
  });
});
