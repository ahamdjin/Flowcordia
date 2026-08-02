import { afterEach, describe, expect, it, vi } from "vitest";

import { api, configureActivepiecesApiBackend } from "./activepieces-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function success(data: unknown) {
  return new Response(JSON.stringify({ ok: true, intent: "activepieces_api", data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Activepieces pieces API backend contract", () => {
  it("forwards exact piece metadata requests through Flowcordia's authenticated backend", async () => {
    configureActivepiecesApiBackend("/studio-v2");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body));
      expect(command).toEqual({
        intent: "activepieces_api",
        method: "GET",
        path: "/v1/pieces/%40activepieces%2Fpiece-slack",
        query: { version: "~0.11.0" },
      });
      return success({
        name: "@activepieces/piece-slack",
        version: "0.11.4",
        displayName: "Slack",
        actions: {},
        triggers: {},
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.get<{ name: string; version: string }>("/v1/pieces/%40activepieces%2Fpiece-slack", {
        version: "~0.11.0",
      })
    ).resolves.toMatchObject({
      name: "@activepieces/piece-slack",
      version: "0.11.4",
    });
  });

  it("forwards list and registry reads through the exact upstream endpoint shapes", async () => {
    configureActivepiecesApiBackend("/studio-v2");
    const commands: unknown[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body));
      commands.push(command);
      if (command.path === "/v1/pieces") {
        return success([{ name: "@activepieces/piece-slack", version: "0.11.4" }]);
      }
      if (command.path === "/v1/pieces/registry") {
        return success([{ name: "@activepieces/piece-slack", version: "0.11.4" }]);
      }
      throw new Error(`Unexpected path: ${command.path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/v1/pieces", { searchQuery: "slack" })).resolves.toEqual([
      { name: "@activepieces/piece-slack", version: "0.11.4" },
    ]);
    await expect(api.get("/v1/pieces/registry")).resolves.toEqual([
      { name: "@activepieces/piece-slack", version: "0.11.4" },
    ]);

    expect(commands).toEqual([
      {
        intent: "activepieces_api",
        method: "GET",
        path: "/v1/pieces",
        query: { searchQuery: "slack" },
      },
      {
        intent: "activepieces_api",
        method: "GET",
        path: "/v1/pieces/registry",
      },
    ]);
  });

  it("surfaces backend piece version and identity errors without local catalog fallbacks", async () => {
    configureActivepiecesApiBackend("/studio-v2");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              code: "activepieces_piece_not_found",
              message: "Activepieces piece metadata was not found for @activepieces/piece-future@1.0.0.",
            }),
            { status: 404, headers: { "content-type": "application/json" } }
          )
      )
    );

    const error = await api
      .get("/v1/pieces/%40activepieces%2Fpiece-future", { version: "1.0.0" })
      .catch((caught) => caught);

    expect(api.isError(error)).toBe(true);
    expect(error.response.status).toBe(404);
    expect(error.response.data.code).toBe("activepieces_piece_not_found");
    expect(api.extractServerErrorMessage(error, "fallback")).toContain("piece-future@1.0.0");
  });
});
