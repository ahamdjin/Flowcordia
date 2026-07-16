import { randomUUID } from "node:crypto";
import { json } from "@remix-run/node";
import {
  ProposalPersistenceError,
  type ControlPlaneError,
  type ProposalCommandValue,
} from "@flowcordia/control-plane";
import type { GitHubProposalPolicy } from "@flowcordia/github-proposals";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { z } from "zod";
import { createProposalCommandService } from "./service.server";
import {
  FlowcordiaProposalConfigurationError,
  resolveControlPlaneScope,
  resolveCreatorReviewerId,
} from "./scope.server";
import {
  presentFlowcordiaProposalCommandAcknowledgement,
  presentFlowcordiaProposalCommandError,
} from "./workspace/presentation";

const MAX_BODY_BYTES = 256 * 1024;

const CommandSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("create"),
    proposalId: z.string(),
    workflow: z.unknown(),
    expectedBaseCommitSha: z.string(),
    expectedBaseBlobSha: z.string().nullable(),
  }),
  z.object({
    operation: z.literal("submit"),
    proposalId: z.string(),
    expectedHeadSha: z.string(),
  }),
  z.object({
    operation: z.literal("promote"),
    proposalId: z.string(),
    expectedHeadSha: z.string(),
    mergeMethod: z.enum(["merge", "squash", "rebase"]),
  }),
]);

// Browsers cannot weaken this minimum policy per request.
const ENTERPRISE_PROPOSAL_POLICY: GitHubProposalPolicy = {
  minimumApprovals: 1,
  requireCurrentHeadApprovals: true,
  allowSelfApproval: false,
  blockChangesRequested: true,
};

export type FlowcordiaProposalCommandPresentation = "internal" | "workspace";

function correlationId(request: Request): string {
  const provided = request.headers.get("x-request-id");
  return provided && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/.test(provided)
    ? provided
    : `request:${randomUUID()}`;
}

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Response("Request body is too large", { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new Response("Request body is too large", { status: 413 });
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Response("Request body must be valid JSON", { status: 400 });
  }
}

function errorStatus(error: ControlPlaneError): number {
  switch (error.code) {
    case "invalid_input":
      return 400;
    case "not_found":
      return 404;
    case "conflict":
    case "concurrency_conflict":
      return 409;
    case "github_operation_failed":
      return error.github?.code === "rate_limited" ? 503 : 502;
    case "persistence_failed":
      return 503;
  }
}

function failureResponse(
  error: ControlPlaneError,
  presentation: FlowcordiaProposalCommandPresentation
): Response {
  return json(
    presentation === "workspace" ? presentFlowcordiaProposalCommandError(error) : { error },
    errorStatus(error)
  );
}

function successResponse(
  value: ProposalCommandValue,
  status: 200 | 201,
  presentation: FlowcordiaProposalCommandPresentation
): Response {
  if (presentation === "internal") return json(value, status);
  return json(presentFlowcordiaProposalCommandAcknowledgement(value.proposal), status);
}

function configurationError(
  error: unknown,
  presentation: FlowcordiaProposalCommandPresentation
): Response {
  if (error instanceof FlowcordiaProposalConfigurationError) {
    return json(
      {
        error: {
          code: "configuration_error",
          message: error.message,
          ...(presentation === "workspace" ? { retryable: false } : {}),
        },
      },
      409
    );
  }
  if (error instanceof ProposalPersistenceError) {
    return json(
      {
        error: {
          code: "service_unavailable",
          message: "Proposal service is unavailable.",
          ...(presentation === "workspace" ? { retryable: true } : {}),
        },
      },
      503
    );
  }
  throw error;
}

/**
 * Shared authenticated command implementation. The established internal route
 * keeps its full response contract; Studio receives an acknowledgement that
 * cannot serialize tenant, installation, persistence, or actor identifiers.
 */
export async function executeFlowcordiaProposalCommand(input: {
  project: { organizationId: string; projectId: string };
  request: Request;
  userId: string;
  presentation: FlowcordiaProposalCommandPresentation;
}): Promise<Response> {
  const parsed = CommandSchema.safeParse(await readJson(input.request));
  if (!parsed.success) {
    return json(
      {
        error: {
          code: "invalid_input",
          message: "Proposal command is invalid.",
          ...(input.presentation === "workspace" ? { retryable: false } : {}),
        },
      },
      400
    );
  }
  if (input.presentation === "workspace" && parsed.data.operation === "create") {
    return json(
      {
        error: {
          code: "invalid_input",
          message: "Studio only accepts submit and promote commands.",
          retryable: false,
        },
      },
      400
    );
  }

  try {
    const scope = await resolveControlPlaneScope(input.project);
    const service = await createProposalCommandService(scope);
    const mutation = { actorId: input.userId, correlationId: correlationId(input.request) };
    const result =
      parsed.data.operation === "create"
        ? await service.create({
            scope,
            proposalId: parsed.data.proposalId,
            creatorReviewerId: await resolveCreatorReviewerId(input.userId),
            workflow: parsed.data.workflow as WorkflowDefinition,
            expectedBaseCommitSha: parsed.data.expectedBaseCommitSha,
            expectedBaseBlobSha: parsed.data.expectedBaseBlobSha,
            ...mutation,
          })
        : parsed.data.operation === "submit"
          ? await service.submit({
              scope,
              proposalId: parsed.data.proposalId,
              expectedHeadSha: parsed.data.expectedHeadSha,
              ...mutation,
            })
          : await service.promote({
              scope,
              proposalId: parsed.data.proposalId,
              expectedHeadSha: parsed.data.expectedHeadSha,
              policy: ENTERPRISE_PROPOSAL_POLICY,
              mergeMethod: parsed.data.mergeMethod,
              ...mutation,
            });

    return result.success
      ? successResponse(
          result.value,
          parsed.data.operation === "create" ? 201 : 200,
          input.presentation
        )
      : failureResponse(result.error, input.presentation);
  } catch (error) {
    return configurationError(error, input.presentation);
  }
}
