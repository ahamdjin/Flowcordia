import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,
  collectFlowcordiaActivepiecesPieceDependencies,
  exactFlowcordiaActivepiecesPieceVersion,
  type JsonValue,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowcordia/workflow";
import { executeFlowcordiaActivepiecesAction } from "./activepieces.js";
import { createPreviewRuntimeAdapters, executeFlowcordiaWorkflow } from "./runtime.js";

const genericAction: WorkflowNode = {
  id: "slack_step",
  name: "Slack",
  kind: "action",
  operation: FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,
  position: { x: 300, y: 100 },
  configuration: {
    activepieces: {
      stepType: "action",
      settings: {
        pieceName: "@activepieces/piece-slack",
        pieceVersion: "~0.17.5",
        actionName: "send_channel_message",
        input: {
          auth: "{{connections['slack-main']}}",
          channel: "C123",
          text: "ap-formula-v1::{{{{source.output.message}}}}::ap-formula-v1",
        },
        propertySettings: {},
      },
    },
  },
  credentialReferences: ["slack-main"],
};

describe("Flowcordia Activepieces Trigger runtime", () => {
  it("matches Activepieces ^/~ version semantics while pinning deployment packages", () => {
    expect(exactFlowcordiaActivepiecesPieceVersion("~0.17.5")).toBe("0.17.5");
    expect(exactFlowcordiaActivepiecesPieceVersion("^0.17.5")).toBe("0.17.5");
    expect(exactFlowcordiaActivepiecesPieceVersion("0.17.5")).toBe("0.17.5");

    const workflow: WorkflowDefinition = {
      schemaVersion: "0.1",
      id: "activepieces_versions",
      name: "Activepieces versions",
      nodes: [
        {
          id: "manual_trigger",
          kind: "trigger",
          operation: "trigger.manual",
          position: { x: 0, y: 0 },
          configuration: {},
        },
        genericAction,
        {
          ...genericAction,
          id: "slack_step_two",
          position: { x: 500, y: 100 },
          configuration: {
            activepieces: {
              stepType: "action",
              settings: {
                ...(genericAction.configuration.activepieces as Record<string, any>).settings,
                pieceVersion: "^0.17.5",
              },
            },
          },
        },
      ],
      edges: [
        { id: "trigger_to_slack", source: "manual_trigger", target: "slack_step" },
        { id: "slack_chain", source: "slack_step", target: "slack_step_two" },
      ],
    };

    expect(collectFlowcordiaActivepiecesPieceDependencies(workflow)).toEqual([
      { packageName: "@activepieces/piece-slack", version: "0.17.5" },
    ]);
  });

  it("executes the exact piece action with resolved auth and formula props", async () => {
    const formulaCalls: Array<{ expression: string; sampleData: Record<string, unknown> }> = [];
    const result = await executeFlowcordiaActivepiecesAction({
      node: genericAction,
      workflowInput: { initial: true },
      outputs: { source: { message: "hello" } },
      services: {
        async loadPiece(packageName) {
          expect(packageName).toBe("@activepieces/piece-slack");
          return {
            slack: {
              name: packageName,
              actions: {
                send_channel_message: {
                  async run(context: Record<string, any>) {
                    return {
                      auth: context.auth,
                      channel: context.propsValue.channel,
                      text: context.propsValue.text,
                      connection: await context.connections.get("slack-main"),
                    };
                  },
                },
              },
              triggers: {},
            },
          };
        },
        async resolveConnection(externalId) {
          expect(externalId).toBe("slack-main");
          return {
            schemaVersion: 1,
            kind: "activepieces_connection",
            value: { type: "CUSTOM_AUTH", props: { bot_token: "secret-token" } },
          };
        },
        formulaEvaluator: {
          containsWrapper: (value) => value.startsWith("ap-formula-v1::"),
          evaluate(input) {
            formulaCalls.push(input);
            return {
              result: ((input.sampleData.source as any).output as any).message,
              error: null,
            };
          },
        },
        runId: "run_123",
      },
    });

    expect(result).toEqual({
      auth: { type: "CUSTOM_AUTH", props: { bot_token: "secret-token" } },
      channel: "C123",
      text: "hello",
      connection: { type: "CUSTOM_AUTH", props: { bot_token: "secret-token" } },
    });
    expect(formulaCalls).toHaveLength(1);
    expect(formulaCalls[0]?.sampleData).toMatchObject({
      source: { output: { message: "hello" } },
    });
  });

  it("treats generic Activepieces actions as supported workflow nodes", async () => {
    const workflow: WorkflowDefinition = {
      schemaVersion: "0.1",
      id: "activepieces_runtime",
      name: "Activepieces runtime",
      nodes: [
        {
          id: "manual_trigger",
          kind: "trigger",
          operation: "trigger.manual",
          position: { x: 0, y: 0 },
          configuration: {},
        },
        genericAction,
        {
          id: "result",
          kind: "output",
          operation: "output.return",
          position: { x: 600, y: 100 },
          configuration: {},
        },
      ],
      edges: [
        { id: "trigger_to_slack", source: "manual_trigger", target: "slack_step" },
        { id: "slack_to_result", source: "slack_step", target: "result" },
      ],
    };
    const output: JsonValue = { sent: true };
    const result = await executeFlowcordiaWorkflow(
      workflow,
      { input: true },
      createPreviewRuntimeAdapters({ activepiecesMocks: { slack_step: output } })
    );
    expect(result.success).toBe(true);
    expect(result.output).toEqual(output);
    expect(result.traces.find((trace) => trace.nodeId === "slack_step")).toMatchObject({
      operation: FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,
      status: "SUCCEEDED",
      output,
    });
  });
});
