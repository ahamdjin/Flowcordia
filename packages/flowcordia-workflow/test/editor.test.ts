import { describe, expect, it } from "vitest";
import {
  addWorkflowFunctionNode,
  applyWorkflowEdit,
  type WorkflowDefinition,
  workflowNodeOwnership,
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
      "api_trigger",
      "schedule_trigger",
      "webhook_trigger",
      "http_action",
      "data_map",
      "subflow",
      "condition",
      "approval",
      "wait",
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
    expect(second.workflow.nodes.at(-1)?.configuration).toEqual({
      method: "GET",
      url: "",
      bodyMode: "none",
      responseMode: "auto",
      timeoutSeconds: 30,
      maxResponseBytes: 1_048_576,
    });
  });

  it("keeps developer-owned nodes immutable through visual commands", () => {
    const source = workflow();
    const added = addWorkflowFunctionNode(
      source,
      {
        id: "qualifyLead",
        name: "Qualify lead",
        description: "Scores inbound leads.",
        codeReference: { path: "src/functions/qualifyLead.ts", exportName: "qualifyLead" },
        inputSchema: { type: "object", required: ["email"] },
        outputSchema: { type: "object", required: ["qualified"] },
        mockInput: { email: "test@example.com" },
        mockOutput: { qualified: true },
      },
      { x: 200, y: 100 }
    );
    expect(added.success).toBe(true);
    if (!added.success) return;
    const node = added.workflow.nodes.at(-1)!;
    expect(workflowNodeOwnership(node)).toBe("developer");

    const mutation = applyWorkflowEdit(added.workflow, {
      type: "set_node_configuration",
      nodeId: node.id,
      configuration: { functionId: "tampered" },
    });
    expect(mutation.success).toBe(false);
    if (mutation.success) return;
    expect(mutation.code).toBe("developer_owned");
  });

  it("rejects duplicate connections and cycles", () => {
    const source = workflow();
    const added = applyWorkflowEdit(source, {
      type: "add_node",
      templateId: "condition",
      position: { x: 160, y: 160 },
    });
    expect(added.success).toBe(true);
    if (!added.success) return;
    const conditionId = added.workflow.nodes.at(-1)!.id;

    const connected = applyWorkflowEdit(added.workflow, {
      type: "connect_nodes",
      source: "manual_trigger",
      target: conditionId,
    });
    expect(connected.success).toBe(true);
    if (!connected.success) return;

    const duplicate = applyWorkflowEdit(connected.workflow, {
      type: "connect_nodes",
      source: "manual_trigger",
      target: conditionId,
    });
    expect(duplicate.success).toBe(false);
    if (duplicate.success) return;
    expect(duplicate.code).toBe("duplicate_connection");

    const cycle = applyWorkflowEdit(connected.workflow, {
      type: "connect_nodes",
      source: conditionId,
      target: "manual_trigger",
      condition: "true",
    });
    expect(cycle.success).toBe(false);
    if (cycle.success) return;
    expect(["unsupported_connection", "cycle"]).toContain(cycle.code);
  });

  it("requires explicit condition branches", () => {
    const source = workflow();
    const condition = applyWorkflowEdit(source, {
      type: "add_node",
      templateId: "condition",
      position: { x: 160, y: 0 },
    });
    expect(condition.success).toBe(true);
    if (!condition.success) return;
    const conditionId = condition.workflow.nodes.at(-1)!.id;

    const connection = applyWorkflowEdit(condition.workflow, {
      type: "connect_nodes",
      source: conditionId,
      target: "output",
    });
    expect(connection.success).toBe(false);
    if (connection.success) return;
    expect(connection.message).toContain("true or false");
  });
});
