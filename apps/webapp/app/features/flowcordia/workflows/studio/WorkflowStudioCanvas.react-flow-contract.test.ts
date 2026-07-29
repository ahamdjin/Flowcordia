import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Workflow Studio React Flow integration", () => {
  it("normalizes React Flow connection and edge inputs before canonical validation", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./WorkflowStudioCanvas.tsx", import.meta.url)),
      "utf8"
    );

    expect(source).toContain("connection: Connection | CanvasEdge");
    expect(source).toContain("sourceHandle: connection.sourceHandle ?? null");
    expect(source).toContain("targetHandle: connection.targetHandle ?? null");
    expect(source).toContain("buildWorkflowStudioReactFlowConnectionCommand");
  });

  it("routes multi-node deletion through one accessible canonical command", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./WorkflowStudioCanvas.tsx", import.meta.url)),
      "utf8"
    );

    expect(source).toContain("createWorkflowStudioNodeRemovalPlan");
    expect(source).toContain('type: "remove_nodes"');
    expect(source).toContain("flowcordia-remove-selection");
    expect(source).toContain("flowcordia-confirm-remove-selection");
    expect(source).toContain('variant="danger/small"');
    expect(source).toContain("onClick={submitNodeRemoval}");
    expect(source).not.toContain("Remove selected nodes individually from the inspector");
  });
});
