import type { RbacAbility } from "@trigger.dev/rbac";
import { json } from "@remix-run/node";
import { z } from "zod";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import {
  FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION,
  type FlowcordiaWebhookActivationResponse,
} from "./activation-command";
import {
  activateFlowcordiaProductionWebhook,
  FlowcordiaWebhookActivationError,
} from "./activation.server";

const MAX_REQUEST_BYTES = 16 * 1024;

const WebhookActivationCommand = z
  .object({
    operation: z.literal("activate_webhook"),
    confirmation: z.literal(FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION),
    workflowId: z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/),
    nodeId: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/),
    expectedProposalId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
    expectedMergeCommitSha: z.string().regex(/^[0-9a-f]{40}$/),
  })
  .strict();

function failure(error: string, message: string, status: number, retryable = false): Response {
  return json<FlowcordiaWebhookActivationResponse>(
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
  const parsed = WebhookActivationCommand.safeParse(value);
  return parsed.success
    ? { success: true as const, command: parsed.data }
    : {
        success: false as const,
        response: failure(
          "invalid_request",
          "Unsupported production webhook activation command.",
          400
        ),
      };
}

export async function executeFlowcordiaWebhookActivationCommand(input: {
  context: FlowcordiaProjectContext;
  request: Request;
  ability: RbacAbility;
}): Promise<Response> {
  if (input.request.method.toUpperCase() !== "POST") {
    return failure("method_not_allowed", "Method not allowed.", 405);
  }
  const parsed = await parseCommand(input.request);
  if (!parsed.success) return parsed.response;

  const taskIdentifier = `flowcordia-${parsed.command.workflowId}`;
  if (!input.ability.can("trigger", { type: "tasks", id: taskIdentifier })) {
    return failure("permission_denied", "You cannot activate this production workflow.", 403);
  }

  try {
    const project = requireFlowcordiaProjectContext(input.context);
    const scope = await resolveWorkflowIndexScope(project);
    const endpoint = await activateFlowcordiaProductionWebhook({
      scope,
      workflowId: parsed.command.workflowId,
      nodeId: parsed.command.nodeId,
      expectedProposalId: parsed.command.expectedProposalId,
      expectedMergeCommitSha: parsed.command.expectedMergeCommitSha,
    });
    return json<FlowcordiaWebhookActivationResponse>({
      ok: true,
      status: endpoint.changed ? "activated" : "unchanged",
      endpoint: {
        publicId: endpoint.endpointPublicId,
        revision: endpoint.revision,
        fingerprint: endpoint.fingerprint,
        nodeId: endpoint.nodeId,
        method: endpoint.method,
        path: endpoint.path,
        taskIdentifier: endpoint.taskIdentifier,
        workerVersion: endpoint.workerVersion,
        mergeCommitSha: endpoint.mergeCommitSha,
      },
    });
  } catch (error) {
    if (error instanceof FlowcordiaWebhookActivationError) {
      return failure(error.code, error.message, error.status, error.retryable);
    }
    return failure(
      "activation_failed",
      "The immutable production webhook binding could not be activated.",
      503,
      true
    );
  }
}
