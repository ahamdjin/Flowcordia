import type { FlowcordiaActivepiecesTriggerPayload } from "@flowcordia/runtime";
import {
  saveStudioV2ActivepiecesStepFile,
  studioV2ActivepiecesMaxFileBytes,
} from "./activepieces-step-files.server";

const JSON_CONTENT_TYPE = "application/json";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
const DEFAULT_ACTIVEPIECES_WEBHOOK_PAYLOAD_SIZE_MB = 25;

export type StudioV2ActivepiecesWebhookStorageContext = {
  environmentId: string;
  workflowId: string;
  publicOrigin: string;
};

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function studioV2ActivepiecesMaxWebhookPayloadBytes(): number {
  return (
    positiveIntegerEnvironment(
      "AP_MAX_WEBHOOK_PAYLOAD_SIZE_MB",
      DEFAULT_ACTIVEPIECES_WEBHOOK_PAYLOAD_SIZE_MB
    ) *
    1024 *
    1024
  );
}

function appendValue(record: Record<string, unknown>, key: string, value: unknown): void {
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

function payloadTooLarge(maxBytes: number): Response {
  return new Response(
    JSON.stringify({
      code: "activepieces_webhook_payload_too_large",
      message: `Activepieces webhook payload exceeds the maximum allowed size of ${maxBytes} bytes.`,
    }),
    { status: 413, headers: { "content-type": JSON_CONTENT_TYPE } }
  );
}

async function readBytesBounded(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge(maxBytes);
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw payloadTooLarge(maxBytes);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

async function readTextBounded(request: Request, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBytesBounded(request, maxBytes));
}

function binaryExtension(contentType: string | undefined): string {
  const base = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const known: Record<string, string> = {
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/gzip": "gz",
    "application/octet-stream": "bin",
    "text/csv": "csv",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
  };
  if (base && known[base]) return known[base];
  const subtype = base?.split("/", 2)[1]?.replace(/[^a-z0-9]+/g, "");
  return subtype || "bin";
}

export function isStudioV2ActivepiecesBinaryContentType(contentType: string | undefined): boolean {
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

async function convertMultipartBody(
  request: Request,
  storage: StudioV2ActivepiecesWebhookStorageContext,
  maxWebhookBytes: number
): Promise<Record<string, unknown>> {
  const bytes = await readBytesBounded(request, maxWebhookBytes);
  const parsedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bytes,
  });
  const formData = await parsedRequest.formData();
  const result: Record<string, unknown> = {};
  const maxFileBytes = studioV2ActivepiecesMaxFileBytes();
  for (const [fieldName, value] of formData.entries()) {
    if (typeof value === "string") {
      appendValue(result, fieldName, value);
      continue;
    }
    if (value.size > maxFileBytes) {
      throw payloadTooLarge(maxFileBytes);
    }
    const saved = await saveStudioV2ActivepiecesStepFile({
      environmentId: storage.environmentId,
      workflowId: storage.workflowId,
      publicOrigin: storage.publicOrigin,
      data: value.stream(),
      fileName: value.name || "file.bin",
      contentType: value.type || "application/octet-stream",
      declaredSize: value.size,
    });
    appendValue(result, fieldName, saved.readUrl);
  }
  return result;
}

export async function convertStudioV2ActivepiecesWebhookRequest(
  request: Request,
  storage?: StudioV2ActivepiecesWebhookStorageContext
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

  const maxWebhookBytes = studioV2ActivepiecesMaxWebhookPayloadBytes();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxWebhookBytes) {
    throw payloadTooLarge(maxWebhookBytes);
  }

  if (isStudioV2ActivepiecesMultipartContentType(contentTypeHeader)) {
    if (!storage) {
      throw new Error("Activepieces multipart webhook storage context is required.");
    }
    return {
      ...payload,
      body: await convertMultipartBody(request, storage, maxWebhookBytes),
    };
  }

  if (isStudioV2ActivepiecesBinaryContentType(contentTypeHeader)) {
    if (!storage || !request.body) {
      throw new Error("Activepieces binary webhook storage context is required.");
    }
    const saved = await saveStudioV2ActivepiecesStepFile({
      environmentId: storage.environmentId,
      workflowId: storage.workflowId,
      publicOrigin: storage.publicOrigin,
      data: request.body,
      fileName: `file.${binaryExtension(contentTypeHeader)}`,
      contentType: contentType ?? "application/octet-stream",
      ...(declared > 0 ? { declaredSize: declared } : {}),
    });
    return { ...payload, body: { fileUrl: saved.readUrl } };
  }

  const rawBody = await readTextBounded(request, maxWebhookBytes);
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
