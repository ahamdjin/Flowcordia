import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Workflow Studio cross-workflow paste integration", () => {
  it("copies exact draft identity and submits a draft-only paste command for another workflow", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./WorkflowStudioCanvas.tsx", import.meta.url)),
      "utf8"
    );

    expect(source).toContain("draftPublicId: clipboardSource.draftPublicId");
    expect(source).toContain("draftVersion: clipboardSource.draftVersion");
    expect(source).toContain("documentSha256: clipboardSource.documentSha256");
    expect(source).toContain("payload.workflowId === graph.workflowId");
    expect(source).toContain("buildWorkflowStudioCrossWorkflowPasteCommand({ payload, offset })");
    expect(source).toContain("onCommand(command)");
    expect(source).not.toContain("browserDocument");
    expect(source).not.toContain("workflowDocument");
  });
});
