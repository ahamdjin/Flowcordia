import { describe, expect, it, vi } from "vitest";

import { createStudioV2ActivepiecesOAuthAdapter } from "./activepieces-oauth.server";

const metadata = {
  name: "@activepieces/piece-example",
  version: "1.2.3",
  auth: {
    type: "OAUTH2",
    authUrl: "https://accounts.example.test/{tenant}/authorize",
    tokenUrl: "https://accounts.example.test/{tenant}/token",
    scope: ["read", "write"],
    extra: { audience: "flowcordia" },
    prompt: "select_account",
    pkce: true,
    pkceMethod: "S256",
  },
};

function oauthRequest() {
  return {
    externalId: "example-main",
    displayName: "Example main",
    pieceName: "@activepieces/piece-example",
    pieceVersion: "1.2.3",
    projectId: "project_123",
    type: "OAUTH2",
    value: {
      type: "OAUTH2",
      client_id: "client-id",
      client_secret: "client-secret",
      code: "authorization-code",
      code_challenge: "pkce-verifier",
      redirect_url: "https://flowcordia.test/oauth/callback",
      scope: "read write",
      props: { tenant: "acme" },
      authorization_method: "BODY",
    },
  };
}

describe("Studio V2 Activepieces OAuth adapter", () => {
  it("builds the Activepieces authorization URL from exact piece metadata and PKCE", async () => {
    const randomBytesImpl = vi.fn((size: number) => Buffer.alloc(size, size === 16 ? 1 : 2));
    const handle = createStudioV2ActivepiecesOAuthAdapter({
      getPieceMetadata: async () => metadata,
      randomBytesImpl: randomBytesImpl as never,
    });

    const result = await handle.authorizationUrl({
      pieceName: metadata.name,
      pieceVersion: metadata.version,
      clientId: "client-id",
      redirectUrl: "https://flowcordia.test/oauth/callback",
      scopes: ["read"],
      props: { tenant: "acme" },
    });

    const url = new URL(result.authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.example.test/acme/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://flowcordia.test/oauth/callback");
    expect(url.searchParams.get("scope")).toBe("read");
    expect(url.searchParams.get("audience")).toBe("flowcordia");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(result.codeVerifier).toHaveLength(43);
  });

  it("claims an OAuth authorization code using the Activepieces token request shape", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe("https://accounts.example.test/acme/token");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      });
      const form = new URLSearchParams(init?.body as URLSearchParams);
      expect(form.get("grant_type")).toBe("authorization_code");
      expect(form.get("redirect_uri")).toBe("https://flowcordia.test/oauth/callback");
      expect(form.get("code")).toBe("authorization-code");
      expect(form.get("code_verifier")).toBe("pkce-verifier");
      expect(form.get("client_id")).toBe("client-id");
      expect(form.get("client_secret")).toBe("client-secret");
      return new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          token_type: "Bearer",
          scope: "read write",
          expires_in: 3600,
          workspace: "acme",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const handle = createStudioV2ActivepiecesOAuthAdapter({
      getPieceMetadata: async () => metadata,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1_800_000_000_000,
    });

    const claimed = await handle.claim(oauthRequest());
    expect(claimed).toMatchObject({
      externalId: "example-main",
      type: "OAUTH2",
      value: {
        type: "OAUTH2",
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
        claimed_at: 1_800_000_000,
        token_url: "https://accounts.example.test/acme/token",
        client_id: "client-id",
        client_secret: "client-secret",
        redirect_url: "https://flowcordia.test/oauth/callback",
        grant_type: "authorization_code",
        authorization_method: "BODY",
        props: { tenant: "acme" },
        data: { workspace: "acme" },
      },
    });
    expect((claimed.value as Record<string, unknown>).code).toBeUndefined();
  });

  it("rejects scopes that are not declared by the Activepieces piece", async () => {
    const handle = createStudioV2ActivepiecesOAuthAdapter({
      getPieceMetadata: async () => metadata,
    });
    await expect(
      handle.authorizationUrl({
        pieceName: metadata.name,
        clientId: "client-id",
        redirectUrl: "https://flowcordia.test/oauth/callback",
        scopes: ["admin"],
        props: { tenant: "acme" },
      })
    ).rejects.toMatchObject({ code: "invalid_connection", status: 400 });
  });
});
