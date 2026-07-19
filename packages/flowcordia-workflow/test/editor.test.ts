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

  it("adds a typed repository function without transferring code ownership to Studio", () => {
    const first = addWorkflowFunctionNode(
      workflow(),
      {
        id: "qualify_lead",
        name: "Qualify lead",
        codeReference: { path: "src/flowcordia/qualify.ts", exportName: "qualifyLead" },
        inputSchema: { type: "object", properties: { leadId: { type: "string" } } },
        outputSchema: { type: "object", properties: { qualified: { type: "boolean" } } },
      },
      { x: 160, y: 180 }
    );
    expect(first.success).toBe(true);
    if (!first.success) return;
    const second = addWorkflowFunctionNode(
      first.workflow,
      {
        id: "qualify_lead",
        name: "Qualify lead",
        codeReference: { path: "src/flowcordia/qualify.ts", exportName: "qualifyLead" },
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      },
      { x: 480, y: 180 }
    );
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.workflow.nodes.at(-2)).toMatchObject({
      id: "function_qualify_lead",
      kind: "code",
      operation: "code.task",
      configuration: { functionId: "qualify_lead" },
      codeReference: { path: "src/flowcordia/qualify.ts", exportName: "qualifyLead" },
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    });
    expect(second.workflow.nodes.at(-1)?.id).toBe("function_qualify_lead_2");
    expect(workflowNodeOwnership(second.workflow.nodes.at(-1)!)).toBe("developer");
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

  it("updates configuration for visual nodes without mutating the source", () => {
    const source = workflow();
    const result = applyWorkflowEdit(source, {
      type: "set_node_configuration",
      nodeId: "manual_trigger",
      configuration: { samplePayload: { leadId: "lead_123" } },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.nodes[0]?.configuration).toEqual({
      samplePayload: { leadId: "lead_123" },
    });
    expect(source.nodes[0]?.configuration).toEqual({});
  });

  it("sets and removes supported whole-workflow execution policy", () => {
    const source = workflow();
    const configured = applyWorkflowEdit(source, {
      type: "set_node_runtime",
      nodeId: "manual_trigger",
      runtime: {
        queue: "orders/priority",
        machine: "medium-1x",
        maxDurationSeconds: 900,
        retry: { maxAttempts: 4, minTimeoutMs: 1000, maxTimeoutMs: 10000, factor: 2 },
      },
    });
    expect(configured.success).toBe(true);
    if (!configured.success) return;
    expect(configured.workflow.nodes[0]?.runtime).toEqual({
      queue: "orders/priority",
      machine: "medium-1x",
      maxDurationSeconds: 900,
      retry: { maxAttempts: 4, minTimeoutMs: 1000, maxTimeoutMs: 10000, factor: 2 },
    });
    expect(source.nodes[0]?.runtime).toBeUndefined();

    const cleared = applyWorkflowEdit(configured.workflow, {
      type: "set_node_runtime",
      nodeId: "manual_trigger",
      runtime: null,
    });
    expect(cleared.success).toBe(true);
    if (!cleared.success) return;
    expect(cleared.workflow.nodes[0]?.runtime).toBeUndefined();
  });

  it("rejects non-trigger and unsupported execution policy at the durable editor boundary", () => {
    expect(
      applyWorkflowEdit(workflow(), {
        type: "set_node_runtime",
        nodeId: "output",
        runtime: { queue: "orders" },
      })
    ).toMatchObject({ success: false, code: "unsupported_runtime_scope" });
    expect(
      applyWorkflowEdit(workflow(), {
        type: "set_node_runtime",
        nodeId: "manual_trigger",
        runtime: { concurrencyKey: "customer.id" },
      })
    ).toMatchObject({ success: false, code: "invalid_result" });
    expect(
      applyWorkflowEdit(workflow(), {
        type: "set_node_runtime",
        nodeId: "manual_trigger",
        runtime: { machine: "future-8x" },
      })
    ).toMatchObject({ success: false, code: "invalid_result" });
  });

  it("rejects terminal, incoming-trigger, and cyclic connections at the durable editor boundary", () => {
    const source = workflow();
    source.nodes.splice(
      1,
      0,
      {
        id: "condition",
        name: "Condition",
        kind: "control",
        operation: "control.condition",
        position: { x: 160, y: 0 },
        configuration: { path: "qualified", operator: "equals", value: true },
      },
      {
        id: "http_action",
        name: "HTTP request",
        kind: "action",
        operation: "action.http",
        position: { x: 320, y: 0 },
        configuration: { method: "GET", url: "https://example.com" },
      }
    );
    source.nodes.find((node) => node.id === "output")!.position = { x: 480, y: 0 };
    source.edges = [
      { id: "manual_trigger_to_condition", source: "manual_trigger", target: "condition" },
      {
        id: "condition_to_http",
        source: "condition",
        target: "http_action",
        condition: "true",
      },
      { id: "http_to_output", source: "http_action", target: "output" },
    ];

    expect(
      applyWorkflowEdit(source, {
        type: "connect_nodes",
        source: "output",
        target: "http_action",
      })
    ).toMatchObject({ success: false, code: "unsupported_connection" });
    expect(
      applyWorkflowEdit(source, {
        type: "connect_nodes",
        source: "http_action",
        target: "manual_trigger",
      })
    ).toMatchObject({ success: false, code: "unsupported_connection" });
    expect(
      applyWorkflowEdit(source, {
        type: "connect_nodes",
        source: "http_action",
        target: "condition",
      })
    ).toMatchObject({ success: false, code: "cycle" });
  });

  it("preserves developer-owned code boundaries", () => {
    const source = workflow();
    source.nodes.push({
      id: "qualify_lead",
      name: "Qualify lead",
      kind: "code",
      operation: "code.task",
      position: { x: 160, y: 180 },
      configuration: {},
      codeReference: { path: "src/qualify.ts", exportName: "qualifyLead" },
    });
    const node = source.nodes.at(-1)!;

    expect(workflowNodeOwnership(node)).toBe("developer");
    expect(
      applyWorkflowEdit(source, {
        type: "set_node_configuration",
        nodeId: node.id,
        configuration: { source: "browser" },
      })
    ).toMatchObject({ success: false, code: "developer_owned" });
    const removed = applyWorkflowEdit(source, { type: "remove_node", nodeId: node.id });
    expect(removed.success).toBe(true);
    if (!removed.success) return;
    expect(removed.workflow.nodes.some((candidate) => candidate.id === node.id)).toBe(false);
  });

  it("rejects inline secrets before they enter durable draft storage", () => {
    expect(
      applyWorkflowEdit(workflow(), {
        type: "set_node_configuration",
        nodeId: "manual_trigger",
        configuration: { apiToken: "must-not-be-stored" },
      })
    ).toMatchObject({ success: false, code: "invalid_result" });
    expect(
      applyWorkflowEdit(workflow(), {
        type: "set_node_configuration",
        nodeId: "manual_trigger",
        configuration: { url: "https://example.test/hook?access_token=must-not-be-stored" },
      })
    ).toMatchObject({ success: false, code: "invalid_result" });
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

  it("requires explicit and unique branches from condition nodes", () => {
    const source = workflow();
    source.nodes.splice(1, 0, {
      id: "qualified",
      kind: "control",
      operation: "control.condition",
      position: { x: 200, y: 0 },
      configuration: { path: "qualified", operator: "equals", value: true },
    });
    source.edges = [{ id: "trigger_to_condition", source: "manual_trigger", target: "qualified" }];

    expect(
      applyWorkflowEdit(source, {
        type: "connect_nodes",
        source: "qualified",
        target: "output",
      })
    ).toMatchObject({ success: false, code: "invalid_result" });

    const connected = applyWorkflowEdit(source, {
      type: "connect_nodes",
      source: "qualified",
      target: "output",
      condition: "true",
    });
    expect(connected.success).toBe(true);
    if (!connected.success) return;
    expect(connected.workflow.edges.at(-1)).toMatchObject({ condition: "true" });

    connected.workflow.nodes.push({
      id: "fallback",
      kind: "output",
      operation: "output.return",
      position: { x: 400, y: 160 },
      configuration: {},
    });
    expect(
      applyWorkflowEdit(connected.workflow, {
        type: "connect_nodes",
        source: "qualified",
        target: "fallback",
        condition: "true",
      })
    ).toMatchObject({ success: false, code: "duplicate_connection" });
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
