import { describe, expect, it } from "vitest";
import {
  executeFlowcordiaActivepiecesTriggerHandshake,
  executeFlowcordiaActivepiecesTriggerRenew,
  inspectFlowcordiaActivepiecesWebhookTrigger,
} from "./activepieces.js";

function fixture() {
  const calls: Array<Record<string, unknown>> = [];
  const services = {
    async loadPiece() {
      return {
        example: {
          name: "@activepieces/piece-example",
          actions: {},
          triggers: {
            provider_hook: {
              type: "WEBHOOK",
              testStrategy: "SIMULATION",
              handshakeConfiguration: {
                strategy: "HEADER_PRESENT",
                paramName: "x-provider-challenge",
              },
              renewConfiguration: {
                strategy: "CRON",
                cronExpression: "0 0 * * *",
              },
              async onHandshake(context: Record<string, any>) {
                calls.push({
                  hook: "handshake",
                  auth: context.auth,
                  webhookUrl: context.webhookUrl,
                  method: context.payload.method,
                  challenge: context.payload.headers["x-provider-challenge"],
                });
                return {
                  status: 202,
                  headers: { "x-flowcordia-handshake": "accepted" },
                  body: { challenge: context.payload.headers["x-provider-challenge"] },
                };
              },
              async onRenew(context: Record<string, any>) {
                calls.push({
                  hook: "renew",
                  auth: context.auth,
                  webhookUrl: context.webhookUrl,
                  folder: context.propsValue.folder,
                });
              },
            },
          },
        },
      };
    },
    async resolveConnection(externalId: string) {
      expect(externalId).toBe("provider-main");
      return {
        kind: "activepieces_connection",
        value: { type: "SECRET_TEXT", secret_text: "provider-token" },
      };
    },
    projectId: "project_123",
  };
  const interaction = {
    pieceName: "@activepieces/piece-example",
    triggerName: "provider_hook",
    input: {
      auth: "{{connections['provider-main']}}",
      folder: "inbox",
    },
    webhookUrl: "https://flowcordia.test/api/v1/activepieces/provider-hook",
    payload: {
      method: "POST",
      headers: { "x-provider-challenge": "challenge-123" },
      queryParams: {},
      body: { verification: true },
      rawBody: '{"verification":true}',
    },
  } as const;
  return { calls, services, interaction };
}

describe("Activepieces webhook trigger hooks", () => {
  it("surfaces the exact handshake and renewal configurations", async () => {
    const { services, interaction } = fixture();

    await expect(
      inspectFlowcordiaActivepiecesWebhookTrigger({ interaction, services })
    ).resolves.toEqual({
      triggerType: "WEBHOOK",
      testStrategy: "SIMULATION",
      handshakeConfiguration: {
        strategy: "HEADER_PRESENT",
        paramName: "x-provider-challenge",
      },
      renewConfiguration: {
        strategy: "CRON",
        cronExpression: "0 0 * * *",
      },
    });
  });

  it("runs onHandshake with the exact resolved Activepieces context and response", async () => {
    const { calls, services, interaction } = fixture();

    await expect(
      executeFlowcordiaActivepiecesTriggerHandshake({ interaction, services })
    ).resolves.toEqual({
      status: 202,
      headers: { "x-flowcordia-handshake": "accepted" },
      body: { challenge: "challenge-123" },
    });

    expect(calls).toEqual([
      {
        hook: "handshake",
        auth: { type: "SECRET_TEXT", secret_text: "provider-token" },
        webhookUrl: "https://flowcordia.test/api/v1/activepieces/provider-hook",
        method: "POST",
        challenge: "challenge-123",
      },
    ]);
  });

  it("runs onRenew with the same exact resolved Activepieces context", async () => {
    const { calls, services, interaction } = fixture();

    await executeFlowcordiaActivepiecesTriggerRenew({ interaction, services });

    expect(calls).toEqual([
      {
        hook: "renew",
        auth: { type: "SECRET_TEXT", secret_text: "provider-token" },
        webhookUrl: "https://flowcordia.test/api/v1/activepieces/provider-hook",
        folder: "inbox",
      },
    ]);
  });
});
