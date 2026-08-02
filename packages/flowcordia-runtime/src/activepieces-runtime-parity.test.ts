import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,
  parseFlowcordiaActivepiecesPieceConfiguration,
  type WorkflowNode,
} from "@flowcordia/workflow";
import { createTriggerRuntimeAdapters } from "./runtime.js";

const actionNode: WorkflowNode = {
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
        },
        propertySettings: {},
      },
    },
  },
  credentialReferences: ["slack-main"],
};

function parsedConfiguration() {
  const parsed = parseFlowcordiaActivepiecesPieceConfiguration(actionNode);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error(parsed.message);
  return parsed.configuration;
}

describe("Flowcordia Activepieces runtime parity", () => {
  it("forwards optional runtime services without allowing identity overrides", async () => {
    const values = new Map<string, unknown>();
    const adapters = createTriggerRuntimeAdapters({
      wait: async () => undefined,
      authorizeHttp: () => true,
      async loadActivepiecesPiece(packageName) {
        return {
          slack: {
            name: packageName,
            actions: {
              send_channel_message: {
                async run(context: Record<string, any>) {
                  await context.store.put("shared", context.auth, "PROJECT");
                  return {
                    auth: context.auth,
                    stored: await context.store.get("shared", "PROJECT"),
                  };
                },
              },
            },
            triggers: {},
          },
        };
      },
      async resolveActivepiecesConnection(externalId) {
        expect(externalId).toBe("slack-main");
        return {
          kind: "activepieces_connection",
          value: { type: "SECRET_TEXT", secret_text: "live-secret" },
        };
      },
      activepiecesRuntimeServices: {
        loadPiece: async () => {
          throw new Error("optional services must not override exact piece loading");
        },
        resolveConnection: async () => {
          throw new Error("optional services must not override connection resolution");
        },
        store: {
          async put(key, value) {
            values.set(key, value);
            return value;
          },
          async get(key) {
            return values.get(key) ?? null;
          },
          async delete(key) {
            values.delete(key);
          },
        },
      },
    });

    const result = await adapters.activepieces({
      node: actionNode,
      configuration: parsedConfiguration(),
      workflowInput: null,
      outputs: {},
    });

    expect(result).toEqual({
      auth: { type: "SECRET_TEXT", secret_text: "live-secret" },
      stored: { type: "SECRET_TEXT", secret_text: "live-secret" },
    });
  });

  it("re-enters the exact action as RESUME after a durable waitpoint", async () => {
    let reachedAfterWait = false;
    const adapters = createTriggerRuntimeAdapters({
      wait: async () => undefined,
      authorizeHttp: () => true,
      async loadActivepiecesPiece(packageName) {
        return {
          slack: {
            name: packageName,
            actions: {
              send_channel_message: {
                async run(context: Record<string, any>) {
                  if (context.executionType === "BEGIN") {
                    const waitpoint = await context.run.createWaitpoint({ type: "WEBHOOK" });
                    context.run.waitForWaitpoint(waitpoint.id);
                    reachedAfterWait = true;
                    return { wrong: true };
                  }
                  return {
                    executionType: context.executionType,
                    resumePayload: context.resumePayload,
                  };
                },
              },
            },
            triggers: {},
          },
        };
      },
      resolveActivepiecesConnection: async () => null,
      activepiecesRuntimeServices: {
        createWaitpoint: async () => ({
          id: "waitpoint_123",
          resumeUrl: "https://example.test/waitpoint_123",
          buildResumeUrl: ({ queryParams }) =>
            `https://example.test/waitpoint_123?${new URLSearchParams(queryParams).toString()}`,
        }),
        awaitWaitpoint: async (waitpointId) => {
          expect(waitpointId).toBe("waitpoint_123");
          return {
            body: { approved: true },
            headers: { "content-type": "application/json" },
            queryParams: { action: "approve" },
          };
        },
      },
    });

    const result = await adapters.activepieces({
      node: actionNode,
      configuration: parsedConfiguration(),
      workflowInput: null,
      outputs: {},
    });

    expect(reachedAfterWait).toBe(false);
    expect(result).toEqual({
      executionType: "RESUME",
      resumePayload: {
        body: { approved: true },
        headers: { "content-type": "application/json" },
        queryParams: { action: "approve" },
      },
    });
  });
});
