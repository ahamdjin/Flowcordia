import { describe, expect, it } from "vitest";
import {
  applyWorkflowEdit,
  type WorkflowDefinition,
  WORKFLOW_STUDIO_NODE_TEMPLATES,
} from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "order_intake",
    name: "Order intake",
    nodes: [
      {
        id: "manual_trigger",
        name: "Start",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "output",
        name: "Output",
        kind: "output",
        operation: "output.return",
        position: { x: 320, y: 0 },
        configuration: {},
      },
    ],
    edges: [{ id: "manual_trigger_to_output", source: "manual_trigger", target: "output" }],
  };
}

describe("workflow draft editor", () => {
  it("publishes a bounded first-party node catalog", () => {
    expect(WORKFLOW_STUDIO_NODE_TEMPLATES.map((template) => template.id)).toEqual([
      "manual_trigger",
      "schedule_trigger",
      "webhook_trigger",
      "http_action",
      "condition",
      "wait",
      "code_task",
      "output",
    ]);
  });

  it("applies workflow details without mutating the source", () => {
    const source = workflow();
    const result = applyWorkflowEdit(source, {
      type: "set_workflow_details",
      name: "Priority order intake",
      description: "Routes priority orders.",
      labels: ["orders", "priority"],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.name).toBe("Priority order intake");
    expect(result.workflow.description).toBe("Routes priority orders.");
    expect(result.workflow.labels).toEqual(["orders", "priority"]);
    expect(source.name).toBe("Order intake");
    expect(source.description).toBeUndefined();
  });

  it("adds nodes with deterministic collision-safe identity", () => {
    const source = workflow();
    const first = applyWorkflowEdit(source, {
      type: "add_node",
      templateId: "http_action",
      position: { x: 160, y: 180 },
    });
    expect(first.success).toBe(true);
    if (!first.success) return;
    const second = applyWorkflowEdit(first.workflow, {
      type: "add_node",
      templateId: "http_action",
      position: { x: 480, y: 180 },
    });
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.workflow.nodes.at(-2)?.id).toBe("http_action");
    expect(second.workflow.nodes.at(-1)?.id).toBe("http_action_2");
    expect(second.workflow.nodes.at(-1)?.configuration).toEqual({ method: "GET", url: "" });
  });

  it("moves and renames an existing node", () => {
    const moved = applyWorkflowEdit(workflow(), {
      type: "move_node",
      nodeId: "output",
      position: { x: 620, y: 240 },
    });
    expect(moved.success).toBe(true);
    if (!moved.success) return;
    const renamed = applyWorkflowEdit(moved.workflow, {
      type: "rename_node",
      nodeId: "output",
      name: "Return order",
    });
    expect(renamed.success).toBe(true);
    if (!renamed.success) return;

    expect(renamed.workflow.nodes.find((node) => node.id === "output")).toMatchObject({
      name: "Return order",
      position: { x: 620, y: 240 },
    });
  });

  it("connects nodes with deterministic edge identity and rejects duplicates", () => {
    const source = workflow();
    source.edges = [];
    const connected = applyWorkflowEdit(source, {
      type: "connect_nodes",
      source: "manual_trigger",
      target: "output",
    });
    expect(connected.success).toBe(true);
    if (!connected.success) return;
    expect(connected.workflow.edges).toEqual([
      { id: "manual_trigger_to_output", source: "manual_trigger", target: "output" },
    ]);

    const duplicate = applyWorkflowEdit(connected.workflow, {
      type: "connect_nodes",
      source: "manual_trigger",
      target: "output",
    });
    expect(duplicate).toMatchObject({ success: false, code: "duplicate_connection" });
  });

  it("removes a node and its connected edges atomically", () => {
    const result = applyWorkflowEdit(workflow(), { type: "remove_node", nodeId: "output" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.nodes.map((node) => node.id)).toEqual(["manual_trigger"]);
    expect(result.workflow.edges).toEqual([]);
  });

  it("fails closed when an edit would violate the canonical contract", () => {
    const result = applyWorkflowEdit(workflow(), {
      type: "set_workflow_details",
      name: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("invalid_result");
    expect(result.issues[0]?.path).toEqual(["name"]);
  });
});
