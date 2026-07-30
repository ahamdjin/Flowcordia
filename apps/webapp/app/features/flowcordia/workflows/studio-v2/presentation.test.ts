import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { buildStudioV2CanvasGraph, studioV2SelectedNode } from "./presentation";

describe("Studio V2 presentation adapter", () => {
  it("maps the canonical vertical slice into React Flow nodes and edges", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const graph = buildStudioV2CanvasGraph(workflow);

    expect(graph.nodes).toHaveLength(workflow.nodes.length);
    expect(graph.edges).toHaveLength(workflow.edges.length);
    expect(graph.nodes.find((node) => node.id === "source")).toMatchObject({
      type: "studio-v2",
      data: {
        label: "Source",
        operation: "code.typescript",
      },
    });
    expect(graph.edges.find((edge) => edge.id === "condition_to_success")).toMatchObject({
      type: "smoothstep",
      source: "condition",
      sourceHandle: "true",
      target: "success_output",
    });
  });

  it("resolves selection without manufacturing stale nodes", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    expect(studioV2SelectedNode(workflow, "http_request")?.operation).toBe("action.http");
    expect(studioV2SelectedNode(workflow, "missing")).toBeNull();
    expect(studioV2SelectedNode(workflow, null)).toBeNull();
  });
});
