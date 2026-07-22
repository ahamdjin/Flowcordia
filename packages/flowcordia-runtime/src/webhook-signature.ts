import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE = /^v1=([0-9a-f]{64})$/;
const TIMESTAMP = /^(0|[1-9]\d{0,11})$/;
const DELIVERY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 4096;

export type FlowcordiaWebhookVerificationFailure =
  | "missing_signature"
  | "invalid_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "expired_timestamp"
  | "missing_delivery"
  | "invalid_delivery";

export type FlowcordiaWebhookVerificationResult =
  | {
      verified: true;
      deliveryId: string;
      timestampSeconds: number;
      payloadSha256: string;
    }
  | { verified: false; reason: FlowcordiaWebhookVerificationFailure };

function secretBytes(secret: string | Uint8Array): Uint8Array {
  const bytes = typeof secret === "string" ? Buffer.from(secret, "utf8") : secret;
  if (bytes.byteLength < MIN_SECRET_BYTES || bytes.byteLength > MAX_SECRET_BYTES) {
    throw new TypeError(
      `Webhook secret must contain between ${MIN_SECRET_BYTES} and ${MAX_SECRET_BYTES} bytes.`
    );
  }
  return bytes;
}

function bodyBytes(body: string | Uint8Array): Uint8Array {
  return typeof body === "string" ? Buffer.from(body, "utf8") : body;
}

function signedPayload(input: {
  timestamp: string;
  deliveryId: string;
  body: Uint8Array;
}): Uint8Array {
  return Buffer.concat([
    Buffer.from(`${input.timestamp}.${input.deliveryId}.`, "utf8"),
    Buffer.from(input.body),
  ]);
}

export function signFlowcordiaWebhook(input: {
  body: string | Uint8Array;
  timestampSeconds: number;
  deliveryId: string;
  secret: string | Uint8Array;
}): string {
  if (!Number.isSafeInteger(input.timestampSeconds) || input.timestampSeconds < 0) {
    throw new TypeError("Webhook timestamp must be a non-negative integer.");
  }
  if (!DELIVERY_ID.test(input.deliveryId)) {
    throw new TypeError("Webhook delivery ID has an invalid format.");
  }
  const timestamp = String(input.timestampSeconds);
  const digest = createHmac("sha256", secretBytes(input.secret))
    .update(
      signedPayload({
        timestamp,
        deliveryId: input.deliveryId,
        body: bodyBytes(input.body),
      })
    )
    .digest("hex");
  return `v1=${digest}`;
}

export function verifyFlowcordiaWebhookSignature(input: {
  body: string | Uint8Array;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  deliveryId: string | null | undefined;
  secret: string | Uint8Array;
  toleranceSeconds: number;
  nowMilliseconds?: number;
}): FlowcordiaWebhookVerificationResult {
  if (!input.signature) return { verified: false, reason: "missing_signature" };
  const signatureMatch = SIGNATURE.exec(input.signature);
  if (!signatureMatch) return { verified: false, reason: "invalid_signature" };
  if (!input.timestamp) return { verified: false, reason: "missing_timestamp" };
  if (!TIMESTAMP.test(input.timestamp)) return { verified: false, reason: "invalid_timestamp" };
  if (!input.deliveryId) return { verified: false, reason: "missing_delivery" };
  if (!DELIVERY_ID.test(input.deliveryId)) {
    return { verified: false, reason: "invalid_delivery" };
  }
  if (
    !Number.isSafeInteger(input.toleranceSeconds) ||
    input.toleranceSeconds < 1 ||
    input.toleranceSeconds > 86_400
  ) {
    throw new TypeError("Webhook timestamp tolerance is invalid.");
  }

  const timestampSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return { verified: false, reason: "invalid_timestamp" };
  }
  const nowMilliseconds = input.nowMilliseconds ?? Date.now();
  if (!Number.isFinite(nowMilliseconds)) {
    throw new TypeError("Webhook verification clock is invalid.");
  }
  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > input.toleranceSeconds) {
    return { verified: false, reason: "expired_timestamp" };
  }

  const body = bodyBytes(input.body);
  const expected = createHmac("sha256", secretBytes(input.secret))
    .update(
      signedPayload({
        timestamp: input.timestamp,
        deliveryId: input.deliveryId,
        body,
      })
    )
    .digest();
  const received = Buffer.from(signatureMatch[1]!, "hex");
  if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
    return { verified: false, reason: "invalid_signature" };
  }

  return {
    verified: true,
    deliveryId: input.deliveryId,
    timestampSeconds,
    payloadSha256: createHash("sha256").update(body).digest("hex"),
  };
}
