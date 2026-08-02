import { describe, expect, it, vi } from "vitest";

vi.mock("./activepieces-interaction.server", () => ({
  StudioV2ActivepiecesInteractionError: class extends Error {},
  executeStudioV2ActivepiecesInteraction: vi.fn(),
}));

import { handleStudioV2ActivepiecesApi } from "./activepieces-api.server";

const adapterContext = {
  organizationId: "organization_123",
  projectId: "project_123",
  environmentId: "environment_123",
  actorId: "user_123",
} as const;

describe("Studio V2 Activepieces backend adapter", () => {
  it("serves compatibility reads for the authenticated Flowcordia project", async () => {
    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/projects",
        },
        ...adapterContext,
        canWrite: false,
      })
    ).resolves.toMatchObject({
      data: [{ id: "project_123", platformId: "flowcordia" }],
      next: null,
      previous: null,
    });

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/flows/flow_123/versions",
        },
        ...adapterContext,
        canWrite: false,
      })
    ).resolves.toEqual({ data: [], next: null, previous: null });

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/ai-providers",
        },
        ...adapterContext,
        canWrite: false,
      })
    ).resolves.toEqual([]);
  });

  it("delegates Activepieces piece requests to the official catalog adapter", async () => {
    const calls: unknown[] = [];
    const pieceAdapter = async (input: unknown) => {
      calls.push(input);
      return [{ name: "@activepieces/piece-slack", version: "0.11.0" }];
    };

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/pieces",
          query: { searchQuery: "slack" },
        },
        ...adapterContext,
        canWrite: false,
        pieceAdapter,
      })
    ).resolves.toEqual([{ name: "@activepieces/piece-slack", version: "0.11.0" }]);

    expect(calls).toEqual([
      {
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/pieces",
          query: { searchQuery: "slack" },
        },
        canWrite: false,
      },
    ]);
  });

  it("delegates Activepieces connection requests to the environment-scoped adapter", async () => {
    const calls: unknown[] = [];
    const connectionAdapter = async (input: unknown) => {
      calls.push(input);
      return { data: [], next: null, previous: null };
    };

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/app-connections",
        },
        ...adapterContext,
        canWrite: false,
        connectionAdapter,
      })
    ).resolves.toEqual({ data: [], next: null, previous: null });

    expect(calls).toEqual([
      expect.objectContaining({
        projectId: "project_123",
        environmentId: "environment_123",
        actorId: "user_123",
        canWrite: false,
      }),
    ]);
  });

  it("routes Activepieces OAuth authorization URL requests through the metadata adapter", async () => {
    const calls: unknown[] = [];
    const oauthAdapter = {
      async authorizationUrl(body: unknown) {
        calls.push(body);
        return { authorizationUrl: "https://provider.test/authorize", codeVerifier: "verifier" };
      },
      async claim(body: unknown) {
        return body as Record<string, unknown>;
      },
    };

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "POST",
          path: "/v1/app-connections/oauth2/authorization-url",
          body: { pieceName: "@activepieces/piece-example", clientId: "client-id" },
        },
        ...adapterContext,
        canWrite: true,
        oauthAdapter,
      })
    ).resolves.toEqual({
      authorizationUrl: "https://provider.test/authorize",
      codeVerifier: "verifier",
    });
    expect(calls).toEqual([{ pieceName: "@activepieces/piece-example", clientId: "client-id" }]);
  });

  it("claims OAuth before passing the completed credential to the encrypted connection store", async () => {
    const connectionCalls: Array<Record<string, unknown>> = [];
    const oauthAdapter = {
      async authorizationUrl() {
        return { authorizationUrl: "https://provider.test/authorize" };
      },
      async claim(body: unknown) {
        const request = body as Record<string, unknown>;
        return {
          ...request,
          value: {
            type: "OAUTH2",
            access_token: "access-token",
            refresh_token: "refresh-token",
          },
        };
      },
    };
    const connectionAdapter = async (input: Record<string, unknown>) => {
      connectionCalls.push(input);
      return { id: "connection_123", type: "OAUTH2" };
    };

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "POST",
          path: "/v1/app-connections",
          body: {
            type: "OAUTH2",
            externalId: "example-main",
            displayName: "Example",
            pieceName: "@activepieces/piece-example",
            pieceVersion: "1.0.0",
            value: { type: "OAUTH2", code: "authorization-code" },
          },
        },
        ...adapterContext,
        canWrite: true,
        oauthAdapter,
        connectionAdapter,
      })
    ).resolves.toEqual({ id: "connection_123", type: "OAUTH2" });

    expect(connectionCalls).toHaveLength(1);
    expect(connectionCalls[0]).toMatchObject({
      projectId: "project_123",
      environmentId: "environment_123",
      actorId: "user_123",
      canWrite: true,
      command: {
        method: "POST",
        path: "/v1/app-connections",
        body: {
          type: "OAUTH2",
          value: { access_token: "access-token", refresh_token: "refresh-token" },
        },
      },
    });
  });

  it("delegates Activepieces variable requests to the environment-scoped adapter", async () => {
    const calls: unknown[] = [];
    const variableAdapter = async (input: unknown) => {
      calls.push(input);
      return { data: [], next: null, previous: null };
    };

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/variables",
        },
        ...adapterContext,
        canWrite: false,
        variableAdapter,
      })
    ).resolves.toEqual({ data: [], next: null, previous: null });

    expect(calls).toEqual([
      expect.objectContaining({
        projectId: "project_123",
        environmentId: "environment_123",
        actorId: "user_123",
        canWrite: false,
      }),
    ]);
  });

  it("returns an Activepieces-compatible trigger status report", async () => {
    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/trigger-runs/status",
        },
        ...adapterContext,
        canWrite: false,
      })
    ).resolves.toEqual({ pieces: {} });
  });

  it("stores bounded trigger mock data for the exact Studio environment", async () => {
    const created = await handleStudioV2ActivepiecesApi({
      command: {
        intent: "activepieces_api",
        method: "POST",
        path: "/v1/trigger-events",
        body: { flowId: "flow_123", projectId: "project_123", mockData: { hello: "world" } },
      },
      ...adapterContext,
      canWrite: true,
    });
    expect(created).toMatchObject({
      projectId: "project_123",
      flowId: "flow_123",
      payload: { hello: "world" },
    });

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/trigger-events",
          query: { flowId: "flow_123", limit: 5 },
        },
        ...adapterContext,
        canWrite: false,
      })
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ payload: { hello: "world" } })],
      next: null,
      previous: null,
    });
  });

  it("keeps unsupported action test mutations explicit until the Trigger.dev result bridge lands", async () => {
    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "POST",
          path: "/v1/sample-data/test-step",
          body: {},
        },
        ...adapterContext,
        canWrite: true,
      })
    ).rejects.toMatchObject({
      code: "activepieces_backend_not_mapped",
      status: 501,
    });
  });
});
