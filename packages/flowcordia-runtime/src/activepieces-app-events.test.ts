import { describe, expect, it } from "vitest";
import { executeFlowcordiaActivepiecesAppEventParse } from "./activepieces-app-events.js";

function services(parseAndReply: (context: Record<string, any>) => unknown) {
  return {
    serverPublicUrl: "https://flowcordia.test",
    async loadPiece() {
      return {
        example: {
          name: "@activepieces/piece-example",
          actions: {},
          triggers: {},
          events: { parseAndReply },
        },
      };
    },
  };
}

const payload = {
  method: "POST",
  headers: { "x-event": "created" },
  queryParams: { team: "team_123" },
  body: { id: "evt_123" },
  rawBody: '{"id":"evt_123"}',
};

describe("Activepieces app-event routing", () => {
  it("returns the exact provider reply from piece.events.parseAndReply", async () => {
    await expect(
      executeFlowcordiaActivepiecesAppEventParse({
        pieceName: "@activepieces/piece-example",
        payload,
        services: services(({ payload: received, server }) => {
          expect(received).toEqual(payload);
          expect(server.publicUrl).toBe("https://flowcordia.test");
          return {
            reply: {
              headers: { "x-provider-verification": "ok" },
              body: { challenge: received.queryParams.team },
            },
          };
        }),
      })
    ).resolves.toEqual({
      reply: {
        headers: { "x-provider-verification": "ok" },
        body: { challenge: "team_123" },
      },
      event: null,
      identifierValue: null,
    });
  });

  it("returns exact event and identifier routing keys", async () => {
    await expect(
      executeFlowcordiaActivepiecesAppEventParse({
        pieceName: "@activepieces/piece-example",
        payload,
        services: services(() => ({
          event: "message.created",
          identifierValue: "workspace_123",
        })),
      })
    ).resolves.toEqual({
      reply: null,
      event: "message.created",
      identifierValue: "workspace_123",
    });
  });

  it("fails closed when a piece has no app-event processor", async () => {
    await expect(
      executeFlowcordiaActivepiecesAppEventParse({
        pieceName: "@activepieces/piece-example",
        payload,
        services: {
          serverPublicUrl: "https://flowcordia.test",
          async loadPiece() {
            return {
              example: {
                name: "@activepieces/piece-example",
                actions: {},
                triggers: {},
              },
            };
          },
        },
      })
    ).rejects.toThrow("does not expose app-event routing");
  });
});
