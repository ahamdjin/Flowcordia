import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { projectStudioV2WorkflowToFlyde } from "./flyde-workflow-adapter";

describe("Studio V2 Flyde workflow adapter", () => {
  it("projects the canonical workflow graph into Flyde nodes and connections", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const projection = projectStudioV2WorkflowToFlyde(workflow);

    expect(projection.success).toBe(true);
    if (!projection.success) return;

    expect(projection.node.instances.map((instance) => instance.id)).toEqual(
      workflow.nodes.map((node) => node.id)
    );
    expect(projection.node.connections).toHaveLength(workflow.edges.length);
    expect(projection.node.connections).toContainEqual({
      from: { insId: "condition", pinId: "true" },
      to: { insId: "success_output", pinId: "input" },
      delayed: undefined,
    });
  });

  it("rejects invalid workflow documents at the adapter boundary", () => {
    expect(projectStudioV2WorkflowToFlyde({ nodes: [] })).toMatchObject({
      success: false,
    });
  });
});
