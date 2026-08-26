import { createStudioV2SourceNode, type WorkflowDefinition } from "@flowcordia/workflow";
import ts from "typescript";
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
  it("emits syntactically valid TypeScript", () => {
    const compiled = compileStudioV2WorkflowToTriggerTask(sourceWorkflow(), {
      environment: "test",
    });
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;

    const result = ts.transpileModule(compiled.artifact.source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    const diagnostics = (result.diagnostics ?? []).map((diagnostic) => {
      const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const sourceLine = position
        ? compiled.artifact.source
            .split("\n")
            .slice(Math.max(0, position.line - 3), position.line + 2)
            .join(" | ")
        : undefined;
      return `${position ? `${position.line + 1}:${position.character + 1} ` : ""}${ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n"
      )}${sourceLine ? ` (${sourceLine.trim()})` : ""}`;
    });
    expect(diagnostics).toEqual([]);
  });

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

  it("preserves Activepieces nodes and their encrypted connection bindings", () => {
    const workflow = sourceWorkflow();
    workflow.nodes[1] = {
      id: "source",
      name: "Send Slack message",
      kind: "action",
      operation: "activepieces.piece.action",
      position: { x: 250, y: 0 },
      configuration: {
        activepieces: {
          stepType: "action",
          settings: {
            pieceName: "@activepieces/piece-slack",
            pieceVersion: "0.16.4",
            actionName: "send_channel_message",
            input: { channel: "C123" },
            propertySettings: {},
          },
        },
      },
      credentialReferences: ["slack-main"],
    };

    const compiled = compileStudioV2WorkflowToTriggerTask(workflow);
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;

    expect(compiled.artifact.source).toContain('"operation": "activepieces.piece.action"');
    expect(compiled.artifact.source).toContain('"slack-main":"FLOWCORDIA_AP_CONNECTION_');
    expect(compiled.artifact.source).not.toContain(
      '"slack-main":"FLOWCORDIA_CREDENTIAL_SLACK_MAIN"'
    );
  });

  it("carries reviewed retry policy into the deployed Trigger task", () => {
    const workflow = sourceWorkflow();
    workflow.nodes[0]!.runtime = {
      maxDurationSeconds: 120,
      retry: {
        maxAttempts: 3,
        minTimeoutMs: 1_000,
        maxTimeoutMs: 10_000,
        factor: 2,
      },
    };

    const compiled = compileStudioV2WorkflowToTriggerTask(workflow);
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;

    expect(compiled.artifact.source).toContain("maxDuration: 120");
    expect(compiled.artifact.source).toContain("maxAttempts: 3");
    expect(compiled.artifact.source).toContain("minTimeoutInMs: 1000");
    expect(compiled.artifact.source).toContain("maxTimeoutInMs: 10000");
    expect(compiled.artifact.source).toContain("factor: 2");
    expect(compiled.artifact.source).toContain("randomize: true");
  });
});
