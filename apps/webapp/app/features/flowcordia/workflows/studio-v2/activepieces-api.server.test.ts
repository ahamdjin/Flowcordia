import { describe, expect, it } from "vitest";
import { handleStudioV2ActivepiecesApi } from "./activepieces-api.server";

describe("Studio V2 Activepieces backend adapter", () => {
  it("serves compatibility reads for the authenticated Flowcordia project", async () => {
    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/projects",
        },
        projectId: "project_123",
        canWrite: false,
      })
    ).resolves.toMatchObject({
      data: [{ id: "project_123", platformId: "flowcordia" }],
      next: null,
      previous: null,
    });
  });

  it("allows read-only sessions to read but never mutate Activepieces contracts", async () => {
    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "GET",
          path: "/v1/app-connections",
        },
        projectId: "project_123",
        canWrite: false,
      })
    ).resolves.toEqual({ data: [], next: null, previous: null });

    await expect(
      handleStudioV2ActivepiecesApi({
        command: {
          intent: "activepieces_api",
          method: "POST",
          path: "/v1/app-connections",
          body: {},
        },
        projectId: "project_123",
        canWrite: false,
      })
    ).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
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
        projectId: "project_123",
        canWrite: true,
      })
    ).rejects.toMatchObject({
      code: "activepieces_backend_not_mapped",
      status: 501,
    });
  });
});
