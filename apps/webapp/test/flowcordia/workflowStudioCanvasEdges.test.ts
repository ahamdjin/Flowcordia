import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowStudioEdgeInspector } from "../../app/features/flowcordia/workflows/studio/WorkflowStudioEdgeInspector";
import {
  buildWorkflowStudioCanvasReplaceEdgeCommand,
  orderedWorkflowStudioCanvasEdgeIds,
  workflowStudioCanvasEdgeConditionOptions,
  workflowStudioCanvasEdgeLabel,
  workflowStudioCanvasEdgeTargetOptions,
} from "../../app/features/flowcordia/workflows/studio/canvas-edges";
import type {
  WorkflowStudioGraph,
  WorkflowStudioNode,
} from "../../app/features/flowcordia/workflows/studio/presentation";

function node(
  id: string,
  name: string,
  kind: WorkflowStudioNode["kind"],
  operation: string,
  position: { x: number; y: number }
): WorkflowStudioNode {
  return {
    id,
    name,
    kind,
    operation,
    ownership: "visual",
    position,
    configurationKeys: [],
    editableConfiguration: {},
    functionId: null,
    inputSchema: null,
    outputSchema: null,
    credentialReferences: [],
    runtime: null,
    codeReference: null,
  };
}

function graph(): WorkflowStudioGraph {
  return {
    workflowId: "order_routing",
    name: "Order routing",
    description: null,
    schemaVersion: "0.1",
    labels: [],
    nodes: [
      node("start", "Start", "trigger", "trigger.manual", { x: 0, y: 0 }),
      node("route", "Route", "control", "control.condition", { x: 260, y: 0 }),
      node("primary", "Primary", "action", "action.http", { x: 520, y: -120 }),
      node("fallback", "Fallback", "action", "action.http", { x: 520, y: 120 }),
      node("output", "Output", "output", "output.return", { x: 820, y: 0 }),
    ],
    edges: [
      {
        id: "start_to_route",
        source: "start",
        target: "route",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
      {
        id: "route_true",
        source: "route",
        target: "primary",
        sourceHandle: null,
        targetHandle: null,
        condition: "true",
      },
      {
        id: "route_false",
        source: "route",
        target: "fallback",
        sourceHandle: null,
        targetHandle: null,
        condition: "false",
      },
      {
        id: "primary_to_output",
        source: "primary",
        target: "output",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
      {
        id: "fallback_to_output",
        source: "fallback",
        target: "output",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
    ],
    source: {
      path: ".flowcordia/workflows/order_routing.json",
      commitSha: "a".repeat(40),
      blobSha: "b".repeat(40),
      requestedRevision: "a".repeat(40),
      sourceSchemaVersion: "0.1",
      appliedMigrations: [],
    },
  };
}

describe("Flowcordia canvas edge editing", () => {
  it("presents human-readable labels and deterministic visual order", () => {
    expect(workflowStudioCanvasEdgeLabel(graph(), "route_true")).toBe(
      "Route connects to Primary on the true branch"
    );
    expect(orderedWorkflowStudioCanvasEdgeIds(graph())).toEqual([
      "primary_to_output",
      "start_to_route",
      "route_true",
      "route_false",
      "fallback_to_output",
    ]);
  });

  it("evaluates targets against the graph with the selected edge removed", () => {
    const options = workflowStudioCanvasEdgeTargetOptions({
      graph: graph(),
      edgeId: "primary_to_output",
      condition: null,
    });
    expect(options.find((option) => option.id === "fallback")).toMatchObject({ eligible: true });
    expect(options.find((option) => option.id === "start")).toMatchObject({
      eligible: false,
      message: "Trigger nodes cannot receive incoming connections.",
    });
    expect(options.find((option) => option.id === "primary")).toMatchObject({
      eligible: false,
      message: "A node cannot connect directly to itself.",
    });
  });

  it("blocks occupied condition branches and builds one bounded replacement command", () => {
    const conditions = workflowStudioCanvasEdgeConditionOptions({
      graph: graph(),
      edgeId: "route_true",
      targetId: "primary",
    });
    expect(conditions).toEqual([
      { condition: "true", label: "true branch", eligible: true, message: null },
      {
        condition: "false",
        label: "false branch",
        eligible: false,
        message: "The false branch is already connected.",
      },
    ]);

    expect(
      buildWorkflowStudioCanvasReplaceEdgeCommand({
        graph: graph(),
        edgeId: "primary_to_output",
        targetId: "fallback",
        condition: null,
      })
    ).toEqual({
      success: true,
      command: {
        type: "replace_edge",
        edgeId: "primary_to_output",
        target: "fallback",
      },
    });
  });

  it("fails closed for a missing edge and a cyclic replacement", () => {
    expect(
      buildWorkflowStudioCanvasReplaceEdgeCommand({
        graph: graph(),
        edgeId: "missing",
        targetId: "output",
        condition: null,
      })
    ).toEqual({ success: false, message: "The selected connection no longer exists." });
    expect(
      buildWorkflowStudioCanvasReplaceEdgeCommand({
        graph: graph(),
        edgeId: "primary_to_output",
        targetId: "route",
        condition: null,
      })
    ).toEqual({ success: false, message: "That connection would create a cycle." });
  });

  it("renders a bounded inspector with atomic save and removal controls", () => {
    const value = graph();
    const edge = value.edges.find((candidate) => candidate.id === "primary_to_output")!;
    const markup = renderToStaticMarkup(
      createElement(WorkflowStudioEdgeInspector, {
        graph: value,
        edge,
        editable: true,
        busy: false,
        onCommand: () => undefined,
      })
    );
    expect(markup).toContain('data-testid="flowcordia-edge-inspector"');
    expect(markup).toContain('data-testid="flowcordia-save-edge"');
    expect(markup).toContain('data-testid="flowcordia-remove-edge"');
    expect(markup).toContain("Primary connects to Output");
  });
});
