import { createHash } from "node:crypto";
import type { JsonValue } from "@flowcordia/workflow";

export const FLOWCORDIA_PUBLIC_WEBHOOK_ROUTE_PREFIX = "/api/v1/flowcordia/webhooks" as const;
export const FLOWCORDIA_PUBLIC_WEBHOOK_LEASE_MILLISECONDS = 4 * 60 * 1000;
export const FLOWCORDIA_PUBLIC_WEBHOOK_IDEMPOTENCY_MILLISECONDS = 24 * 60 * 60 * 1000;

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;

export type FlowcordiaPublicWebhookJsonResult =
  | { success: true; payload: JsonValue }
  | { success: false; code: "invalid_utf8" | "invalid_json" };

export function isFlowcordiaPublicWebhookId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}

export function isFlowcordiaPublicWebhookJsonContentType(value: string | null): boolean {
  return value !== null && JSON_CONTENT_TYPE_PATTERN.test(value.trim());
}

export function flowcordiaPublicWebhookUrl(input: {
  origin: string;
  publicId: string;
  path: string;
}): string {
  const origin = input.origin.replace(/\/+$/, "");
  return `${origin}${FLOWCORDIA_PUBLIC_WEBHOOK_ROUTE_PREFIX}/${input.publicId}${input.path}`;
}

export function flowcordiaPublicWebhookRequestedPath(input: {
  requestUrl: string;
  publicId: string;
}): string | null {
  if (!isFlowcordiaPublicWebhookId(input.publicId)) return null;
  let url: URL;
  try {
    url = new URL(input.requestUrl);
  } catch {
    return null;
  }
  if (url.search || url.hash || url.pathname.includes("%")) return null;
  const prefix = `${FLOWCORDIA_PUBLIC_WEBHOOK_ROUTE_PREFIX}/${input.publicId}`;
  if (!url.pathname.startsWith(prefix)) return null;
  const suffix = url.pathname.slice(prefix.length);
  if (suffix === "") return "/";
  if (!suffix.startsWith("/") || suffix.includes("//") || suffix.includes("\\")) return null;
  return suffix;
}

export function parseFlowcordiaPublicWebhookJson(
  body: Uint8Array
): FlowcordiaPublicWebhookJsonResult {
  if (body.byteLength === 0) return { success: true, payload: null };
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return { success: false, code: "invalid_utf8" };
  }
  try {
    return { success: true, payload: JSON.parse(source) as JsonValue };
  } catch {
    return { success: false, code: "invalid_json" };
  }
}

export function flowcordiaPublicWebhookRunIdempotencyKey(input: {
  endpointStorageId: string;
  deliveryId: string;
}): string {
  const digest = createHash("sha256")
    .update(`flowcordia:public-webhook:v1:${input.endpointStorageId}:${input.deliveryId}`, "utf8")
    .digest("hex");
  return `flowcordia_webhook_${digest}`;
}

export function flowcordiaPublicWebhookDeliveryRateKey(input: {
  endpointStorageId: string;
  deliveryId: string;
}): string {
  return createHash("sha256")
    .update(`${input.endpointStorageId}:${input.deliveryId}`, "utf8")
    .digest("hex");
}
