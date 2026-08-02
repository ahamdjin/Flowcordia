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

  it("keeps the temporary piece reads local until the exact server source lands", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const pieces = await api.get<Array<{ name: string }>>("/v1/pieces");
    expect(pieces.some((piece) => piece.name === "@activepieces/piece-http")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
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
