import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,
  collectFlowcordiaActivepiecesPieceDependencies,
  exactFlowcordiaActivepiecesPieceVersion,
  type JsonValue,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowcordia/workflow";
import {
  executeFlowcordiaActivepiecesAction,
  executeFlowcordiaActivepiecesProperty,
  executeFlowcordiaActivepiecesTriggerDisable,
  executeFlowcordiaActivepiecesTriggerEnable,
  executeFlowcordiaActivepiecesTriggerRun,
  executeFlowcordiaActivepiecesTriggerTest,
  inspectFlowcordiaActivepiecesTrigger,
} from "./activepieces.js";
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

  it("executes Activepieces dynamic dropdowns with the exact property context", async () => {
    const result = await executeFlowcordiaActivepiecesProperty({
      interaction: {
        pieceName: "@activepieces/piece-slack",
        actionOrTriggerName: "send_channel_message",
        propertyName: "channel",
        input: { auth: "{{connections['slack-main']}}" },
        searchValue: "eng",
      },
      services: {
        async loadPiece() {
          return {
            slack: {
              name: "@activepieces/piece-slack",
              actions: {
                send_channel_message: {
                  props: {
                    channel: {
                      type: "DROPDOWN",
                      async options(props: Record<string, any>, context: Record<string, any>) {
                        return {
                          disabled: false,
                          options: [
                            {
                              label: `${context.searchValue}:${props.auth.props.bot_token}`,
                              value: "C123",
                            },
                          ],
                        };
                      },
                    },
                  },
                },
              },
              triggers: {},
            },
          };
        },
        async resolveConnection() {
          return {
            kind: "activepieces_connection",
            value: { type: "CUSTOM_AUTH", props: { bot_token: "secret-token" } },
          };
        },
      },
    });

    expect(result).toEqual({
      type: "DROPDOWN",
      options: {
        disabled: false,
        options: [{ label: "eng:secret-token", value: "C123" }],
      },
    });
  });

  it("executes Activepieces dynamic property maps", async () => {
    const result = await executeFlowcordiaActivepiecesProperty({
      interaction: {
        pieceName: "@activepieces/piece-example",
        actionOrTriggerName: "dynamic_action",
        propertyName: "fields",
        input: { resource: "contact" },
      },
      services: {
        async loadPiece() {
          return {
            example: {
              name: "@activepieces/piece-example",
              actions: {
                dynamic_action: {
                  props: {
                    fields: {
                      type: "DYNAMIC",
                      async props(props: Record<string, any>) {
                        return {
                          name: {
                            displayName: `${props.resource} name`,
                            required: true,
                            type: "SHORT_TEXT",
                          },
                        };
                      },
                    },
                  },
                },
              },
              triggers: {},
            },
          };
        },
        resolveConnection: async () => null,
      },
    });

    expect(result).toEqual({
      type: "DYNAMIC",
      options: {
        name: { displayName: "contact name", required: true, type: "SHORT_TEXT" },
      },
    });
  });

  it("executes the exact Activepieces trigger test function", async () => {
    const result = await executeFlowcordiaActivepiecesTriggerTest({
      interaction: {
        pieceName: "@activepieces/piece-example",
        triggerName: "new_item",
        input: { auth: "{{connections['example-main']}}", folder: "inbox" },
      },
      services: {
        async loadPiece() {
          return {
            example: {
              name: "@activepieces/piece-example",
              actions: {},
              triggers: {
                new_item: {
                  type: "POLLING",
                  testStrategy: "TEST_FUNCTION",
                  async test(context: Record<string, any>) {
                    return [
                      {
                        folder: context.propsValue.folder,
                        auth: context.auth,
                        projectId: context.project.id,
                      },
                    ];
                  },
                },
              },
            },
          };
        },
        async resolveConnection() {
          return {
            kind: "activepieces_connection",
            value: { type: "SECRET_TEXT", secret_text: "token" },
          };
        },
        projectId: "project_123",
      },
    });

    expect(result).toEqual([
      {
        folder: "inbox",
        auth: { type: "SECRET_TEXT", secret_text: "token" },
        projectId: "project_123",
      },
    ]);
  });

  it("keeps simulated webhook lifecycle inside the exact Activepieces trigger hooks", async () => {
    const lifecycle: string[] = [];
    const trigger = {
      type: "WEBHOOK",
      testStrategy: "SIMULATION",
      async onEnable(context: Record<string, any>) {
        lifecycle.push(`enable:${context.webhookUrl}:${context.propsValue.folder}`);
      },
      async run(context: Record<string, any>) {
        lifecycle.push(`run:${context.payload.method}:${context.payload.headers["x-event"]}`);
        return [
          {
            body: context.payload.body,
            rawBody: context.payload.rawBody,
            queryParams: context.payload.queryParams,
          },
        ];
      },
      async onDisable(context: Record<string, any>) {
        lifecycle.push(`disable:${context.webhookUrl}`);
      },
    };
    const services = {
      async loadPiece() {
        return {
          example: {
            name: "@activepieces/piece-example",
            actions: {},
            triggers: { new_item: trigger },
          },
        };
      },
      resolveConnection: async () => null,
    };
    const interaction = {
      pieceName: "@activepieces/piece-example",
      triggerName: "new_item",
      input: { folder: "inbox" },
      webhookUrl: "https://flowcordia.test/ap-simulation/token",
      payload: {
        method: "POST",
        headers: { "x-event": "created", "content-type": "application/json" },
        queryParams: { source: "provider" },
        body: { id: 123 },
        rawBody: '{"id":123}',
      },
    } as const;

    await expect(inspectFlowcordiaActivepiecesTrigger({ interaction, services })).resolves.toEqual({
      triggerType: "WEBHOOK",
      testStrategy: "SIMULATION",
    });
    await expect(
      executeFlowcordiaActivepiecesTriggerTest({ interaction, services })
    ).rejects.toThrow("requires simulation instead of a test function");

    await expect(
      executeFlowcordiaActivepiecesTriggerEnable({ interaction, services })
    ).resolves.toEqual({
      triggerType: "WEBHOOK",
      testStrategy: "SIMULATION",
      schedule: null,
      appListeners: [],
    });
    await expect(
      executeFlowcordiaActivepiecesTriggerRun({ interaction, services })
    ).resolves.toEqual([
      {
        body: { id: 123 },
        rawBody: '{"id":123}',
        queryParams: { source: "provider" },
      },
    ]);
    await executeFlowcordiaActivepiecesTriggerDisable({ interaction, services });

    expect(lifecycle).toEqual([
      "enable:https://flowcordia.test/ap-simulation/token:inbox",
      "run:POST:created",
      "disable:https://flowcordia.test/ap-simulation/token",
    ]);
  });

  it("captures exact Activepieces polling schedules and app-webhook listeners", async () => {
    const pollingServices = {
      async loadPiece() {
        return {
          example: {
            name: "@activepieces/piece-example",
            actions: {},
            triggers: {
              polling: {
                type: "POLLING",
                testStrategy: "TEST_FUNCTION",
                async onEnable(context: Record<string, any>) {
                  context.setSchedule({ cronExpression: "0 * * * *", timezone: "UTC" });
                },
              },
              app_hook: {
                type: "APP_WEBHOOK",
                testStrategy: "SIMULATION",
                async onEnable(context: Record<string, any>) {
                  context.app.createListeners({
                    events: ["message.created", "message.updated"],
                    identifierValue: "workspace_123",
                  });
                },
              },
            },
          },
        };
      },
      resolveConnection: async () => null,
    };

    await expect(
      executeFlowcordiaActivepiecesTriggerEnable({
        interaction: {
          pieceName: "@activepieces/piece-example",
          triggerName: "polling",
          input: {},
        },
        services: pollingServices,
      })
    ).resolves.toMatchObject({
      triggerType: "POLLING",
      testStrategy: "TEST_FUNCTION",
      schedule: { cronExpression: "0 * * * *", timezone: "UTC" },
    });

    await expect(
      executeFlowcordiaActivepiecesTriggerEnable({
        interaction: {
          pieceName: "@activepieces/piece-example",
          triggerName: "app_hook",
          input: {},
          webhookUrl: "https://flowcordia.test/app-events",
        },
        services: pollingServices,
      })
    ).resolves.toMatchObject({
      triggerType: "APP_WEBHOOK",
      testStrategy: "SIMULATION",
      appListeners: [
        {
          events: ["message.created", "message.updated"],
          identifierValue: "workspace_123",
        },
      ],
    });
  });

  it("passes mapped Activepieces context capabilities instead of failing closed", async () => {
    const store = new Map<string, unknown>();
    const result = await executeFlowcordiaActivepiecesAction({
      node: genericAction,
      workflowInput: null,
      outputs: {},
      services: {
        async loadPiece() {
          return {
            slack: {
              name: "@activepieces/piece-slack",
              actions: {
                send_channel_message: {
                  async run(context: Record<string, any>) {
                    await context.store.put("key", "value", "FLOW");
                    const value = await context.store.get("key", "FLOW");
                    await context.tags.add({ name: "sent" });
                    await context.output.update({ data: { sent: true } });
                    return { value };
                  },
                },
              },
              triggers: {},
            },
          };
        },
        resolveConnection: async () => null,
        store: {
          async put(key, value) {
            store.set(key, value);
            return value;
          },
          async get(key) {
            return store.get(key) ?? null;
          },
          async delete(key) {
            store.delete(key);
          },
        },
        addTag: async (name) => expect(name).toBe("sent"),
        updateOutput: async (data) => expect(data).toEqual({ sent: true }),
      },
    });
    expect(result).toEqual({ value: "value" });
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
