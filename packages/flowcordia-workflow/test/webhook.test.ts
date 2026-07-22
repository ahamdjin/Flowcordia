import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_WEBHOOK_DEFAULT_MAX_BODY_BYTES,
  FLOWCORDIA_WEBHOOK_DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
  FLOWCORDIA_WEBHOOK_DELIVERY_HEADER,
  FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER,
  FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER,
  parseFlowcordiaWebhookBinding,
  parseFlowcordiaWebhookConfiguration,
  serializeFlowcordiaWebhookConfiguration,
} from "../src/webhook.js";

describe("signed webhook configuration", () => {
  it("preserves legacy method/path workflows with deterministic secure defaults", () => {
    const result = parseFlowcordiaWebhookConfiguration({
      method: "post",
      path: "/incoming/lead-created",
    });
    expect(result).toEqual({
      success: true,
      configuration: {
        method: "POST",
        path: "/incoming/lead-created",
        maxBodyBytes: FLOWCORDIA_WEBHOOK_DEFAULT_MAX_BODY_BYTES,
        timestampToleranceSeconds: FLOWCORDIA_WEBHOOK_DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
      },
      issues: [],
    });
  });

  it("binds exactly one names-only credential and fixed signature headers", () => {
    const result = parseFlowcordiaWebhookBinding({
      configuration: {
        method: "POST",
        path: "/stripe/event",
        maxBodyBytes: 65_536,
        timestampToleranceSeconds: 120,
      },
      credentialReferences: ["stripe-webhook"],
    });
    expect(result).toEqual({
      success: true,
      binding: {
        configuration: {
          method: "POST",
          path: "/stripe/event",
          maxBodyBytes: 65_536,
          timestampToleranceSeconds: 120,
        },
        credentialReference: "stripe-webhook",
        signature: {
          algorithm: "hmac-sha256",
          signatureHeader: FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER,
          timestampHeader: FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER,
          deliveryHeader: FLOWCORDIA_WEBHOOK_DELIVERY_HEADER,
        },
      },
      issues: [],
    });
  });

  it.each([
    "incoming",
    "//incoming",
    "/incoming//event",
    "/incoming/../secret",
    "/incoming?token=value",
    "/incoming#fragment",
    "/incoming\\event",
    "/incoming/%2e%2e/secret",
  ])("rejects unsafe path %s", (path) => {
    const result = parseFlowcordiaWebhookConfiguration({ method: "POST", path });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_path", path: ["path"] })])
    );
  });

  it("rejects unknown fields and out-of-range body/timestamp policy", () => {
    const result = parseFlowcordiaWebhookConfiguration({
      method: "POST",
      path: "/incoming",
      maxBodyBytes: 0,
      timestampToleranceSeconds: 901,
      signatureSecret: "inline-secret",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_property",
          path: ["signatureSecret"],
        }),
        expect.objectContaining({ code: "invalid_limit", path: ["maxBodyBytes"] }),
        expect.objectContaining({
          code: "invalid_limit",
          path: ["timestampToleranceSeconds"],
        }),
      ])
    );
  });

  it.each([[], ["first", "second"], ["INVALID"], [17]])(
    "rejects non-exact credential set %j",
    (credentialReferences) => {
      const result = parseFlowcordiaWebhookBinding({
        configuration: { method: "POST", path: "/incoming" },
        credentialReferences,
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_credential_reference",
            path: ["credentialReferences"],
          }),
        ])
      );
    }
  );

  it("serializes explicit defaults so generated and reviewed artifacts agree", () => {
    const parsed = parseFlowcordiaWebhookConfiguration({ method: "DELETE", path: "/cache/item" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(serializeFlowcordiaWebhookConfiguration(parsed.configuration)).toEqual({
      method: "DELETE",
      path: "/cache/item",
      maxBodyBytes: FLOWCORDIA_WEBHOOK_DEFAULT_MAX_BODY_BYTES,
      timestampToleranceSeconds: FLOWCORDIA_WEBHOOK_DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
    });
  });
});
