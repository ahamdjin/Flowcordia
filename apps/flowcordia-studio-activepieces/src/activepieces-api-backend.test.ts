import { afterEach, describe, expect, it, vi } from "vitest";
import { api, configureActivepiecesApiBackend } from "./activepieces-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Flowcordia Activepieces API backend transport", () => {
  it("forwards non-local reads through the authenticated Studio action URL", async () => {
    configureActivepiecesApiBackend("/studio-v2");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body));
      expect(command).toEqual({
        intent: "activepieces_api",
        method: "GET",
        path: "/v1/projects",
        query: { limit: 10 },
      });
      return new Response(
        JSON.stringify({
          ok: true,
          intent: "activepieces_api",
          data: { data: [{ id: "project_123" }], next: null, previous: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/v1/projects", { limit: 10 })).resolves.toMatchObject({
      data: [{ id: "project_123" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/studio-v2",
      expect.objectContaining({ method: "POST", credentials: "same-origin" })
    );
  });

  it("forwards piece reads through the authenticated Studio backend", async () => {
    configureActivepiecesApiBackend("/studio-v2");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body));
      expect(command).toEqual({
        intent: "activepieces_api",
        method: "GET",
        path: "/v1/pieces",
        query: { searchQuery: "slack" },
      });
      return new Response(
        JSON.stringify({
          ok: true,
          intent: "activepieces_api",
          data: [{ name: "@activepieces/piece-slack", version: "0.11.0" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.get<Array<{ name: string }>>("/v1/pieces", { searchQuery: "slack" })
    ).resolves.toEqual([{ name: "@activepieces/piece-slack", version: "0.11.0" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces Flowcordia backend failures as Axios-compatible errors", async () => {
    configureActivepiecesApiBackend("/studio-v2");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              code: "activepieces_backend_not_mapped",
              message: "Not mapped",
            }),
            { status: 501, headers: { "content-type": "application/json" } }
          )
      )
    );

    const error = await api.post("/v1/sample-data/test-step", {}).catch((caught) => caught);
    expect(api.isError(error)).toBe(true);
    expect(api.extractServerErrorMessage(error, "fallback")).toBe("Not mapped");
    expect(error.response.status).toBe(501);
  });
});
