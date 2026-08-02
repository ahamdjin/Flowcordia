import { describe, expect, it, vi } from "vitest";
import { handleStudioV2ActivepiecesCallback } from "~/features/flowcordia/workflows/studio-v2/activepieces-callback.server";

function encodedTarget(
  value = "https://flowcordia.test/api/v1/waitpoints/tokens/waitpoint_abc123/callback/hash_123"
): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("Studio V2 Activepieces callback bridge", () => {
  it("forwards a normalized resume payload to the exact same-origin Trigger.dev waitpoint", async () => {
    const fetchImpl = vi.fn(async (_target: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");
      expect(JSON.parse(String(init?.body))).toEqual({
        body: null,
        headers: {
          accept: "application/json",
          "user-agent": "activepieces-test",
        },
        queryParams: { action: "approve", requestId: "request_123" },
      });
      return new Response(null, { status: 204 });
    });

    const response = await handleStudioV2ActivepiecesCallback(
      new Request(
        "https://flowcordia.test/api/v1/flowcordia/activepieces/callbacks/opaque?action=approve&requestId=request_123",
        {
          headers: {
            Accept: "application/json",
            Cookie: "must-not-reach-piece-code=secret",
            "User-Agent": "activepieces-test",
          },
        }
      ),
      encodedTarget(),
      fetchImpl as typeof globalThis.fetch
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const target = fetchImpl.mock.calls[0]?.[0];
    expect(String(target)).toBe(
      "https://flowcordia.test/api/v1/waitpoints/tokens/waitpoint_abc123/callback/hash_123"
    );
  });

  it("preserves JSON body, request headers, and query params", async () => {
    const fetchImpl = vi.fn(async (_target: URL | RequestInfo, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        body: { decision: "approved" },
        headers: { "content-type": "application/json", "x-provider": "example" },
        queryParams: { source: "provider" },
      });
      return new Response(null, { status: 204 });
    });

    const response = await handleStudioV2ActivepiecesCallback(
      new Request(
        "https://flowcordia.test/api/v1/flowcordia/activepieces/callbacks/opaque?source=provider",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Provider": "example" },
          body: JSON.stringify({ decision: "approved" }),
        }
      ),
      encodedTarget(),
      fetchImpl as typeof globalThis.fetch
    );

    expect(response.status).toBe(200);
  });

  it("rejects cross-origin and non-waitpoint callback targets", async () => {
    const fetchImpl = vi.fn();

    for (const target of [
      "https://evil.test/api/v1/waitpoints/tokens/waitpoint_abc123/callback/hash_123",
      "https://flowcordia.test/api/v1/tasks/anything",
      "http://flowcordia.test/api/v1/waitpoints/tokens/waitpoint_abc123/callback/hash_123",
    ]) {
      const response = await handleStudioV2ActivepiecesCallback(
        new Request("https://flowcordia.test/api/v1/flowcordia/activepieces/callbacks/opaque"),
        encodedTarget(target),
        fetchImpl as typeof globalThis.fetch
      );
      expect(response.status).toBe(404);
    }

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before forwarding", async () => {
    const fetchImpl = vi.fn();
    const response = await handleStudioV2ActivepiecesCallback(
      new Request("https://flowcordia.test/api/v1/flowcordia/activepieces/callbacks/opaque", {
        method: "POST",
        headers: { "Content-Length": String(1024 * 1024 + 1) },
        body: "x",
      }),
      encodedTarget(),
      fetchImpl as typeof globalThis.fetch
    );

    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
