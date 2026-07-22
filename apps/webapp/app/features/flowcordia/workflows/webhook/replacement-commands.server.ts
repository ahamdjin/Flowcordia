import type { RbacAbility } from "@trigger.dev/rbac";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import {
  FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION,
  type FlowcordiaWebhookReplacementResponse,
} from "./replacement-command";
import {
  FlowcordiaWebhookReplacementError,
  replaceFlowcordiaProductionWebhook,
} from "./replacement.server";

const MAX_REQUEST_BYTES = 16 * 1024;

const WebhookReplacementCommand = z
  .object({
    operation: z.literal("replace_revoked_webhook"),
    confirmation: z.literal(FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION),
    workflowId: z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/),
    nodeId: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/),
    expectedRevokedPublicId: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  })
  .strict();

function failure(error: string, message: string, status: number, retryable = false): Response {
  return json<FlowcordiaWebhookReplacementResponse>(
    { ok: false, error, message, retryable },
    { status }
  );
}

async function parseCommand(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return {
      success: false as const,
      response: failure("request_too_large", "Request is too large.", 413),
    };
  }
  let value: unknown;
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_REQUEST_BYTES) {
      return {
        success: false as const,
        response: failure("request_too_large", "Request is too large.", 413),
      };
    }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return {
      success: false as const,
      response: failure("invalid_request", "Request must be valid JSON.", 400),
    };
  }
  const parsed = WebhookReplacementCommand.safeParse(value);
  return parsed.success
    ? { success: true as const, command: parsed.data }
    : {
        success: false as const,
        response: failure(
          "invalid_request",
          "Unsupported production webhook replacement command.",
          400
        ),
      };
}

export async function executeFlowcordiaWebhookReplacementCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
  ability: RbacAbility;
  actorId: string;
}): Promise<Response> {
  if (input.request.method.toUpperCase() !== "POST") {
    return failure("method_not_allowed", "Method not allowed.", 405);
  }
  const parsed = await parseCommand(input.request);
  if (!parsed.success) return parsed.response;

  const taskIdentifier = `flowcordia-${parsed.command.workflowId}`;
  if (!input.ability.can("trigger", { type: "tasks", id: taskIdentifier })) {
    return failure("permission_denied", "You cannot replace this production webhook.", 403);
  }

  try {
    const project = requireFlowcordiaProjectContext(input.context);
    const endpoint = await replaceFlowcordiaProductionWebhook({
      tenantId: project.organizationId,
      projectId: project.projectId,
      workflowId: parsed.command.workflowId,
      nodeId: parsed.command.nodeId,
      expectedRevokedPublicId: parsed.command.expectedRevokedPublicId,
      actorId: input.actorId,
    });
    return json<FlowcordiaWebhookReplacementResponse>({
      ok: true,
      status: endpoint.changed ? "created" : "unchanged",
      endpoint: {
        publicId: endpoint.endpointPublicId,
        nodeId: endpoint.nodeId,
        generation: endpoint.generation,
        replacesPublicId: endpoint.replacesPublicId,
        createdAt: endpoint.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof FlowcordiaWebhookReplacementError) {
      return failure(error.code, error.message, error.status, error.retryable);
    }
    return failure(
      "replacement_failed",
      "The replacement production webhook endpoint could not be created.",
      503,
      true
    );
  }
}
