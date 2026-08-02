import { describe, expect, it } from "vitest";

import {
  createStudioV2ActivepiecesConnectionAdapter,
  type StudioV2ActivepiecesConnectionSecretStore,
} from "./activepieces-connections.server";

function memoryStore() {
  const values = new Map<string, string>();
  const store: StudioV2ActivepiecesConnectionSecretStore = {
    async list() {
      return Array.from(values, ([key, value]) => ({ key, value }));
    },
    async put(input) {
      values.set(input.key, input.value);
    },
    async delete(input) {
      values.delete(input.key);
    },
  };
  return { store, values };
}

describe("Studio V2 claimed Activepieces OAuth storage", () => {
  it("accepts only the completed OAuth value and never exposes tokens publicly", async () => {
    const { store, values } = memoryStore();
    const handle = createStudioV2ActivepiecesConnectionAdapter(store);
    const context = {
      projectId: "project_123",
      environmentId: "environment_123",
      actorId: "user_123",
      canWrite: true,
    } as const;

    const created = (await handle({
      ...context,
      command: {
        method: "POST",
        path: "/v1/app-connections",
        body: {
          externalId: "oauth-main",
          displayName: "OAuth main",
          pieceName: "@activepieces/piece-example",
          projectId: context.projectId,
          type: "OAUTH2",
          pieceVersion: "1.0.0",
          value: {
            type: "OAUTH2",
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "Bearer",
            claimed_at: 1_800_000_000,
            token_url: "https://provider.test/token",
            client_id: "client-id",
            client_secret: "client-secret",
            redirect_url: "https://flowcordia.test/oauth/callback",
            scope: "read",
            data: {},
          },
        },
      },
    })) as Record<string, unknown>;

    expect(created).toMatchObject({
      externalId: "oauth-main",
      type: "OAUTH2",
      status: "ACTIVE",
    });
    expect(created).not.toHaveProperty("value");
    expect(JSON.stringify(created)).not.toContain("access-token");
    expect(Array.from(values.values())[0]).toContain("access-token");
    expect(Array.from(values.values())[0]).toContain("client-secret");

    const listed = await handle({
      ...context,
      canWrite: false,
      command: { method: "GET", path: "/v1/app-connections" },
    });
    expect(JSON.stringify(listed)).not.toContain("access-token");
    expect(JSON.stringify(listed)).not.toContain("refresh-token");
    expect(JSON.stringify(listed)).not.toContain("client-secret");
  });
});
