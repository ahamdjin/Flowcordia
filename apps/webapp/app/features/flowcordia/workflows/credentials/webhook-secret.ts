import {
  FLOWCORDIA_CREDENTIAL_MAX_SERIALIZED_BYTES,
  normalizeFlowcordiaWebhookSecret,
} from "./contract";

export type FlowcordiaStoredWebhookSecretResult =
  | { success: true; secret: string; byteLength: number }
  | {
      success: false;
      code:
        | "credential_too_large"
        | "credential_invalid_json"
        | "credential_invalid_shape"
        | "credential_invalid_secret";
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseFlowcordiaStoredWebhookSecret(
  serialized: string
): FlowcordiaStoredWebhookSecretResult {
  if (new TextEncoder().encode(serialized).length > FLOWCORDIA_CREDENTIAL_MAX_SERIALIZED_BYTES) {
    return {
      success: false,
      code: "credential_too_large",
      message: "Stored webhook credential exceeds the supported size.",
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return {
      success: false,
      code: "credential_invalid_json",
      message: "Stored webhook credential is not valid JSON.",
    };
  }

  if (!isRecord(value)) {
    return {
      success: false,
      code: "credential_invalid_shape",
      message: "Stored webhook credential has an invalid shape.",
    };
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "secret" ||
    keys[1] !== "type" ||
    value.type !== "webhook_hmac" ||
    typeof value.secret !== "string"
  ) {
    return {
      success: false,
      code: "credential_invalid_shape",
      message: "Stored webhook credential has an invalid shape.",
    };
  }

  const normalized = normalizeFlowcordiaWebhookSecret(value.secret);
  if (!normalized.success) {
    return {
      success: false,
      code: "credential_invalid_secret",
      message: "Stored webhook credential contains an invalid secret.",
    };
  }

  return {
    success: true,
    secret: value.secret,
    byteLength: normalized.byteLength,
  };
}
