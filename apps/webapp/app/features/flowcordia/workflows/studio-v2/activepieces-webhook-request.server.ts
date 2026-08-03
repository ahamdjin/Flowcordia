import type { FlowcordiaActivepiecesTriggerPayload } from "@flowcordia/runtime";

const JSON_CONTENT_TYPE = "application/json";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
export const STUDIO_V2_ACTIVEPIECES_MAX_INLINE_BODY_BYTES = 1024 * 1024;

function appendValue(record: Record<string, unknown>, key: string, value: string): void {
  const current = record[key];
  if (current === undefined) {
    record[key] = value;
    return;
  }
  record[key] = Array.isArray(current) ? [...current, value] : [current, value];
}

function queryParams(url: URL): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) result[key] = value;
  return result;
}

function requestHeaders(request: Request): Record<string, string> {
  return Object.fromEntries(
    Array.from(request.headers.entries(), ([key, value]) => [key.toLowerCase(), value])
  );
}

function payloadTooLarge(): Response {
  return new Response(
    JSON.stringify({
      code: "activepieces_webhook_payload_too_large",
      message: "Activepieces webhook payload exceeds the bounded 1 MiB inline limit.",
    }),
    { status: 413, headers: { "content-type": JSON_CONTENT_TYPE } }
  );
}

async function readTextBounded(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declared) &&
    declared > STUDIO_V2_ACTIVEPIECES_MAX_INLINE_BODY_BYTES
  ) {
    throw payloadTooLarge();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > STUDIO_V2_ACTIVEPIECES_MAX_INLINE_BODY_BYTES) {
        await reader.cancel();
        throw payloadTooLarge();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

export function isStudioV2ActivepiecesBinaryContentType(
  contentType: string | undefined
): boolean {
  if (!contentType) return false;
  const base = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    base?.startsWith("image/") === true ||
    base?.startsWith("video/") === true ||
    base?.startsWith("audio/") === true ||
    [
      "application/pdf",
      "application/zip",
      "application/gzip",
      "application/octet-stream",
      "text/csv",
    ].includes(base ?? "")
  );
}

export function isStudioV2ActivepiecesMultipartContentType(
  contentType: string | undefined
): boolean {
  return contentType?.trim().toLowerCase().startsWith("multipart/") ?? false;
}

export async function convertStudioV2ActivepiecesWebhookRequest(
  request: Request
): Promise<FlowcordiaActivepiecesTriggerPayload> {
  const contentTypeHeader = request.headers.get("content-type") ?? undefined;
  const contentType = contentTypeHeader?.split(";", 1)[0]?.trim().toLowerCase();
  const payload: FlowcordiaActivepiecesTriggerPayload = {
    method: request.method,
    headers: requestHeaders(request),
    body: null,
    queryParams: queryParams(new URL(request.url)),
  };

  if (request.method === "GET" || request.method === "HEAD") {
    return { ...payload, rawBody: "" };
  }
  if (isStudioV2ActivepiecesMultipartContentType(contentTypeHeader)) {
    throw new Response(
      JSON.stringify({
        code: "activepieces_webhook_multipart_pending",
        message:
          "Multipart Activepieces webhooks require the exact FLOW_STEP_FILE storage mapping before they can be accepted losslessly.",
      }),
      { status: 415, headers: { "content-type": JSON_CONTENT_TYPE } }
    );
  }
  if (isStudioV2ActivepiecesBinaryContentType(contentTypeHeader)) {
    throw new Response(
      JSON.stringify({
        code: "activepieces_webhook_binary_pending",
        message:
          "Binary Activepieces webhooks require the exact FLOW_STEP_FILE storage mapping before they can be accepted losslessly.",
      }),
      { status: 415, headers: { "content-type": JSON_CONTENT_TYPE } }
    );
  }

  const rawBody = await readTextBounded(request);
  if (!rawBody) return { ...payload, rawBody: "" };
  if (contentType === JSON_CONTENT_TYPE || contentType?.endsWith("+json")) {
    try {
      return { ...payload, body: JSON.parse(rawBody) as unknown, rawBody };
    } catch {
      return { ...payload, body: rawBody, rawBody };
    }
  }
  if (contentType === FORM_CONTENT_TYPE) {
    const body: Record<string, unknown> = {};
    for (const [key, value] of new URLSearchParams(rawBody).entries()) {
      appendValue(body, key, value);
    }
    return { ...payload, body, rawBody };
  }
  return { ...payload, body: rawBody, rawBody };
}
