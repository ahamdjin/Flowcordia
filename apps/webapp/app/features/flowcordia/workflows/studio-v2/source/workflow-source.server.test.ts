import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { parseStudioV2WorkflowSource, StudioV2WorkflowSourceError } from "./workflow-source.server";
import { printStudioV2WorkflowSource } from "./workflow-source";

describe("Studio V2 workflow TypeScript source", () => {
  it("round-trips the complete canonical workflow without losing nodes or configuration", () => {
    const workflow = createStudioV2VerticalSliceWorkflow();

    expect(parseStudioV2WorkflowSource(printStudioV2WorkflowSource(workflow))).toEqual(workflow);
  });

  it("accepts static edits and validates the resulting workflow", () => {
    const source = printStudioV2WorkflowSource(createStudioV2VerticalSliceWorkflow()).replace(
      '"name": "Studio V2 vertical slice"',
      '"name": "Customer onboarding"'
    );

    expect(parseStudioV2WorkflowSource(source).name).toBe("Customer onboarding");
  });

  it("rejects executable expressions instead of evaluating source", () => {
    const source = `import { defineWorkflow } from "@flowcordia/workflow";
export default defineWorkflow({
  schemaVersion: "0.1",
  id: "unsafe_workflow",
  name: process.env.WORKFLOW_NAME,
  nodes: [],
  edges: []
});`;

    expect(() => parseStudioV2WorkflowSource(source)).toThrowError(StudioV2WorkflowSourceError);
    expect(() => parseStudioV2WorkflowSource(source)).toThrow(/static JSON/);
  });

  it("reports syntax errors with their source location", () => {
    expect(() =>
      parseStudioV2WorkflowSource("export default defineWorkflow({ nodes: [ });")
    ).toThrowError(expect.objectContaining({ line: 1, column: expect.any(Number) }));
  });

  it("rejects workflow documents that fail the canonical schema", () => {
    expect(() =>
      parseStudioV2WorkflowSource(`import { defineWorkflow } from "@flowcordia/workflow";
export default defineWorkflow({ schemaVersion: "0.1", id: "broken", name: "Broken", nodes: [] });`)
    ).toThrow(/edges/);
  });
});
