import { createStudioV2SourceNode, type WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { compileStudioV2WorkflowToTriggerTask } from "./studio-v2-compiler";

function sourceWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "source-runtime-test",
    name: "Source runtime test",
    nodes: [
      {
        id: "manual",
        name: "Manual",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
        outputSchema: { type: "object" },
      },
      createStudioV2SourceNode({
        id: "source",
        position: { x: 250, y: 0 },
        credentialReferences: ["billing-api"],
        source: `export default async function run(ctx: FlowcordiaContext) {
          return { input: ctx.input, credential: await ctx.credentials.get("billing-api") };
        }`,
      }),
      {
        id: "return",
        name: "Return",
        kind: "output",
        operation: "output.return",
        position: { x: 500, y: 0 },
        configuration: {},
        inputSchema: { type: "object" },
      },
    ],
    edges: [
      { id: "manual-source", source: "manual", target: "source" },
      { id: "source-return", source: "source", target: "return" },
    ],
    metadata: {},
  };
}

describe("Studio V2 compiler", () => {
  it("compiles Source nodes and injects opaque credential environment bindings", () => {
    const compiled = compileStudioV2WorkflowToTriggerTask(sourceWorkflow());
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;

    expect(compiled.artifact.source).toContain('"billing-api":"FLOWCORDIA_CREDENTIAL_BILLING_API"');
    expect(compiled.artifact.source).toContain('"operation": "code.typescript"');
    expect(compiled.artifact.source).toContain('environment: "production"');
    expect(compiled.artifact.source).toContain("runId: ctx.run.id");
    expect(compiled.artifact.source).not.toContain("runtime-only");
  });
});
