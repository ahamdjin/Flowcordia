import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  deleteStudioV2ActivepiecesSimulationAppListeners,
  findStudioV2ActivepiecesAppEventParserHost,
  listStudioV2ActivepiecesSimulationAppListeners,
} from "~/features/flowcordia/workflows/studio-v2/activepieces-app-event-listeners.server";
import {
  executeStudioV2ActivepiecesInteraction,
  findStudioV2ActivepiecesTriggerSimulation,
} from "~/features/flowcordia/workflows/studio-v2/activepieces-interaction.server";
import { convertStudioV2ActivepiecesWebhookRequest } from "~/features/flowcordia/workflows/studio-v2/activepieces-webhook-request.server";

const JSON_CONTENT_TYPE = "application/json";

const ACTIVEPIECES_APP_WEBHOOK_PIECES: Record<string, string> = {
  slack: "@activepieces/piece-slack",
  square: "@activepieces/piece-square",
  "facebook-leads": "@activepieces/piece-facebook-leads",
  intercom: "@activepieces/piece-intercom",
};

type AppEventParseResult = {
  reply: { body?: unknown; headers?: Record<string, string> } | null;
  event: string | null;
  identifierValue: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseAppEventResult(value: unknown): AppEventParseResult | null {
  if (!isRecord(value)) return null;
  const event = typeof value.event === "string" ? value.event : null;
  const identifierValue = typeof value.identifierValue === "string" ? value.identifierValue : null;
  let reply: AppEventParseResult["reply"] = null;
  if (value.reply !== null && value.reply !== undefined) {
    if (!isRecord(value.reply)) return null;
    let replyHeaders: Record<string, string> | undefined;
    if (value.reply.headers !== undefined) {
      if (!isRecord(value.reply.headers)) return null;
      const entries = Object.entries(value.reply.headers);
      if (entries.some(([, headerValue]) => typeof headerValue !== "string")) return null;
      replyHeaders = Object.fromEntries(entries) as Record<string, string>;
    }
    reply = {
      ...(value.reply.body !== undefined ? { body: value.reply.body } : {}),
      ...(replyHeaders ? { headers: replyHeaders } : {}),
    };
  }
  return { reply, event, identifierValue };
}

function providerReply(reply: NonNullable<AppEventParseResult["reply"]>): Response {
  const headers = new Headers(reply.headers);
  const body = reply.body ?? {};
  if (typeof body === "string") return new Response(body, { status: 200, headers });
  if (!headers.has("content-type")) headers.set("content-type", JSON_CONTENT_TYPE);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

async function forwardSimulationEvent(input: {
  environmentId: string;
  simulationId: string;
  payload: Awaited<ReturnType<typeof convertStudioV2ActivepiecesWebhookRequest>>;
}): Promise<void> {
  const simulation = await findStudioV2ActivepiecesTriggerSimulation({
    environmentId: input.environmentId,
    simulationId: input.simulationId,
  });
  if (
    !simulation ||
    (simulation.status !== "ARMING" && simulation.status !== "ARMED") ||
    !simulation.waitTokenUrl
  ) {
    return;
  }
  const response = await fetch(simulation.waitTokenUrl, {
    method: "POST",
    headers: { "content-type": JSON_CONTENT_TYPE },
    body: JSON.stringify({ kind: "CALLBACK", requestId: randomUUID(), payload: input.payload }),
    redirect: "error",
  });
  if (response.ok) {
    await deleteStudioV2ActivepiecesSimulationAppListeners({
      simulationId: input.simulationId,
    });
  }
}

async function handleAppEvent(request: Request, pieceUrl: string | undefined): Promise<Response> {
  const pieceName = pieceUrl ? ACTIVEPIECES_APP_WEBHOOK_PIECES[pieceUrl] : undefined;
  if (!pieceName) {
    return Response.json(
      { code: "activepieces_app_event_piece_not_found" },
      { status: 404 }
    );
  }

  const parserHost = await findStudioV2ActivepiecesAppEventParserHost({ pieceName });
  if (!parserHost?.createdByUserId) {
    return Response.json(
      {
        code: "activepieces_app_event_parser_unavailable",
        message:
          "The exact Activepieces app-event parser is unavailable until this piece has an active Flowcordia listener.",
      },
      { status: 503 }
    );
  }

  const payload = await convertStudioV2ActivepiecesWebhookRequest(request, {
    environmentId: parserHost.runtimeEnvironmentId,
    workflowId: parserHost.workflowId,
    publicOrigin: new URL(request.url).origin,
  });
  const parsed = parseAppEventResult(
    await executeStudioV2ActivepiecesInteraction({
      projectId: parserHost.projectId,
      environmentId: parserHost.runtimeEnvironmentId,
      actorId: parserHost.createdByUserId,
      pieceName,
      pieceVersion: parserHost.pieceVersion,
      payload: {
        kind: "app_event_parse",
        payload,
      },
    })
  );
  if (!parsed) {
    return Response.json({ code: "activepieces_app_event_invalid_result" }, { status: 502 });
  }
  if (parsed.reply) return providerReply(parsed.reply);
  if (!parsed.event || !parsed.identifierValue) {
    return new Response("{}", {
      status: 400,
      headers: { "content-type": JSON_CONTENT_TYPE },
    });
  }

  const listeners = await listStudioV2ActivepiecesSimulationAppListeners({
    pieceName,
    event: parsed.event,
    identifierValue: parsed.identifierValue,
  });
  await Promise.allSettled(
    listeners.flatMap((listener) =>
      listener.simulationId
        ? [
            forwardSimulationEvent({
              environmentId: listener.runtimeEnvironmentId,
              simulationId: listener.simulationId,
              payload,
            }),
          ]
        : []
    )
  );

  return new Response("{}", {
    status: 200,
    headers: { "content-type": JSON_CONTENT_TYPE },
  });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  return handleAppEvent(request, params.pieceUrl);
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handleAppEvent(request, params.pieceUrl);
}
