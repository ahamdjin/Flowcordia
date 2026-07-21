import type { JsonObject, JsonValue } from "./types.js";

export const FLOWCORDIA_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export const FLOWCORDIA_HTTP_BODY_MODES = ["input", "none"] as const;
export const FLOWCORDIA_HTTP_RESPONSE_MODES = ["auto", "json", "text", "none"] as const;
export const FLOWCORDIA_HTTP_DEFAULT_TIMEOUT_SECONDS = 30;
export const FLOWCORDIA_HTTP_MAX_TIMEOUT_SECONDS = 300;
export const FLOWCORDIA_HTTP_DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
export const FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES = 5_242_880;

export type FlowcordiaHttpMethod = (typeof FLOWCORDIA_HTTP_METHODS)[number];
export type FlowcordiaHttpBodyMode = (typeof FLOWCORDIA_HTTP_BODY_MODES)[number];
export type FlowcordiaHttpResponseMode = (typeof FLOWCORDIA_HTTP_RESPONSE_MODES)[number];

export interface FlowcordiaHttpConfiguration extends JsonObject {
  method: FlowcordiaHttpMethod;
  url: string;
  bodyMode: FlowcordiaHttpBodyMode;
  responseMode: FlowcordiaHttpResponseMode;
  timeoutSeconds: number;
  maxResponseBytes: number;
}

export type FlowcordiaHttpConfigurationIssueCode =
  | "invalid_type"
  | "unknown_field"
  | "invalid_method"
  | "invalid_url"
  | "invalid_body_mode"
  | "invalid_response_mode"
  | "invalid_timeout"
  | "invalid_response_limit";

export interface FlowcordiaHttpConfigurationIssue {
  code: FlowcordiaHttpConfigurationIssueCode;
  field?: string;
  message: string;
}

export type FlowcordiaHttpConfigurationResult =
  | { success: true; configuration: FlowcordiaHttpConfiguration; issues: [] }
  | { success: false; issues: FlowcordiaHttpConfigurationIssue[] };

const HTTP_CONFIGURATION_KEYS = new Set([
  "method",
  "url",
  "bodyMode",
  "responseMode",
  "timeoutSeconds",
  "maxResponseBytes",
]);

function isObject(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function includes<Value extends string>(values: readonly Value[], value: unknown): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

export function parseFlowcordiaHttpConfiguration(
  input: unknown
): FlowcordiaHttpConfigurationResult {
  if (!isObject(input)) {
    return {
      success: false,
      issues: [{ code: "invalid_type", message: "HTTP configuration must be an object." }],
    };
  }

  const issues: FlowcordiaHttpConfigurationIssue[] = [];
  for (const field of Object.keys(input).sort()) {
    if (!HTTP_CONFIGURATION_KEYS.has(field)) {
      issues.push({
        code: "unknown_field",
        field,
        message: `HTTP configuration field "${field}" is not supported.`,
      });
    }
  }

  const method = typeof input.method === "string" ? input.method.trim().toUpperCase() : "";
  if (!includes(FLOWCORDIA_HTTP_METHODS, method)) {
    issues.push({
      code: "invalid_method",
      field: "method",
      message: "HTTP requests require a supported method.",
    });
  }

  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (url.length === 0 || url.length > 2_048) {
    issues.push({
      code: "invalid_url",
      field: "url",
      message: "HTTP requests require an HTTPS URL under 2,048 characters.",
    });
  } else {
    try {
      const destination = new URL(url);
      if (
        destination.protocol !== "https:" ||
        destination.username ||
        destination.password ||
        destination.hash ||
        !destination.hostname
      ) {
        throw new Error("unsafe destination");
      }
    } catch {
      issues.push({
        code: "invalid_url",
        field: "url",
        message: "HTTP requests require an HTTPS URL without credentials or a fragment.",
      });
    }
  }

  const defaultBodyMode: FlowcordiaHttpBodyMode = ["GET", "HEAD"].includes(method)
    ? "none"
    : "input";
  const bodyMode = input.bodyMode ?? defaultBodyMode;
  if (!includes(FLOWCORDIA_HTTP_BODY_MODES, bodyMode)) {
    issues.push({
      code: "invalid_body_mode",
      field: "bodyMode",
      message: "HTTP request bodies must use workflow input or be disabled.",
    });
  } else if (["GET", "HEAD"].includes(method) && bodyMode !== "none") {
    issues.push({
      code: "invalid_body_mode",
      field: "bodyMode",
      message: `${method || "GET"} requests cannot send a workflow-input body.`,
    });
  }

  const responseMode = input.responseMode ?? "auto";
  if (!includes(FLOWCORDIA_HTTP_RESPONSE_MODES, responseMode)) {
    issues.push({
      code: "invalid_response_mode",
      field: "responseMode",
      message: "HTTP responses must use auto, JSON, text, or no-body mode.",
    });
  }

  const timeoutSeconds = input.timeoutSeconds ?? FLOWCORDIA_HTTP_DEFAULT_TIMEOUT_SECONDS;
  if (
    typeof timeoutSeconds !== "number" ||
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > FLOWCORDIA_HTTP_MAX_TIMEOUT_SECONDS
  ) {
    issues.push({
      code: "invalid_timeout",
      field: "timeoutSeconds",
      message: `HTTP timeout must be a whole number from 1 to ${FLOWCORDIA_HTTP_MAX_TIMEOUT_SECONDS} seconds.`,
    });
  }

  const maxResponseBytes = input.maxResponseBytes ?? FLOWCORDIA_HTTP_DEFAULT_MAX_RESPONSE_BYTES;
  if (
    typeof maxResponseBytes !== "number" ||
    !Number.isInteger(maxResponseBytes) ||
    maxResponseBytes < 1 ||
    maxResponseBytes > FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES
  ) {
    issues.push({
      code: "invalid_response_limit",
      field: "maxResponseBytes",
      message: `HTTP response limit must be a whole number from 1 to ${FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES} bytes.`,
    });
  }

  if (issues.length > 0) return { success: false, issues };

  return {
    success: true,
    issues: [],
    configuration: {
      method: method as FlowcordiaHttpMethod,
      url,
      bodyMode: bodyMode as FlowcordiaHttpBodyMode,
      responseMode: responseMode as FlowcordiaHttpResponseMode,
      timeoutSeconds: timeoutSeconds as number,
      maxResponseBytes: maxResponseBytes as number,
    },
  };
}
