import { describe, expect, it } from "vitest";
import { parseFlowcordiaStoredWebhookSecret } from "../../app/features/flowcordia/workflows/credentials/webhook-secret";

const secret = "s".repeat(32);

describe("Flowcordia stored webhook HMAC credential", () => {
  it("returns only the exact bounded secret from the strict envelope", () => {
    expect(
      parseFlowcordiaStoredWebhookSecret(JSON.stringify({ type: "webhook_hmac", secret }))
    ).toEqual({ success: true, secret, byteLength: 32 });
  });

  it("accepts JSON whitespace without normalizing secret bytes", () => {
    const value = ` { "secret": "${secret}", "type": "webhook_hmac" } `;
    expect(parseFlowcordiaStoredWebhookSecret(value)).toEqual({
      success: true,
      secret,
      byteLength: 32,
    });
  });

  it.each([
    ["not-json", "credential_invalid_json"],
    ["null", "credential_invalid_shape"],
    ["[]", "credential_invalid_shape"],
    [JSON.stringify({ type: "http_headers", secret }), "credential_invalid_shape"],
    [JSON.stringify({ type: "webhook_hmac" }), "credential_invalid_shape"],
    [JSON.stringify({ type: "webhook_hmac", secret, extra: true }), "credential_invalid_shape"],
    [JSON.stringify({ type: "webhook_hmac", secret: "short" }), "credential_invalid_secret"],
    [JSON.stringify({ type: "webhook_hmac", secret: `${secret}\n` }), "credential_invalid_secret"],
  ] as const)("rejects an invalid stored envelope", (value, code) => {
    expect(parseFlowcordiaStoredWebhookSecret(value)).toMatchObject({
      success: false,
      code,
    });
  });

  it("rejects oversized stored JSON before parsing", () => {
    expect(parseFlowcordiaStoredWebhookSecret("x".repeat(32_769))).toMatchObject({
      success: false,
      code: "credential_too_large",
    });
  });
});
