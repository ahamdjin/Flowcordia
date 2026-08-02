import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { findStudioV2ActivepiecesTriggerSimulation } from "~/features/flowcordia/workflows/studio-v2/activepieces-interaction.server";

const JSON_CONTENT_TYPE = "application/json";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
const MAX_INLINE_BODY_BYTES = 1024 * 1024;

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

function headers(request: Request): Record<string, string> {
  return Object.fromEntries(request.headers.entries());
}

function payloadTooLarge(): Response {
  return new Response(
    JSON.stringify({
      code: "activepieces_simulation_payload_too_large",
      message: "Activepieces trigger simulation payload exceeds the bounded 1 MiB inline limit.",
    }),
    { status: 413, headers: { "content-type": JSON_CONTENT_TYPE } }
  );
}

async function readTextBounded(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_INLINE_BODY_BYTES) throw payloadTooLarge();
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
      if (received > MAX_INLINE_BODY_BYTES) {
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

async function requestBody(request: Request): Promise<{ body: unknown; rawBody?: string }> {
  if (request.method === "GET" || request.method === "HEAD") return { body: null, rawBody: "" };

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType?.startsWith("multipart/")) {
    throw new Response(
      JSON.stringify({
        code: "activepieces_simulation_multipart_pending",
        message:
          "Multipart Activepieces trigger simulation requires Flowcordia file-storage mapping before it can be accepted losslessly.",
      }),
      { status: 415, headers: { "content-type": JSON_CONTENT_TYPE } }
    );
  }
  if (
    contentType?.startsWith("image/") ||
    contentType?.startsWith("video/") ||
    contentType?.startsWith("audio/") ||
    [
      "application/pdf",
      "application/zip",
      "application/gzip",
      "application/octet-stream",
      "text/csv",
    ].includes(contentType ?? "")
  ) {
    throw new Response(
      JSON.stringify({
        code: "activepieces_simulation_binary_pending",
        message:
          "Binary Activepieces trigger simulation requires Flowcordia file-storage mapping before it can be accepted losslessly.",
      }),
      { status: 415, headers: { "content-type": JSON_CONTENT_TYPE } }
    );
  }

  const rawBody = await readTextBounded(request);
  if (!rawBody) return { body: null, rawBody: "" };
  if (contentType === JSON_CONTENT_TYPE || contentType?.endsWith("+json")) {
    try {
      return { body: JSON.parse(rawBody) as unknown, rawBody };
    } catch {
      return { body: rawBody, rawBody };
    }
  }
  if (contentType === FORM_CONTENT_TYPE) {
    const body: Record<string, unknown> = {};
    for (const [key, value] of new URLSearchParams(rawBody).entries())
      appendValue(body, key, value);
    return { body, rawBody };
  }
  return { body: rawBody, rawBody };
}

async function handleSimulationRequest(
  request: Request,
  params: Record<string, string | undefined>
): Promise<Response> {
  const environmentId = params.environmentId;
  const simulationId = params.simulationId;
  if (!environmentId || !simulationId) {
    return Response.json({ code: "invalid_activepieces_simulation" }, { status: 400 });
  }

  const simulation = await findStudioV2ActivepiecesTriggerSimulation({
    environmentId,
    simulationId,
  });
  if (
    !simulation ||
    (simulation.status !== "ARMING" && simulation.status !== "ARMED") ||
    !simulation.waitTokenUrl
  ) {
    return Response.json({ code: "activepieces_simulation_not_armed" }, { status: 410 });
  }

  const converted = await requestBody(request);
  const payload = {
    method: request.method,
    headers: headers(request),
    body: converted.body,
    queryParams: queryParams(new URL(request.url)),
    ...(converted.rawBody !== undefined ? { rawBody: converted.rawBody } : {}),
  };
  const completed = await fetch(simulation.waitTokenUrl, {
    method: "POST",
    headers: { "content-type": JSON_CONTENT_TYPE },
    body: JSON.stringify(payload),
    redirect: "error",
  });
  if (!completed.ok) {
    return Response.json(
      { code: "activepieces_simulation_completion_failed" },
      { status: completed.status >= 400 && completed.status < 500 ? 409 : 502 }
    );
  }
  return Response.json({});
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  return handleSimulationRequest(request, params);
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handleSimulationRequest(request, params);
}
