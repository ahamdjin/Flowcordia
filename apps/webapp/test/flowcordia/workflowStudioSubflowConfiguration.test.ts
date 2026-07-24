import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
} from "../../app/features/flowcordia/workflows/studio/node-configuration";
import { presentWorkflowGraph } from "../../app/features/flowcordia/workflows/studio/presentation";

describe("Workflow Studio subflow configuration", () => {
  it("round-trips single and bounded batch modes", () => {
    const single = createWorkflowStudioNodeConfigurationDraft("subflow.invoke", {
      workflowId: "child-workflow",
      mode: "single",
    });
    expect(single).toMatchObject({
      kind: "subflow",
      workflowId: "child-workflow",
      mode: "single",
    });
    if (single.kind !== "subflow") return;
    expect(buildWorkflowStudioNodeConfiguration(single)).toEqual({
      success: true,
      configuration: { workflowId: "child-workflow", mode: "single" },
    });

    const batch = createWorkflowStudioNodeConfigurationDraft("subflow.invoke", {
      workflowId: "child-workflow",
      mode: "batch",
      itemsPath: "orders",
      maxItems: 20,
    });
    expect(batch).toMatchObject({
      kind: "subflow",
      mode: "batch",
      itemsPath: "orders",
      maxItems: "20",
    });
  });

  it("presents the first-party subflow node as visually editable", () => {
    const workflow: WorkflowDefinition = {
      schemaVersion: "0.1",
      id: "parent-workflow",
      name: "Parent workflow",
      nodes: [
        {
          id: "child",
          kind: "subflow",
          operation: "subflow.invoke",
          position: { x: 0, y: 0 },
          configuration: {
            workflowId: "child-workflow",
            mode: "batch",
            itemsPath: "orders",
            maxItems: 20,
          },
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
      ],
      edges: [],
    };

    const graph = presentWorkflowGraph({
      workflow,
      source: {
        path: ".flowcordia/workflows/parent-workflow.json",
        commitSha: "a".repeat(40),
        blobSha: "b".repeat(40),
        requestedRevision: "main",
      },
      appliedMigrations: [],
    });

    expect(graph.nodes[0]?.editableConfiguration).toEqual({
      workflowId: "child-workflow",
      mode: "batch",
      itemsPath: "orders",
      maxItems: 20,
    });
  });

  it("blocks invalid stored configuration instead of exposing raw JSON", () => {
    expect(
      createWorkflowStudioNodeConfigurationDraft("subflow.invoke", {
        workflowId: "child-workflow",
        mode: "batch",
        itemsPath: "orders",
        maxItems: 500,
      })
    ).toMatchObject({ kind: "blocked" });
  });
});
