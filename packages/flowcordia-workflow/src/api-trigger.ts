import type { JsonObject, JsonValue } from "./types.js";

export const FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS = 60;
export const FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 60 * 60;
export const FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS = 60;
export const FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS = 14 * 24 * 60 * 60;
export const FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_KEY_LENGTH = 256;

export const FLOWCORDIA_API_TRIGGER_DEFAULT_CONFIGURATION = {
  requireIdempotencyKey: true,
  idempotencyKeyTTLSeconds: 24 * 60 * 60,
  queueTTLSeconds: 60 * 60,
} as const;

export interface FlowcordiaApiTriggerConfiguration extends JsonObject {
  requireIdempotencyKey: boolean;
  idempotencyKeyTTLSeconds: number;
  queueTTLSeconds: number;
}

export type FlowcordiaApiTriggerConfigurationResult =
  | { success: true; configuration: FlowcordiaApiTriggerConfiguration }
  | { success: false; issues: Array<{ path: string; message: string }> };

export interface FlowcordiaApiTriggerRequest extends JsonObject {
  payload: JsonValue;
  options: JsonObject;
}

export type FlowcordiaApiTriggerRequestResult =
  | {
      success: true;
      configuration: FlowcordiaApiTriggerConfiguration;
      request: FlowcordiaApiTriggerRequest;
    }
  | { success: false; issues: Array<{ path: string; message: string }> };

function boundedInteger(input: {
  value: unknown;
  fallback: number;
  min: number;
  max: number;
  path: string;
  label: string;
  issues: Array<{ path: string; message: string }>;
}): number {
  const value = input.value === undefined ? input.fallback : input.value;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < input.min ||
    value > input.max
  ) {
    input.issues.push({
      path: input.path,
      message: `${input.label} must be an integer between ${input.min} and ${input.max} seconds.`,
    });
    return input.fallback;
  }
  return value;
}

export function parseFlowcordiaApiTriggerConfiguration(
  value: JsonObject
): FlowcordiaApiTriggerConfigurationResult {
  const issues: Array<{ path: string; message: string }> = [];
  const allowed = new Set(["requireIdempotencyKey", "idempotencyKeyTTLSeconds", "queueTTLSeconds"]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    issues.push({
      path: unknown,
      message: "API trigger configuration contains an unsupported field.",
    });
  }

  const requireIdempotencyKey =
    value.requireIdempotencyKey === undefined
      ? FLOWCORDIA_API_TRIGGER_DEFAULT_CONFIGURATION.requireIdempotencyKey
      : value.requireIdempotencyKey;
  if (typeof requireIdempotencyKey !== "boolean") {
    issues.push({
      path: "requireIdempotencyKey",
      message: "API trigger requireIdempotencyKey must be a boolean.",
    });
  }

  const idempotencyKeyTTLSeconds = boundedInteger({
    value: value.idempotencyKeyTTLSeconds,
    fallback: FLOWCORDIA_API_TRIGGER_DEFAULT_CONFIGURATION.idempotencyKeyTTLSeconds,
    min: FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS,
    max: FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS,
    path: "idempotencyKeyTTLSeconds",
    label: "API trigger idempotency-key TTL",
    issues,
  });
  const queueTTLSeconds = boundedInteger({
    value: value.queueTTLSeconds,
    fallback: FLOWCORDIA_API_TRIGGER_DEFAULT_CONFIGURATION.queueTTLSeconds,
    min: FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS,
    max: FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS,
    path: "queueTTLSeconds",
    label: "API trigger queue TTL",
    issues,
  });

  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    configuration: {
      requireIdempotencyKey: requireIdempotencyKey as boolean,
      idempotencyKeyTTLSeconds,
      queueTTLSeconds,
    },
  };
}

export function buildFlowcordiaApiTriggerRequest(input: {
  configuration: JsonObject;
  payload: JsonValue;
  idempotencyKey?: string;
}): FlowcordiaApiTriggerRequestResult {
  const parsed = parseFlowcordiaApiTriggerConfiguration(input.configuration);
  if (!parsed.success) return parsed;

  const idempotencyKey = input.idempotencyKey?.trim() ?? "";
  if (
    idempotencyKey.length > FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_KEY_LENGTH ||
    (parsed.configuration.requireIdempotencyKey && idempotencyKey.length === 0)
  ) {
    return {
      success: false,
      issues: [
        {
          path: "idempotencyKey",
          message: parsed.configuration.requireIdempotencyKey
            ? `API trigger requests require an idempotency key with 1-${FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_KEY_LENGTH} characters.`
            : `API trigger idempotency keys must stay under ${FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
        },
      ],
    };
  }

  const options: JsonObject = {
    ttl: `${parsed.configuration.queueTTLSeconds}s`,
  };
  if (idempotencyKey) {
    options.idempotencyKey = idempotencyKey;
    options.idempotencyKeyTTL = `${parsed.configuration.idempotencyKeyTTLSeconds}s`;
  }

  return {
    success: true,
    configuration: parsed.configuration,
    request: { payload: input.payload, options },
  };
}
