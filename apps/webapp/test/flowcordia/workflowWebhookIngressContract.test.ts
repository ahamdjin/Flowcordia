import { describe, expect, it } from "vitest";
import { readFlowcordiaBoundedWebhookBody } from "~/features/flowcordia/workflows/webhook/ingress-body.server";
import {
  flowcordiaPublicWebhookRequestedPath,
  flowcordiaPublicWebhookRunIdempotencyKey,
  flowcordiaPublicWebhookUrl,
  isFlowcordiaPublicWebhookJsonContentType,
  parseFlowcordiaPublicWebhookJson,
} from "~/features/flowcordia/workflows/webhook/ingress-contract.server";

const publicId = "A".repeat(32);

describe("Flowcordia public webhook ingress contract", () => {
  it("derives exact root and nested paths without accepting query or encoding ambiguity", () => {
    expect(
      flowcordiaPublicWebhookRequestedPath({
        requestUrl: `https://flowcordia.example/api/v1/flowcordia/webhooks/${publicId}`,
        publicId,
      })
    ).toBe("/");
    expect(
      flowcordiaPublicWebhookRequestedPath({
        requestUrl: `https://flowcordia.example/api/v1/flowcordia/webhooks/${publicId}/orders/new`,
        publicId,
      })
    ).toBe("/orders/new");
    expect(
      flowcordiaPublicWebhookRequestedPath({
        requestUrl: `https://flowcordia.example/api/v1/flowcordia/webhooks/${publicId}/orders?admin=true`,
        publicId,
      })
    ).toBeNull();
    expect(
      flowcordiaPublicWebhookRequestedPath({
        requestUrl: `https://flowcordia.example/api/v1/flowcordia/webhooks/${publicId}/orders/%257Eencoded`,
        publicId,
      })
    ).toBeNull();
  });

  it("accepts only explicit application/json media types", () => {
    expect(isFlowcordiaPublicWebhookJsonContentType("application/json")).toBe(true);
    expect(isFlowcordiaPublicWebhookJsonContentType("application/json; charset=UTF-8")).toBe(true);
    expect(isFlowcordiaPublicWebhookJsonContentType("text/plain")).toBe(false);
    expect(isFlowcordiaPublicWebhookJsonContentType(null)).toBe(false);
  });

  it("publishes a stable callable URL from the configured origin and path", () => {
    expect(
      flowcordiaPublicWebhookUrl({
        origin: "https://flowcordia.example/",
        publicId,
        path: "/orders",
      })
    ).toBe(`https://flowcordia.example/api/v1/flowcordia/webhooks/${publicId}/orders`);
  });

  it("uses endpoint-scoped deterministic run idempotency", () => {
    const first = flowcordiaPublicWebhookRunIdempotencyKey({
      endpointStorageId: "endpoint_1",
      deliveryId: "delivery-1",
    });
    expect(first).toBe(
      flowcordiaPublicWebhookRunIdempotencyKey({
        endpointStorageId: "endpoint_1",
        deliveryId: "delivery-1",
      })
    );
    expect(first).not.toBe(
      flowcordiaPublicWebhookRunIdempotencyKey({
        endpointStorageId: "endpoint_2",
        deliveryId: "delivery-1",
      })
    );
    expect(first).toMatch(/^flowcordia_webhook_[0-9a-f]{64}$/);
  });

  it("accepts empty and valid JSON while rejecting malformed UTF-8 and JSON", () => {
    expect(parseFlowcordiaPublicWebhookJson(new Uint8Array())).toEqual({
      success: true,
      payload: null,
    });
    expect(parseFlowcordiaPublicWebhookJson(new TextEncoder().encode('{"ok":true}'))).toEqual({
      success: true,
      payload: { ok: true },
    });
    expect(parseFlowcordiaPublicWebhookJson(new TextEncoder().encode("{"))).toEqual({
      success: false,
      code: "invalid_json",
    });
    expect(parseFlowcordiaPublicWebhookJson(Uint8Array.from([0xc3, 0x28]))).toEqual({
      success: false,
      code: "invalid_utf8",
    });
  });

  it("streams exact raw bytes and stops once the configured limit is exceeded", async () => {
    const accepted = await readFlowcordiaBoundedWebhookBody(
      new Request("https://flowcordia.example/webhook", {
        method: "POST",
        body: "1234",
      }),
      4
    );
    expect(accepted).toEqual({
      success: true,
      body: new TextEncoder().encode("1234"),
    });

    await expect(
      readFlowcordiaBoundedWebhookBody(
        new Request("https://flowcordia.example/webhook", {
          method: "POST",
          body: "12345",
        }),
        4
      )
    ).resolves.toEqual({ success: false, code: "body_too_large" });
  });

  it("rejects malformed length and transparent content decoding", async () => {
    await expect(
      readFlowcordiaBoundedWebhookBody(
        new Request("https://flowcordia.example/webhook", {
          method: "POST",
          headers: { "content-length": "not-a-number" },
          body: "{}",
        }),
        1024
      )
    ).resolves.toEqual({ success: false, code: "invalid_content_length" });
    await expect(
      readFlowcordiaBoundedWebhookBody(
        new Request("https://flowcordia.example/webhook", {
          method: "POST",
          headers: { "content-encoding": "gzip" },
          body: "{}",
        }),
        1024
      )
    ).resolves.toEqual({ success: false, code: "unsupported_content_encoding" });
  });
});
