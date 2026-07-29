import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Workflow Studio automatic layout integration", () => {
  it("keeps ELK behind an explicit durable canvas action", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./WorkflowStudioCanvas.tsx", import.meta.url)),
      "utf8"
    );

    expect(source).toContain("buildWorkflowStudioAutoLayoutCommand({");
    expect(source).toContain('data-testid="flowcordia-arrange-workflow"');
    expect(source).toContain("onCommand(command)");
    expect(source).toContain("fitAfterLayoutRef.current = true");
    expect(source).toContain("Undo restores the previous positions");
    expect(source).not.toContain("elk.layout(");
  });
});
