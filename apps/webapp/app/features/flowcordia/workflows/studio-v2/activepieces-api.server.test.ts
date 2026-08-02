import { describe, expect, it } from "vitest";
import { handleStudioV2ActivepiecesApi } from "./activepieces-api.server";

const adapterContext = {
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

  it("fails unmapped runtime mutations explicitly instead of invoking Activepieces workers", async () => {
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
