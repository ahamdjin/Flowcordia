import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import type { FlowcordiaActivepiecesWebhookHandshakeConfiguration } from "@flowcordia/runtime";
import { isFlowcordiaActivepiecesHandshakeRequest } from "@flowcordia/runtime";
import {
  getStudioV2ActivepiecesProductionBindingByRelease,
  runStudioV2ActivepiecesProductionTrigger,
} from "~/features/flowcordia/workflows/studio-v2/activepieces-production-binding.server";
import { executeStudioV2ActivepiecesInteraction } from "~/features/flowcordia/workflows/studio-v2/activepieces-interaction.server";
import { convertStudioV2ActivepiecesWebhookRequest } from "~/features/flowcordia/workflows/studio-v2/activepieces-webhook-request.server";
import { getStudioV2ReleaseByPublicIdAcrossScopes } from "~/features/flowcordia/workflows/studio-v2/release-repository.server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function handshakeConfiguration(
  value: unknown
): FlowcordiaActivepiecesWebhookHandshakeConfiguration | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.strategy !== "string") return null;
  if (
    !["NONE", "HEADER_PRESENT", "QUERY_PRESENT", "BODY_PARAM_PRESENT", "HEAD_REQUEST"].includes(
      value.strategy
    )
  ) {
    return null;
  }
  if (value.paramName !== undefined && typeof value.paramName !== "string") return null;
  return value as unknown as FlowcordiaActivepiecesWebhookHandshakeConfiguration;
}

function webhookResponse(value: unknown): Response {
  if (!isRecord(value) || typeof value.status !== "number") {
    return Response.json({ code: "activepieces_webhook_invalid_handshake" }, { status: 502 });
  }
  const headers = new Headers();
  if (isRecord(value.headers)) {
    for (const [key, headerValue] of Object.entries(value.headers)) {
      if (typeof headerValue === "string") headers.set(key, headerValue);
    }
  }
  if (value.body === undefined) return new Response(null, { status: value.status, headers });
  if (typeof value.body === "string")
    return new Response(value.body, { status: value.status, headers });
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(value.body), { status: value.status, headers });
}

async function handle(request: Request, releasePublicId: string | undefined): Promise<Response> {
  if (!releasePublicId)
    return Response.json({ code: "activepieces_release_not_found" }, { status: 404 });
  const [binding, release] = await Promise.all([
    getStudioV2ActivepiecesProductionBindingByRelease(releasePublicId),
    getStudioV2ReleaseByPublicIdAcrossScopes(releasePublicId),
  ]);
  if (
    !binding ||
    (binding.status !== "PREPARING" && binding.status !== "ENABLED") ||
    !release ||
    release.status !== "DEPLOYED"
  ) {
    return Response.json({ code: "activepieces_production_binding_not_found" }, { status: 404 });
  }
  if (binding.triggerType !== "WEBHOOK") {
    return Response.json({ code: "activepieces_production_binding_not_webhook" }, { status: 409 });
  }

  const payload = await convertStudioV2ActivepiecesWebhookRequest(request, {
    environmentId: binding.runtimeEnvironmentId,
    workflowId: binding.workflowId,
    publicOrigin: new URL(request.url).origin,
  });
  const configuration = handshakeConfiguration(binding.handshakeConfiguration);
  if (
    isFlowcordiaActivepiecesHandshakeRequest({ payload, handshakeConfiguration: configuration })
  ) {
    const result = await executeStudioV2ActivepiecesInteraction({
      projectId: binding.projectId,
      environmentId: binding.runtimeEnvironmentId,
      actorId: binding.createdByUserId,
      pieceName: binding.pieceName,
      pieceVersion: binding.pieceVersion,
      payload: {
        kind: "trigger_handshake",
        interaction: {
          pieceName: binding.pieceName,
          triggerName: binding.triggerName,
          flowId: binding.workflowId,
          input: binding.input,
          ...(binding.webhookUrl ? { webhookUrl: binding.webhookUrl } : {}),
          payload,
        },
      },
    });
    return webhookResponse(result);
  }

  if (binding.status !== "ENABLED") {
    return Response.json(
      { code: "activepieces_production_binding_preparing" },
      { status: 503, headers: { "retry-after": "1" } }
    );
  }

  const runIds = await runStudioV2ActivepiecesProductionTrigger({
    release,
    binding,
    payload,
    triggerAction: "flowcordia_activepieces_webhook",
  });
  return Response.json({ accepted: true, runIds }, { status: 200 });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  return handle(request, params.releasePublicId);
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handle(request, params.releasePublicId);
}
