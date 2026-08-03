import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "~/db.server";
import { findStudioV2ActivepiecesTriggerSimulation } from "~/features/flowcordia/workflows/studio-v2/activepieces-interaction.server";
import { convertStudioV2ActivepiecesWebhookRequest } from "~/features/flowcordia/workflows/studio-v2/activepieces-webhook-request.server";

const JSON_CONTENT_TYPE = "application/json";
const CALLBACK_RESULT_POLL_ATTEMPTS = 100;
const CALLBACK_RESULT_POLL_INTERVAL_MS = 100;

type CallbackResult =
  | { kind: "EVENT_ACCEPTED" }
  | {
      kind: "HANDSHAKE";
      response: {
        status: number;
        body?: unknown;
        headers?: Record<string, string>;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseCallbackResult(metadataValue: unknown, requestId: string): CallbackResult | null {
  if (!isRecord(metadataValue)) return null;
  const simulation = metadataValue.flowcordiaActivepiecesTriggerSimulation;
  if (!isRecord(simulation)) return null;
  const callbackResult = simulation.callbackResult;
  if (!isRecord(callbackResult) || callbackResult.requestId !== requestId) return null;
  if (callbackResult.kind === "EVENT_ACCEPTED") return { kind: "EVENT_ACCEPTED" };
  if (callbackResult.kind !== "HANDSHAKE" || !isRecord(callbackResult.response)) return null;

  const status = callbackResult.response.status;
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
    return null;
  }
  let responseHeaders: Record<string, string> | undefined;
  if (callbackResult.response.headers !== undefined) {
    if (!isRecord(callbackResult.response.headers)) return null;
    const entries = Object.entries(callbackResult.response.headers);
    if (entries.some(([, value]) => typeof value !== "string")) return null;
    responseHeaders = Object.fromEntries(entries) as Record<string, string>;
  }
  return {
    kind: "HANDSHAKE",
    response: {
      status,
      ...(callbackResult.response.body !== undefined
        ? { body: callbackResult.response.body }
        : {}),
      ...(responseHeaders ? { headers: responseHeaders } : {}),
    },
  };
}

async function waitForCallbackResult(runId: string, requestId: string): Promise<CallbackResult> {
  for (let attempt = 0; attempt < CALLBACK_RESULT_POLL_ATTEMPTS; attempt += 1) {
    const run = await prisma.taskRun.findUnique({
      where: { id: runId },
      select: { metadata: true },
    });
    const result = parseCallbackResult(run?.metadata, requestId);
    if (result) return result;
    await sleep(CALLBACK_RESULT_POLL_INTERVAL_MS);
  }
  throw new Response(
    JSON.stringify({
      code: "activepieces_simulation_callback_timeout",
      message: "Activepieces trigger simulation did not acknowledge the callback in time.",
    }),
    { status: 504, headers: { "content-type": JSON_CONTENT_TYPE } }
  );
}

function handshakeResponse(result: Extract<CallbackResult, { kind: "HANDSHAKE" }>): Response {
  const responseHeaders = new Headers(result.response.headers);
  let body: BodyInit | null = null;
  if (result.response.body !== undefined && result.response.body !== null) {
    if (typeof result.response.body === "string") {
      body = result.response.body;
    } else {
      body = JSON.stringify(result.response.body);
      if (!responseHeaders.has("content-type")) {
        responseHeaders.set("content-type", JSON_CONTENT_TYPE);
      }
    }
  }
  return new Response(body, { status: result.response.status, headers: responseHeaders });
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

  const payload = await convertStudioV2ActivepiecesWebhookRequest(request, {
    environmentId: simulation.environmentId,
    workflowId: simulation.flowId,
    publicOrigin: new URL(request.url).origin,
  });
  const callbackRequestId = randomUUID();
  const completed = await fetch(simulation.waitTokenUrl, {
    method: "POST",
    headers: { "content-type": JSON_CONTENT_TYPE },
    body: JSON.stringify({ kind: "CALLBACK", requestId: callbackRequestId, payload }),
    redirect: "error",
  });
  if (!completed.ok) {
    return Response.json(
      { code: "activepieces_simulation_completion_failed" },
      { status: completed.status >= 400 && completed.status < 500 ? 409 : 502 }
    );
  }

  const callbackResult = await waitForCallbackResult(simulation.runId, callbackRequestId);
  return callbackResult.kind === "HANDSHAKE" ? handshakeResponse(callbackResult) : Response.json({});
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  return handleSimulationRequest(request, params);
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handleSimulationRequest(request, params);
}
