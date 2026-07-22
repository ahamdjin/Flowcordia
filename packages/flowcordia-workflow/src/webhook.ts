import {
  isFlowcordiaCredentialReference,
  validateFlowcordiaCredentialReferences,
} from "./credentials.js";
import type { JsonObject } from "./types.js";

export const FLOWCORDIA_WEBHOOK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER = "x-flowcordia-signature" as const;
export const FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER = "x-flowcordia-timestamp" as const;
export const FLOWCORDIA_WEBHOOK_DELIVERY_HEADER = "x-flowcordia-delivery" as const;
export const FLOWCORDIA_WEBHOOK_DEFAULT_MAX_BODY_BYTES = 1_048_576;
export const FLOWCORDIA_WEBHOOK_MAX_BODY_BYTES = 5_242_880;
export const FLOWCORDIA_WEBHOOK_DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 300;
export const FLOWCORDIA_WEBHOOK_MIN_TIMESTAMP_TOLERANCE_SECONDS = 30;
export const FLOWCORDIA_WEBHOOK_MAX_TIMESTAMP_TOLERANCE_SECONDS = 900;

const CONFIGURATION_KEYS = new Set(["method", "path", "maxBodyBytes", "timestampToleranceSeconds"]);
const PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;

export type FlowcordiaWebhookMethod = (typeof FLOWCORDIA_WEBHOOK_METHODS)[number];

export interface FlowcordiaWebhookConfiguration {
  method: FlowcordiaWebhookMethod;
  path: string;
  maxBodyBytes: number;
  timestampToleranceSeconds: number;
}

export interface FlowcordiaWebhookBinding {
  configuration: FlowcordiaWebhookConfiguration;
  credentialReference: string;
  signature: {
    algorithm: "hmac-sha256";
    signatureHeader: typeof FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER;
    timestampHeader: typeof FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER;
    deliveryHeader: typeof FLOWCORDIA_WEBHOOK_DELIVERY_HEADER;
  };
}

export interface FlowcordiaWebhookIssue {
  code:
    | "invalid_type"
    | "unknown_property"
    | "invalid_method"
    | "invalid_path"
    | "invalid_limit"
    | "invalid_credential_reference";
  message: string;
  path: ReadonlyArray<string | number>;
}

export type FlowcordiaWebhookConfigurationResult =
  | { success: true; configuration: FlowcordiaWebhookConfiguration; issues: [] }
  | { success: false; issues: FlowcordiaWebhookIssue[] };

