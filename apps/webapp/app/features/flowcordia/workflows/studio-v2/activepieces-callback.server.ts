import { json } from "@remix-run/node";

const MAX_CALLBACK_BODY_BYTES = 1024 * 1024;
const TRIGGER_WAITPOINT_CALLBACK_PATH =
  /^\/api\/v1\/waitpoints\/tokens\/waitpoint_[A-Za-z0-9_-]+\/callback\/[A-Za-z0-9_-]+$/;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

function response(status: number, body: { accepted?: true; error?: string }): Response {
  return json(body, { status, headers: RESPONSE_HEADERS });
}

function decodeTarget(encodedTarget: string): URL | null {
  try {
    const value = Buffer.from(encodedTarget, "base64url").toString("utf8");
    return new URL(value);
  } catch {
    return null;
  }
}

async function readCallbackBody(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new Error("invalid_content_length");
    }
    if (parsedLength > MAX_CALLBACK_BODY_BYTES) throw new Error("body_too_large");
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_CALLBACK_BODY_BYTES) throw new Error("body_too_large");
  if (body.byteLength === 0) return null;

  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return JSON.parse(text) as unknown;
  }
  return text;
}

function callbackHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    const normalizedName = name.toLowerCase();
    if (normalizedName === "cookie" || normalizedName === "set-cookie") continue;
    result[normalizedName] = value;
  }
  return result;
}

export async function handleStudioV2ActivepiecesCallback(
  request: Request,
  encodedTarget: string | undefined,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<Response> {
  if (!encodedTarget) return response(404, { error: "not_found" });

  const target = decodeTarget(encodedTarget);
  if (!target) return response(404, { error: "not_found" });

  const requestUrl = new URL(request.url);
  if (
    (requestUrl.protocol !== "https:" && requestUrl.protocol !== "http:") ||
    target.origin !== requestUrl.origin ||
    !TRIGGER_WAITPOINT_CALLBACK_PATH.test(target.pathname) ||
    target.search.length > 0 ||
    target.hash.length > 0
  ) {
    return response(404, { error: "not_found" });
  }

  let body: unknown;
  try {
    body = await readCallbackBody(request);
  } catch (error) {
    return response(error instanceof Error && error.message === "body_too_large" ? 413 : 400, {
      error: "invalid_request",
    });
  }

  const resumePayload = {
    body,
    headers: callbackHeaders(request.headers),
    queryParams: Object.fromEntries(requestUrl.searchParams.entries()),
  };

  let completed: Response;
  try {
    completed = await fetchImpl(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resumePayload),
      redirect: "manual",
    });
  } catch {
    return response(503, { error: "temporarily_unavailable" });
  }

  if (!completed.ok) return response(502, { error: "callback_failed" });
  return response(200, { accepted: true });
}
