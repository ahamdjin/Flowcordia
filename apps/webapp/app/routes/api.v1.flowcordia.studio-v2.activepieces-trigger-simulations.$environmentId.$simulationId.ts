import type { ActionFunctionArgs } from "@remix-run/node";
import { findStudioV2ActivepiecesTriggerSimulation } from "~/features/flowcordia/workflows/studio-v2/activepieces-interaction.server";

const JSON_CONTENT_TYPE = "application/json";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

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

async function requestBody(request: Request): Promise<{ body: unknown; rawBody?: string }> {
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

  const rawBody = await request.text();
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
    for (const [key, value] of new URLSearchParams(rawBody).entries()) appendValue(body, key, value);
    return { body, rawBody };
  }
  return { body: rawBody, rawBody };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const environmentId = params.environmentId;
  const simulationId = params.simulationId;
  if (!environmentId || !simulationId) {
    return Response.json({ code: "invalid_activepieces_simulation" }, { status: 400 });
  }

  const simulation = await findStudioV2ActivepiecesTriggerSimulation({
    environmentId,
    simulationId,
  });
  if (!simulation || simulation.status !== "ARMED" || !simulation.waitTokenUrl) {
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
