import { json } from "@remix-run/node";
import { ProposalPersistenceError, type ProposalState } from "@flowcordia/control-plane";
import { z } from "zod";
import { prisma } from "~/db.server";
import { executeFlowcordiaProposalCommand } from "~/features/flowcordia/proposals/commands.server";
import { flowcordiaProposalStore } from "~/features/flowcordia/proposals/prisma.server";
import {
  FlowcordiaProposalConfigurationError,
  resolveControlPlaneScope,
} from "~/features/flowcordia/proposals/scope.server";
import { dashboardAction, dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import { ProjectParamSchema } from "~/utils/pathBuilder";

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
    return executeFlowcordiaProposalCommand({
      project: requireProjectContext(context),
      request,
      userId: user.id,
      presentation: "internal",
    });
  }
);
