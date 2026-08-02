import { describe, expect, it } from "vitest";
import {
  ACTIVEPIECES_STUDIO_RELEASE,
  createStudioV2ActivepiecesPieceAdapter,
} from "./activepieces-pieces.server";

function command(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  query?: Record<string, unknown>
) {
  return {
    intent: "activepieces_api" as const,
    method,
    path,
    query,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Studio V2 Activepieces official piece catalog", () => {
  it("loads the canonical CE registry for the pinned Activepieces release", async () => {
    const requests: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.toString());
      return jsonResponse([{ name: "@activepieces/piece-slack", version: "0.11.0" }]);
    }) as typeof fetch;
    const adapter = createStudioV2ActivepiecesPieceAdapter({ fetchImpl });

    await expect(
      adapter({ command: command("GET", "/v1/pieces/registry"), canWrite: false })
    ).resolves.toEqual([{ name: "@activepieces/piece-slack", version: "0.11.0" }]);

    expect(requests).toHaveLength(1);
    const registryUrl = new URL(requests[0]);
    expect(registryUrl.pathname).toBe("/api/v1/pieces/registry");
    expect(registryUrl.searchParams.get("edition")).toBe("ce");
    expect(registryUrl.searchParams.get("release")).toBe(ACTIVEPIECES_STUDIO_RELEASE);
  });

  it("filters newer catalog entries and pins summaries to the latest compatible release version", async () => {
    const requests: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.toString());
      if (url.pathname.endsWith("/pieces/registry")) {
        return jsonResponse([
          { name: "@activepieces/piece-slack", version: "0.11.0" },
          { name: "@activepieces/piece-slack", version: "0.12.0" },
        ]);
      }
      if (url.pathname === "/api/v1/pieces") {
        return jsonResponse([
          {
            name: "@activepieces/piece-slack",
            version: "0.13.0",
            displayName: "Slack",
            deprecated: false,
            actions: 99,
            triggers: 99,
            suggestedActions: [{ name: "post_message" }],
          },
          {
            name: "@activepieces/piece-future",
            version: "1.0.0",
            displayName: "Future Piece",
            actions: 1,
            triggers: 0,
          },
        ]);
      }
      if (url.pathname.endsWith("/pieces/%40activepieces%2Fpiece-slack")) {
        expect(url.searchParams.get("version")).toBe("0.12.0");
        return jsonResponse({
          name: "@activepieces/piece-slack",
          version: "0.12.0",
          displayName: "Slack",
          deprecated: false,
          actions: {
            post_message: { name: "post_message", displayName: "Post message" },
            find_user: { name: "find_user", displayName: "Find user" },
          },
          triggers: {
            new_message: { name: "new_message", displayName: "New message" },
          },
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    }) as typeof fetch;
    const adapter = createStudioV2ActivepiecesPieceAdapter({ fetchImpl });

    const result = await adapter({
      command: command("GET", "/v1/pieces", { searchQuery: "slack", includeHidden: false }),
      canWrite: false,
    });

    expect(result).toEqual([
      expect.objectContaining({
        name: "@activepieces/piece-slack",
        version: "0.12.0",
        actions: 2,
        triggers: 1,
        suggestedActions: [{ name: "post_message", displayName: "Post message" }],
      }),
    ]);
    expect(requests.some((request) => request.includes("piece-future"))).toBe(false);
    const listUrl = new URL(
      requests.find((request) => new URL(request).pathname === "/api/v1/pieces")!
    );
    expect(listUrl.searchParams.get("searchQuery")).toBe("slack");
    expect(listUrl.searchParams.get("includeHidden")).toBe("true");
    expect(listUrl.searchParams.get("release")).toBe(ACTIVEPIECES_STUDIO_RELEASE);
    expect(listUrl.searchParams.get("edition")).toBe("ce");
    expect(requests.some((request) => request.includes("%2Fpiece-slack"))).toBe(true);
  });

  it("resolves Activepieces wildcard piece versions against the pinned registry", async () => {
    const requests: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.toString());
      if (url.pathname.endsWith("/pieces/registry")) {
        return jsonResponse([
          { name: "@activepieces/piece-http", version: "0.11.0" },
          { name: "@activepieces/piece-http", version: "0.11.4" },
          { name: "@activepieces/piece-http", version: "0.12.0" },
        ]);
      }
      return jsonResponse({
        name: "@activepieces/piece-http",
        version: url.searchParams.get("version"),
        displayName: "HTTP",
        actions: {},
        triggers: {},
      });
    }) as typeof fetch;
    const adapter = createStudioV2ActivepiecesPieceAdapter({ fetchImpl });

    await expect(
      adapter({
        command: command("GET", "/v1/pieces/@activepieces/piece-http", {
          version: "~0.11.0",
        }),
        canWrite: false,
      })
    ).resolves.toMatchObject({ version: "0.11.4" });

    const metadataUrl = new URL(requests.at(-1)!);
    expect(metadataUrl.pathname).toContain("%40activepieces%2Fpiece-http");
    expect(metadataUrl.searchParams.get("version")).toBe("0.11.4");
  });

  it("keeps dynamic piece options out of the Activepieces worker runtime", async () => {
    const adapter = createStudioV2ActivepiecesPieceAdapter({
      fetchImpl: (async () => {
        throw new Error("fetch must not run");
      }) as typeof fetch,
    });

    await expect(
      adapter({ command: command("POST", "/v1/pieces/options"), canWrite: true })
    ).rejects.toMatchObject({
      code: "activepieces_piece_options_not_mapped",
      status: 501,
    });
  });

  it("refreshes the registry cache only through an authorized sync request", async () => {
    let registryRequests = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/pieces/registry")) {
        registryRequests += 1;
        return jsonResponse([{ name: "@activepieces/piece-http", version: "0.11.0" }]);
      }
      return jsonResponse([]);
    }) as typeof fetch;
    const adapter = createStudioV2ActivepiecesPieceAdapter({ fetchImpl });

    await adapter({ command: command("GET", "/v1/pieces/registry"), canWrite: false });
    await adapter({ command: command("GET", "/v1/pieces/registry"), canWrite: false });
    expect(registryRequests).toBe(1);

    await expect(
      adapter({ command: command("POST", "/v1/pieces/sync"), canWrite: false })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    expect(registryRequests).toBe(1);

    await adapter({ command: command("POST", "/v1/pieces/sync"), canWrite: true });
    expect(registryRequests).toBe(2);
  });
});
