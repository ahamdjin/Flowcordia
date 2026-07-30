import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { parseWorkflowCode, serializeWorkflowCode } from "./workflow-code";

describe("Flowcordia whole-workflow code", () => {
  it("round-trips the canonical workflow while keeping Source readable", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const code = serializeWorkflowCode(workflow);

    expect(code).toContain('import { defineWorkflow } from "@flowcordia/workflow"');
    expect(code).toContain("export default defineWorkflow({");
    expect(code).toContain("`export default async function run(ctx: FlowcordiaContext)");

    const result = parseWorkflowCode(code);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.issues.join("\n"));
    expect(result.workflow).toEqual(workflow);
  });

  it("turns code edits into a validated workflow document", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();
    const code = serializeWorkflowCode(workflow)
      .replace('"name": "Studio V2 vertical slice"', '"name": "Edited in code"')
      .replace('"url": "{{steps.source.endpoint}}"', '"url": "https://example.com"');

    const result = parseWorkflowCode(code);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.issues.join("\n"));
    expect(result.workflow.name).toBe("Edited in code");
    expect(
      result.workflow.nodes.find((node) => node.id === "http_request")?.configuration.url
    ).toBe("https://example.com");
  });

  it("rejects arbitrary execution, spreads and interpolated templates", () => {
    for (const expression of [
      "defineWorkflow(loadWorkflow())",
      "defineWorkflow({ ...workflow })",
      "defineWorkflow({ source: `value ${process.env.SECRET}` })",
    ]) {
      const result = parseWorkflowCode(
        `import { defineWorkflow } from "@flowcordia/workflow";\nexport default ${expression};`
      );
      expect(result.success).toBe(false);
    }
  });

  it("keeps the last valid workflow when code is structurally incomplete", () => {
    const result = parseWorkflowCode(
      'import { defineWorkflow } from "@flowcordia/workflow";\nexport default defineWorkflow({'
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues[0]).toMatch(/Line|expected|invalid/i);
  });
});
