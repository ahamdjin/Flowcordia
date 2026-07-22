import {
  flowcordiaCredentialEnvironmentName,
  flowcordiaWebhookHmacEnvironmentName,
  isFlowcordiaCredentialReference,
} from "@flowcordia/workflow";
import { z } from "zod";

export const FLOWCORDIA_CREDENTIAL_MAX_HEADERS = 32;
export const FLOWCORDIA_CREDENTIAL_MAX_HEADER_NAME_LENGTH = 128;
export const FLOWCORDIA_CREDENTIAL_MAX_HEADER_VALUE_LENGTH = 8_192;
export const FLOWCORDIA_CREDENTIAL_MAX_SERIALIZED_BYTES = 32_768;
export const FLOWCORDIA_CREDENTIAL_REQUEST_MAX_BYTES = 64 * 1_024;
export const FLOWCORDIA_WEBHOOK_SECRET_MIN_BYTES = 32;
export const FLOWCORDIA_WEBHOOK_SECRET_MAX_BYTES = 4_096;

const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FORBIDDEN_HTTP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const WorkflowIdentity = z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/);
const NodeIdentity = z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/);
const CredentialReference = z
  .string()
  .min(1)
  .max(64)
  .refine(isFlowcordiaCredentialReference, "Credential reference is invalid.");

export type FlowcordiaCredentialType = "http_headers" | "webhook_hmac";

export const FlowcordiaCredentialHeaderInput = z
  .object({
    name: z.string().min(1).max(FLOWCORDIA_CREDENTIAL_MAX_HEADER_NAME_LENGTH),
    value: z.string().min(1).max(FLOWCORDIA_CREDENTIAL_MAX_HEADER_VALUE_LENGTH),
  })
  .strict();

const FlowcordiaCredentialCommandIdentity = {
  operation: z.literal("store"),
  workflowId: WorkflowIdentity,
  nodeId: NodeIdentity,
  reference: CredentialReference,
  confirmation: z.literal("STORE_FLOWCORDIA_CREDENTIAL"),
} as const;

const FlowcordiaHttpCredentialWriteCommand = z
  .object({
    ...FlowcordiaCredentialCommandIdentity,
    credentialType: z.literal("http_headers").optional().default("http_headers"),
    headers: z.array(FlowcordiaCredentialHeaderInput).min(1).max(FLOWCORDIA_CREDENTIAL_MAX_HEADERS),
  })
  .strict();

const FlowcordiaWebhookCredentialWriteCommand = z
  .object({
    ...FlowcordiaCredentialCommandIdentity,
    credentialType: z.literal("webhook_hmac"),
    secret: z.string().min(1).max(FLOWCORDIA_WEBHOOK_SECRET_MAX_BYTES),
  })
  .strict();

export const FlowcordiaCredentialWriteCommand = z.union([
  FlowcordiaHttpCredentialWriteCommand,
  FlowcordiaWebhookCredentialWriteCommand,
]);

export type FlowcordiaCredentialWriteCommand = z.infer<typeof FlowcordiaCredentialWriteCommand>;

export interface FlowcordiaCredentialHeader {
  name: string;
  value: string;
}

export type FlowcordiaCredentialBindingState =
  | "READY"
  | "MISSING"
  | "NOT_SECRET"
  | "TYPE_CONFLICT"
  | "UNAVAILABLE";

export interface FlowcordiaCredentialBindingProjection {
  reference: string;
  credentialType: FlowcordiaCredentialType | "conflict";
  environmentName: string;
  state: FlowcordiaCredentialBindingState;
  version: number | null;
}

export interface FlowcordiaCredentialEnvironmentProjection {
  slug: string;
  type: "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
}

export interface FlowcordiaCredentialWorkspaceProjection {
  environment: FlowcordiaCredentialEnvironmentProjection | null;
  bindings: FlowcordiaCredentialBindingProjection[];
}

export type FlowcordiaCredentialCommandResponse =
  | {
      ok: true;
      status: "stored";
      reference: string;
      credentialType: FlowcordiaCredentialType;
      environmentName: string;
    }
  | {
      ok: false;
      error: string;
      message: string;
      retryable: boolean;
    };

