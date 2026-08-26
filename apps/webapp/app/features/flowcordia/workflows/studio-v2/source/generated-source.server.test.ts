import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { generateStudioV2WorkflowSource } from "./generated-source.server";

describe("Studio V2 generated source", () => {
  it("uses the production Studio V2 compiler for the complete visual workflow", () => {
    const generated = generateStudioV2WorkflowSource({
      document: createStudioV2VerticalSliceWorkflow(),
      documentSha256: "workflow-sha",
    });

    expect(generated.code).toContain('id: "flowcordia-studio_v2_vertical_slice"');
    expect(generated.code).toContain("executeFlowcordiaWorkflow");
    expect(generated.orderedNodeIds).toEqual([
      "manual_trigger",
      "source",
      "http_request",
      "condition",
      "failure_output",
      "success_output",
    ]);
    expect(generated.issues).toEqual([]);
  });
});
