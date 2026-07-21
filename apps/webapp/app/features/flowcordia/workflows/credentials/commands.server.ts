import { json } from "@remix-run/node";
import { flowcordiaCredentialEnvironmentName } from "@flowcordia/workflow";
import { prisma } from "~/db.server";
import {
  requireFlowcordiaProjectContext,
  type FlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { EnvironmentVariablesRepository } from "~/v3/environmentVariables/environmentVariablesRepository.server";
import { queryWorkflowStudio } from "../studio/query.server";
import {
  FLOWCORDIA_CREDENTIAL_REQUEST_MAX_BYTES,
  FlowcordiaCredentialWriteCommand,
  normalizeFlowcordiaCredentialHeaders,
  type FlowcordiaCredentialCommandResponse,
} from "./contract";

function failure(
  error: string,
  message: string,
  retryable = false,
  status = 400
): Response {
  return json<FlowcordiaCredentialCommandResponse>(
    { ok: false, error, message, retryable },
    { status }
  );
}

async function parseCommand(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > FLOWCORDIA_CREDENTIAL_REQUEST_MAX_BYTES) {
    return { success: false as const, response: failure("request_too_large", "Request is too large.") };
  }
  const source = await request.text();
  if (new TextEncoder().encode(source).length > FLOWCORDIA_CREDENTIAL_REQUEST_MAX_BYTES) {
    return { success: false as const, response: failure("request_too_large", "Request is too large.") };
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return { success: false as const, response: failure("invalid_json", "Request must be JSON.") };
  }
  const parsed = FlowcordiaCredentialWriteCommand.safeParse(value);
  if (!parsed.success) {
    return {
      success: false as const,
      response: failure("invalid_command", "Credential command is invalid."),
    };
  }
  return { success: true as const, command: parsed.data };
}

export async function resolveFlowcordiaCredentialEnvironment(input: {
  projectId: string;
  environmentSlug: string;
}) {
  return prisma.runtimeEnvironment.findFirst({
    where: { projectId: input.projectId, slug: input.environmentSlug },
    select: { id: true, slug: true, type: true },
  });
}

export async function executeFlowcordiaCredentialCommand(input: {
  context: FlowcordiaProjectContext;
  environmentSlug: string;
  request: Request;
  userId: string;
}): Promise<Response> {
  if (input.request.method.toUpperCase() !== "POST") {
    return failure("method_not_allowed", "Method not allowed.", false, 405);
  }
  const parsed = await parseCommand(input.request);
  if (!parsed.success) return parsed.response;

  const { projectId } = requireFlowcordiaProjectContext(input.context);
  const environment = await resolveFlowcordiaCredentialEnvironment({
    projectId,
    environmentSlug: input.environmentSlug,
  });
  if (!environment) {
    return failure("environment_not_found", "Environment was not found.", false, 404);
  }

  const workspace = await queryWorkflowStudio({
    context: input.context,
    selectedWorkflowId: parsed.command.workflowId,
  });
  if (!workspace.graph || workspace.selectedWorkflowId !== parsed.command.workflowId) {
    return failure("workflow_not_found", "Workflow is not available.", false, 404);
  }
  const node = workspace.graph.nodes.find((candidate) => candidate.id === parsed.command.nodeId);
  if (!node || node.operation !== "action.http" || node.ownership !== "visual") {
    return failure(
      "credential_scope_invalid",
      "Credentials can be stored only for a reviewed visual HTTP node."
    );
  }
  if (!node.credentialReferences.includes(parsed.command.reference)) {
    return failure(
      "credential_not_bound",
      "The credential reference is not bound to this exact workflow node."
    );
  }

  const normalized = normalizeFlowcordiaCredentialHeaders(parsed.command.headers);
  if (!normalized.success) {
    return failure("credential_invalid", normalized.message);
  }
  const environmentName = flowcordiaCredentialEnvironmentName(parsed.command.reference);
  const repository = new EnvironmentVariablesRepository();
  const result = await repository.create(projectId, {
    override: true,
    environmentIds: [environment.id],
    isSecret: true,
    variables: [{ key: environmentName, value: normalized.serialized }],
    lastUpdatedBy: { type: "user", userId: input.userId },
  });
  if (!result.success) {
    return failure(
      "credential_store_failed",
      "Credential could not be stored safely. Recheck environment access and try again.",
      true,
      500
    );
  }

  return json<FlowcordiaCredentialCommandResponse>({
    ok: true,
    status: "stored",
    reference: parsed.command.reference,
    environmentName,
  });
}