export type FlowcordiaWebhookBindingResult =
  | { success: true; binding: FlowcordiaWebhookBinding; issues: [] }
  | { success: false; issues: FlowcordiaWebhookIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isWebhookMethod(value: string): value is FlowcordiaWebhookMethod {
  return FLOWCORDIA_WEBHOOK_METHODS.includes(value as FlowcordiaWebhookMethod);
}

function validWebhookPath(value: string): boolean {
  if (value.length < 1 || value.length > 256 || !value.startsWith("/")) return false;
  if (value.includes("?") || value.includes("#") || value.includes("\\") || value.includes("//")) {
    return false;
  }
  if (value === "/") return true;
  return value
    .slice(1)
    .split("/")
    .every((segment) => segment !== "." && segment !== ".." && PATH_SEGMENT.test(segment));
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number | null {
  const candidate = value === undefined ? fallback : value;
  return Number.isSafeInteger(candidate) &&
    (candidate as number) >= minimum &&
    (candidate as number) <= maximum
    ? (candidate as number)
    : null;
}

export function parseFlowcordiaWebhookConfiguration(
  value: unknown
): FlowcordiaWebhookConfigurationResult {
  const issues: FlowcordiaWebhookIssue[] = [];
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [
        {
          code: "invalid_type",
          message: "Webhook configuration must be a JSON object.",
          path: [],
        },
      ],
    };
  }

  for (const key of Object.keys(value)) {
    if (!CONFIGURATION_KEYS.has(key)) {
      issues.push({
        code: "unknown_property",
        message: `Unknown webhook configuration property "${key}".`,
        path: [key],
      });
    }
  }

  const method = typeof value.method === "string" ? value.method.toUpperCase() : "";
  if (!isWebhookMethod(method)) {
    issues.push({
      code: "invalid_method",
      message: `Webhook method must be one of ${FLOWCORDIA_WEBHOOK_METHODS.join(", ")}.`,
      path: ["method"],
    });
  }

  const path = typeof value.path === "string" ? value.path.trim() : "";
  if (!validWebhookPath(path)) {
    issues.push({
      code: "invalid_path",
      message:
        "Webhook path must be an absolute 1-256 character path using safe URL segments without queries, fragments, traversal, or duplicate slashes.",
      path: ["path"],
    });
  }

  const maxBodyBytes = boundedInteger(
    value.maxBodyBytes,
    FLOWCORDIA_WEBHOOK_DEFAULT_MAX_BODY_BYTES,
    1,
    FLOWCORDIA_WEBHOOK_MAX_BODY_BYTES
  );
  if (maxBodyBytes === null) {
    issues.push({
      code: "invalid_limit",
      message: `Webhook body limit must be an integer between 1 and ${FLOWCORDIA_WEBHOOK_MAX_BODY_BYTES} bytes.`,
      path: ["maxBodyBytes"],
    });
  }

  const timestampToleranceSeconds = boundedInteger(
    value.timestampToleranceSeconds,
    FLOWCORDIA_WEBHOOK_DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
    FLOWCORDIA_WEBHOOK_MIN_TIMESTAMP_TOLERANCE_SECONDS,
    FLOWCORDIA_WEBHOOK_MAX_TIMESTAMP_TOLERANCE_SECONDS
  );
  if (timestampToleranceSeconds === null) {
    issues.push({
      code: "invalid_limit",
      message: `Webhook timestamp tolerance must be an integer between ${FLOWCORDIA_WEBHOOK_MIN_TIMESTAMP_TOLERANCE_SECONDS} and ${FLOWCORDIA_WEBHOOK_MAX_TIMESTAMP_TOLERANCE_SECONDS} seconds.`,
      path: ["timestampToleranceSeconds"],
    });
  }

  if (
    issues.length > 0 ||
    !isWebhookMethod(method) ||
    !validWebhookPath(path) ||
    maxBodyBytes === null ||
    timestampToleranceSeconds === null
  ) {
    return { success: false, issues };
  }

  return {
    success: true,
    configuration: {
      method,
      path,
      maxBodyBytes,
      timestampToleranceSeconds,
    },
    issues: [],
  };
}

export function parseFlowcordiaWebhookBinding(input: {
  configuration: unknown;
  credentialReferences: unknown;
}): FlowcordiaWebhookBindingResult {
  const configuration = parseFlowcordiaWebhookConfiguration(input.configuration);
  const issues: FlowcordiaWebhookIssue[] = configuration.success ? [] : [...configuration.issues];
  if (!Array.isArray(input.credentialReferences)) {
    issues.push({
      code: "invalid_credential_reference",
      message: "Signed webhook ingress requires exactly one credential reference.",
      path: ["credentialReferences"],
    });
  } else {
    const references = input.credentialReferences.filter(
      (candidate): candidate is string => typeof candidate === "string"
    );
    const referenceIssues = validateFlowcordiaCredentialReferences(references);
    if (
      references.length !== input.credentialReferences.length ||
      references.length !== 1 ||
      referenceIssues.length > 0 ||
      !isFlowcordiaCredentialReference(references[0] ?? "")
    ) {
      issues.push({
        code: "invalid_credential_reference",
        message:
          "Signed webhook ingress requires exactly one valid names-only credential reference.",
        path: ["credentialReferences"],
      });
    }
  }

  if (!configuration.success || issues.length > 0 || !Array.isArray(input.credentialReferences)) {
    return { success: false, issues };
  }
  const credentialReference = input.credentialReferences[0];
  if (
    typeof credentialReference !== "string" ||
    !isFlowcordiaCredentialReference(credentialReference)
  ) {
    return { success: false, issues };
  }

  return {
    success: true,
    binding: {
      configuration: configuration.configuration,
      credentialReference,
      signature: {
        algorithm: "hmac-sha256",
        signatureHeader: FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER,
        timestampHeader: FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER,
        deliveryHeader: FLOWCORDIA_WEBHOOK_DELIVERY_HEADER,
      },
    },
    issues: [],
  };
}

export function serializeFlowcordiaWebhookConfiguration(
  configuration: FlowcordiaWebhookConfiguration
): JsonObject {
  return {
    method: configuration.method,
    path: configuration.path,
    maxBodyBytes: configuration.maxBodyBytes,
    timestampToleranceSeconds: configuration.timestampToleranceSeconds,
  };
}