export type FlowcordiaCredentialHeaderResult =
  | { success: true; headers: FlowcordiaCredentialHeader[]; serialized: string }
  | { success: false; message: string };

export type FlowcordiaWebhookSecretResult =
  | { success: true; serialized: string; byteLength: number }
  | { success: false; message: string };

export function normalizeFlowcordiaCredentialHeaders(
  headers: readonly FlowcordiaCredentialHeader[]
): FlowcordiaCredentialHeaderResult {
  if (headers.length === 0 || headers.length > FLOWCORDIA_CREDENTIAL_MAX_HEADERS) {
    return {
      success: false,
      message: `Credentials require 1-${FLOWCORDIA_CREDENTIAL_MAX_HEADERS} HTTP headers.`,
    };
  }

  const normalized: FlowcordiaCredentialHeader[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    const name = header.name.trim().toLowerCase();
    const value = header.value;
    if (
      name.length === 0 ||
      name.length > FLOWCORDIA_CREDENTIAL_MAX_HEADER_NAME_LENGTH ||
      !HTTP_HEADER_NAME_PATTERN.test(name)
    ) {
      return { success: false, message: "Credential header names must be valid HTTP tokens." };
    }
    if (FORBIDDEN_HTTP_HEADERS.has(name)) {
      return {
        success: false,
        message: `Credential header "${name}" is controlled by the HTTP runtime.`,
      };
    }
    if (
      value.length === 0 ||
      value.length > FLOWCORDIA_CREDENTIAL_MAX_HEADER_VALUE_LENGTH ||
      value.includes("\r") ||
      value.includes("\n")
    ) {
      return {
        success: false,
        message: "Credential header values must be non-empty, bounded, and single-line.",
      };
    }
    if (seen.has(name)) {
      return { success: false, message: `Credential header "${name}" is duplicated.` };
    }
    seen.add(name);
    normalized.push({ name, value });
  }

  normalized.sort((left, right) => left.name.localeCompare(right.name));
  const serialized = JSON.stringify({
    headers: Object.fromEntries(normalized.map((header) => [header.name, header.value])),
  });
  if (new TextEncoder().encode(serialized).length > FLOWCORDIA_CREDENTIAL_MAX_SERIALIZED_BYTES) {
    return {
      success: false,
      message: `The serialized credential must stay under ${FLOWCORDIA_CREDENTIAL_MAX_SERIALIZED_BYTES} bytes.`,
    };
  }
  return { success: true, headers: normalized, serialized };
}

export function normalizeFlowcordiaWebhookSecret(secret: string): FlowcordiaWebhookSecretResult {
  if (secret.includes("\0") || secret.includes("\r") || secret.includes("\n")) {
    return {
      success: false,
      message: "Webhook secrets must be single-line and cannot contain NUL bytes.",
    };
  }
  const byteLength = new TextEncoder().encode(secret).length;
  if (
    byteLength < FLOWCORDIA_WEBHOOK_SECRET_MIN_BYTES ||
    byteLength > FLOWCORDIA_WEBHOOK_SECRET_MAX_BYTES
  ) {
    return {
      success: false,
      message: `Webhook secrets must contain ${FLOWCORDIA_WEBHOOK_SECRET_MIN_BYTES}-${FLOWCORDIA_WEBHOOK_SECRET_MAX_BYTES} UTF-8 bytes.`,
    };
  }
  const serialized = JSON.stringify({ type: "webhook_hmac", secret });
  if (new TextEncoder().encode(serialized).length > FLOWCORDIA_CREDENTIAL_MAX_SERIALIZED_BYTES) {
    return {
      success: false,
      message: `The serialized credential must stay under ${FLOWCORDIA_CREDENTIAL_MAX_SERIALIZED_BYTES} bytes.`,
    };
  }
  return { success: true, serialized, byteLength };
}

export function credentialEnvironmentName(
  reference: string,
  credentialType: FlowcordiaCredentialType = "http_headers"
): string {
  return credentialType === "webhook_hmac"
    ? flowcordiaWebhookHmacEnvironmentName(reference)
    : flowcordiaCredentialEnvironmentName(reference);
}
