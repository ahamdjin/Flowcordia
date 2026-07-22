import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  signFlowcordiaWebhook,
  verifyFlowcordiaWebhookSignature,
} from "../src/webhook-signature.js";

const secret = "s".repeat(64);
const timestampSeconds = 1_800_000_000;
const nowMilliseconds = timestampSeconds * 1000;
const deliveryId = "delivery_01HXYZ";
const body = Buffer.from('{"event":"lead.created","name":"Ahmad"}', "utf8");

function signature(
  input: {
    payload?: string | Uint8Array;
    timestamp?: number;
    delivery?: string;
    key?: string;
  } = {}
) {
  return signFlowcordiaWebhook({
    body: input.payload ?? body,
    timestampSeconds: input.timestamp ?? timestampSeconds,
    deliveryId: input.delivery ?? deliveryId,
    secret: input.key ?? secret,
  });
}

describe("Flowcordia signed webhook verification", () => {
  it("verifies the exact raw bytes, timestamp, delivery identity, and secret", () => {
    const result = verifyFlowcordiaWebhookSignature({
      body,
      signature: signature(),
      timestamp: String(timestampSeconds),
      deliveryId,
      secret,
      toleranceSeconds: 300,
      nowMilliseconds,
    });
    expect(result).toEqual({
      verified: true,
      deliveryId,
      timestampSeconds,
      payloadSha256: createHash("sha256").update(body).digest("hex"),
    });
  });

  it.each([
    ["body", Buffer.from('{"event":"lead.deleted"}', "utf8"), timestampSeconds, deliveryId, secret],
    ["timestamp", body, timestampSeconds + 1, deliveryId, secret],
    ["delivery", body, timestampSeconds, "delivery_other", secret],
    ["secret", body, timestampSeconds, deliveryId, "x".repeat(64)],
  ] as const)("rejects a tampered %s", (_label, payload, timestamp, delivery, key) => {
    const result = verifyFlowcordiaWebhookSignature({
      body: payload,
      signature: signature(),
      timestamp: String(timestamp),
      deliveryId: delivery,
      secret: key,
      toleranceSeconds: 300,
      nowMilliseconds,
    });
    expect(result).toEqual({ verified: false, reason: "invalid_signature" });
  });

  it("rejects expired and future timestamps outside the exact tolerance", () => {
    for (const timestamp of [timestampSeconds - 301, timestampSeconds + 301]) {
      expect(
        verifyFlowcordiaWebhookSignature({
          body,
          signature: signature({ timestamp }),
          timestamp: String(timestamp),
          deliveryId,
          secret,
          toleranceSeconds: 300,
          nowMilliseconds,
        })
      ).toEqual({ verified: false, reason: "expired_timestamp" });
    }
  });

  it("accepts the exact tolerance boundary", () => {
    const timestamp = timestampSeconds - 300;
    expect(
      verifyFlowcordiaWebhookSignature({
        body,
        signature: signature({ timestamp }),
        timestamp: String(timestamp),
        deliveryId,
        secret,
        toleranceSeconds: 300,
        nowMilliseconds,
      }).verified
    ).toBe(true);
  });

  it.each([
    [null, String(timestampSeconds), deliveryId, "missing_signature"],
    ["v1=bad", String(timestampSeconds), deliveryId, "invalid_signature"],
    [signature(), null, deliveryId, "missing_timestamp"],
    [signature(), "1.5", deliveryId, "invalid_timestamp"],
    [signature(), String(timestampSeconds), null, "missing_delivery"],
    [signature(), String(timestampSeconds), "bad delivery", "invalid_delivery"],
  ] as const)(
    "returns bounded failure for malformed remote headers",
    (signatureHeader, timestampHeader, deliveryHeader, reason) => {
      expect(
        verifyFlowcordiaWebhookSignature({
          body,
          signature: signatureHeader,
          timestamp: timestampHeader,
          deliveryId: deliveryHeader,
          secret,
          toleranceSeconds: 300,
          nowMilliseconds,
        })
      ).toEqual({ verified: false, reason });
    }
  );

  it("signs and verifies arbitrary non-UTF8 bytes without normalization", () => {
    const bytes = Uint8Array.from([0, 255, 1, 254, 13, 10]);
    const signed = signFlowcordiaWebhook({
      body: bytes,
      timestampSeconds,
      deliveryId,
      secret,
    });
    expect(
      verifyFlowcordiaWebhookSignature({
        body: bytes,
        signature: signed,
        timestamp: String(timestampSeconds),
        deliveryId,
        secret,
        toleranceSeconds: 300,
        nowMilliseconds,
      }).verified
    ).toBe(true);
    expect(
      verifyFlowcordiaWebhookSignature({
        body: Buffer.from(bytes).toString("utf8"),
        signature: signed,
        timestamp: String(timestampSeconds),
        deliveryId,
        secret,
        toleranceSeconds: 300,
        nowMilliseconds,
      })
    ).toEqual({ verified: false, reason: "invalid_signature" });
  });

  it.each(["short", "x".repeat(4097)])("rejects unsafe secret length", (key) => {
    expect(() => signature({ key })).toThrow(/Webhook secret must contain between/);
  });

  it("rejects invalid signer identity and verifier policy", () => {
    expect(() => signFlowcordiaWebhook({ body, timestampSeconds: -1, deliveryId, secret })).toThrow(
      /timestamp/
    );
    expect(() =>
      signFlowcordiaWebhook({
        body,
        timestampSeconds,
        deliveryId: "bad delivery",
        secret,
      })
    ).toThrow(/delivery ID/);
    expect(() =>
      verifyFlowcordiaWebhookSignature({
        body,
        signature: signature(),
        timestamp: String(timestampSeconds),
        deliveryId,
        secret,
        toleranceSeconds: 0,
        nowMilliseconds,
      })
    ).toThrow(/tolerance/);
  });
});
