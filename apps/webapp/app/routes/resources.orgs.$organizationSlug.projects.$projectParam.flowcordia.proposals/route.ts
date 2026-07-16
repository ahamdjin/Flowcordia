import { randomUUID } from "node:crypto";
import { json } from "@remix-run/node";
import {
  ProposalPersistenceError,
  type ControlPlaneError,
  type ProposalState,
} from "@flowcordia/control-plane";
import type { GitHubProposalPolicy } from "@flowcordia/github-proposals";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { z } from "zod";
import { prisma } from "~/db.server";
import { flowcordiaProposalStore } from "~/features/flowcordia/proposals/prisma.server";
import { createProposalCommandService } from "~/features/flowcordia/proposals/service.server";
import {
  FlowcordiaProposalConfigurationError,
  resolveControlPlaneScope,
  resolveCreatorReviewerId,
} from "~/features/flowcordia/proposals/scope.server";
import { dashboardAction, dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import { ProjectParamSchema } from "~/utils/pathBuilder";

const MAX_BODY_BYTES = 256 * 1024;
const proposalStates = [
  "CREATING",
  "DRAFT",
  "READY",
  "PROMOTING",
  "MERGED",
  "CLOSED",
  "RECONCILING",
  "FAILED",
] as const;

const SearchParamsSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    state: z.enum(proposalStates).optional(),
    cursorUpdatedAt: z.string().datetime().optional(),
    cursorId: z.string().min(1).max(255).optional(),
  })
  .refine((value) => Boolean(value.cursorUpdatedAt) === Boolean(value.cursorId), {
    message: "Both cursorUpdatedAt and cursorId are required for pagination.",
  });

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

// This boundary owns the minimum policy. Browsers cannot weaken it per request.
const ENTERPRISE_PROPOSAL_POLICY: GitHubProposalPolicy = {
  minimumApprovals: 1,
  requireCurrentHeadApprovals: true,
  allowSelfApproval: false,
  blockChangesRequested: true,
};

async function resolveProjectContext(params: z.infer<typeof ProjectParamSchema>) {
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      OR: [{ slug: params.projectParam }, { externalRef: params.projectParam }],
      organization: { slug: params.organizationSlug, deletedAt: null },
    },
    select: { id: true, organizationId: true },
  });
  return project
    ? { organizationId: project.organizationId, projectId: project.id, projectFound: true as const }
    : { organizationId: undefined, projectId: undefined, projectFound: false as const };
}

function requireProjectContext(context: Awaited<ReturnType<typeof resolveProjectContext>>) {
  if (!context.projectFound || !context.organizationId || !context.projectId) {
    throw new Response("Project not found", { status: 404 });
  }
  return { organizationId: context.organizationId, projectId: context.projectId };
}

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

function configurationError(error: unknown): Response {
  if (error instanceof FlowcordiaProposalConfigurationError) {
    return json({ error: { code: "configuration_error", message: error.message } }, 409);
  }
  if (error instanceof ProposalPersistenceError) {
    return json(
      { error: { code: "service_unavailable", message: "Proposal service is unavailable." } },
      503
    );
  }
  throw error;
}

export const loader = dashboardLoader(
  {
    params: ProjectParamSchema,
    searchParams: SearchParamsSchema,
    context: resolveProjectContext,
    authorization: { action: "read", resource: { type: "github" } },
  },
  async ({ context, searchParams }) => {
    try {
      const scope = await resolveControlPlaneScope(requireProjectContext(context));
      const proposals = await flowcordiaProposalStore.listProposals({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        repositoryId: scope.repositoryId,
        states: searchParams.state ? [searchParams.state as ProposalState] : undefined,
        limit: searchParams.limit,
        cursor:
          searchParams.cursorUpdatedAt && searchParams.cursorId
            ? {
                updatedAt: new Date(searchParams.cursorUpdatedAt),
                storageId: searchParams.cursorId,
              }
            : undefined,
      });
      const last = proposals.at(-1);
      return json({
        proposals,
        nextCursor:
          proposals.length === searchParams.limit && last
            ? { updatedAt: last.updatedAt.toISOString(), storageId: last.storageId }
            : null,
      });
    } catch (error) {
      return configurationError(error);
    }
  }
);

export const action = dashboardAction(
  {
    params: ProjectParamSchema,
    context: resolveProjectContext,
    authorization: { action: "write", resource: { type: "github" } },
  },
  async ({ context, request, user }) => {
    const parsed = CommandSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return json(
        { error: { code: "invalid_input", message: "Proposal command is invalid." } },
        400
      );
    }
    try {
      const scope = await resolveControlPlaneScope(requireProjectContext(context));
      const service = await createProposalCommandService(scope);
      const mutation = { actorId: user.id, correlationId: correlationId(request) };
      const result =
        parsed.data.operation === "create"
          ? await service.create({
              scope,
              proposalId: parsed.data.proposalId,
              creatorReviewerId: await resolveCreatorReviewerId(user.id),
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
        ? json(result.value, parsed.data.operation === "create" ? 201 : 200)
        : json({ error: result.error }, errorStatus(result.error));
    } catch (error) {
      return configurationError(error);
    }
  }
);
