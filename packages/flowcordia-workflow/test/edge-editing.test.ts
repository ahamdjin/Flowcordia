import { describe, expect, it } from "vitest";
import { applyWorkflowEdit, type WorkflowDefinition } from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "order_routing",
    name: "Order routing",
    nodes: [
      {
        id: "start",
        name: "Start",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "route",
        name: "Route",
        kind: "control",
        operation: "control.condition",
        position: { x: 260, y: 0 },
        configuration: { path: "priority", operator: "equals", value: true },
      },
      {
        id: "primary",
        name: "Primary",
        kind: "action",
        operation: "action.http",
        position: { x: 520, y: -120 },
        configuration: {
          method: "GET",
          url: "https://api.example.com/primary",
          bodyMode: "none",
          responseMode: "auto",
          timeoutSeconds: 30,
          maxResponseBytes: 1_048_576,
        },
      },
      {
        id: "fallback",
        name: "Fallback",
        kind: "action",
        operation: "action.http",
        position: { x: 520, y: 120 },
        configuration: {
          method: "GET",
          url: "https://api.example.com/fallback",
          bodyMode: "none",
          responseMode: "auto",
          timeoutSeconds: 30,
          maxResponseBytes: 1_048_576,
        },
      },
      {
        id: "output",
        name: "Output",
        kind: "output",
        operation: "output.return",
        position: { x: 820, y: 0 },
        configuration: {},
      },
    ],
    edges: [
      { id: "start_to_route", source: "start", target: "route" },
      { id: "route_true", source: "route", target: "primary", condition: "true" },
      { id: "route_false", source: "route", target: "fallback", condition: "false" },
      { id: "primary_to_output", source: "primary", target: "output" },
      { id: "fallback_to_output", source: "fallback", target: "output" },
    ],
  };
}

describe("portable workflow edge editing", () => {
  it("retargets one edge atomically while preserving its source and identity", () => {
    const source = workflow();
    const result = applyWorkflowEdit(source, {
      type: "replace_edge",
      edgeId: "primary_to_output",
      target: "fallback",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.edges.find((edge) => edge.id === "primary_to_output")).toEqual({
      id: "primary_to_output",
      source: "primary",
      target: "fallback",
    });
    expect(source.edges.find((edge) => edge.id === "primary_to_output")?.target).toBe("output");
  });

  it("rejects missing edges, trigger targets, cycles, duplicate targets, and branch conflicts", () => {
    expect(
      applyWorkflowEdit(workflow(), {
        type: "replace_edge",
        edgeId: "missing_edge",
        target: "output",
      })
    ).toMatchObject({ success: false, code: "edge_not_found" });

    expect(
      applyWorkflowEdit(workflow(), {
        type: "replace_edge",
        edgeId: "primary_to_output",
        target: "start",
      })
    ).toMatchObject({ success: false, code: "unsupported_connection" });

    expect(
      applyWorkflowEdit(workflow(), {
        type: "replace_edge",
        edgeId: "primary_to_output",
        target: "route",
      })
    ).toMatchObject({ success: false, code: "cycle" });

    expect(
      applyWorkflowEdit(workflow(), {
        type: "replace_edge",
        edgeId: "route_true",
        target: "fallback",
        condition: "true",
      })
    ).toMatchObject({ success: false, code: "duplicate_connection" });

    expect(
      applyWorkflowEdit(workflow(), {
        type: "replace_edge",
        edgeId: "route_true",
        target: "primary",
        condition: "false",
      })
    ).toMatchObject({ success: false, code: "duplicate_connection" });
  });

  it("requires branch metadata only when the fixed source is a condition", () => {
    expect(
      applyWorkflowEdit(workflow(), {
        type: "replace_edge",
        edgeId: "route_true",
        target: "primary",
      })
    ).toMatchObject({ success: false, code: "invalid_result" });

    expect(
      applyWorkflowEdit(workflow(), {
        type: "replace_edge",
        edgeId: "primary_to_output",
        target: "fallback",
        condition: "true",
      })
    ).toMatchObject({ success: false, code: "invalid_result" });
  });
});
