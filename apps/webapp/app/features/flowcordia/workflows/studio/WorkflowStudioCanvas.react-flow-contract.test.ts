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
});
