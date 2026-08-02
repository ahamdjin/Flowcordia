import { describe, expect, it, vi } from "vitest";

import { createStudioV2ActivepiecesOAuthAdapter } from "./activepieces-oauth.server";

describe("Studio V2 Activepieces OAuth client credentials", () => {
  it("uses the pinned piece token URL, scope props, and header authorization", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe("https://identity.example.test/acme/token");
      expect(init?.headers).toMatchObject({
        authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
      });
      const form = new URLSearchParams(init?.body as URLSearchParams);
      expect(form.get("grant_type")).toBe("client_credentials");
      expect(form.get("scope")).toBe("acme:read");
      expect(form.get("tenant")).toBe("acme");
      expect(form.has("client_id")).toBe(false);
      return new Response(
        JSON.stringify({ access_token: "machine-token", token_type: "Bearer", expires_in: 600 }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const handle = createStudioV2ActivepiecesOAuthAdapter({
      getPieceMetadata: async () => ({
        auth: {
          type: "OAUTH2",
          authUrl: "https://identity.example.test/{tenant}/authorize",
          tokenUrl: "https://identity.example.test/{tenant}/token",
          scope: ["{tenant}:read"],
        },
      }),
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1_800_000_000_000,
    });

    const claimed = await handle.claim({
      externalId: "machine",
      displayName: "Machine",
      pieceName: "@activepieces/piece-example",
      pieceVersion: "1.0.0",
      projectId: "project_123",
      type: "OAUTH2",
      value: {
        type: "OAUTH2",
        client_id: "client-id",
        client_secret: "client-secret",
        code: "unused-for-client-credentials",
        scope: "{tenant}:read",
        props: { tenant: "acme" },
        grant_type: "client_credentials",
        authorization_method: "HEADER",
      },
    });

    expect(claimed).toMatchObject({
      value: {
        access_token: "machine-token",
        grant_type: "client_credentials",
        authorization_method: "HEADER",
        token_url: "https://identity.example.test/acme/token",
      },
    });
  });
});
