import { json } from "@remix-run/node";
import { type MetaFunction, useLoaderData, useRevalidator } from "@remix-run/react";
import { RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { z } from "zod";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Badge } from "~/components/primitives/Badge";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import {
  FlowcordiaProposalConfigurationError,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import {
  ProposalWorkspace,
  ProposalWorkspaceUnavailable,
} from "~/features/flowcordia/proposals/workspace/ProposalWorkspace";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { flowcordiaProposalStateFilters } from "~/features/flowcordia/proposals/workspace/presentation";
import { queryFlowcordiaProposalWorkspace } from "~/features/flowcordia/proposals/workspace/query.server";
import { useEnvironment } from "~/hooks/useEnvironment";
import { useOrganization } from "~/hooks/useOrganizations";
import { useProject } from "~/hooks/useProject";
import { dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import {
  EnvironmentParamSchema,
  flowcordiaProposalCommandsPath,
  flowcordiaProposalWorkspacePath,
  v3EnvironmentPath,
} from "~/utils/pathBuilder";

export const meta: MetaFunction = () => [{ title: "Flowcordia Studio | Trigger.dev" }];

const WorkspaceSearchParams = z
  .object({
    state: z.enum(flowcordiaProposalStateFilters).optional(),
    proposal: z.string().min(1).max(255).optional(),
    cursorUpdatedAt: z.string().datetime().optional(),
    cursorProposalId: z.string().min(1).max(255).optional(),
  })
  .refine((value) => Boolean(value.cursorUpdatedAt) === Boolean(value.cursorProposalId), {
    message: "Both cursor values are required.",
  });

export const loader = dashboardLoader(
  {
    params: EnvironmentParamSchema,
    searchParams: WorkspaceSearchParams,
    context: resolveFlowcordiaProjectContext,
    authorization: { action: "read", resource: { type: "github" } },
  },
  async ({ params, searchParams, context, user, ability }) => {
    const enabled = await canAccessFlowcordiaStudio({
      userId: user.id,
      isAdmin: user.admin,
      isImpersonating: user.isImpersonating,
      organizationSlug: params.organizationSlug,
    });
    if (!enabled) throw new Response("Not found", { status: 404 });

    const canWrite = ability.can("write", { type: "github" });
    try {
      const workspace = await queryFlowcordiaProposalWorkspace({
        context,
        state: searchParams.state,
        cursor:
          searchParams.cursorUpdatedAt && searchParams.cursorProposalId
            ? {
                updatedAt: new Date(searchParams.cursorUpdatedAt),
                proposalId: searchParams.cursorProposalId,
              }
            : undefined,
      });
      return json({
        ...workspace,
        selectedProposalId: searchParams.proposal,
        canWrite,
        configurationError: null,
      });
    } catch (error) {
      if (error instanceof FlowcordiaProposalConfigurationError) {
        return json({
          proposals: [],
          repository: null,
          nextCursor: null,
          selectedProposalId: searchParams.proposal,
          canWrite,
          configurationError: error.message,
        });
      }
      throw error;
    }
  }
);

export default function FlowcordiaProposalWorkspaceRoute() {
  const data = useLoaderData<typeof loader>();
  const organization = useOrganization();
  const project = useProject();
  const environment = useEnvironment();
  const revalidator = useRevalidator();
  const basePath = flowcordiaProposalWorkspacePath(organization, project, environment);
  const workflowStudioPath = `${v3EnvironmentPath(
    organization,
    project,
    environment
  )}/flowcordia/workflows`;

  return (
    <PageContainer>
      <NavBar>
        <PageTitle
          title="Flowcordia Studio"
          accessory="Git-governed workflow proposals. Runtime execution remains owned by Trigger.dev."
        />
        <PageAccessories>
          <Badge className="border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <ShieldCheckIcon className="size-3" />
            Proposal workspace
          </Badge>
          <LinkButton variant="minimal/small" to={workflowStudioPath}>
            Workflows
          </LinkButton>
          <Button
            variant="minimal/small"
            LeadingIcon={RefreshCwIcon}
            isLoading={revalidator.state !== "idle"}
            onClick={() => revalidator.revalidate()}
          >
            Refresh
          </Button>
        </PageAccessories>
      </NavBar>
      <PageBody scrollable={false} className="bg-background-dimmed">
        {data.configurationError || !data.repository ? (
          <ProposalWorkspaceUnavailable
            message={
              data.configurationError ??
              "Connect a GitHub repository and configure its production branch before opening Studio."
            }
          />
        ) : (
          <ProposalWorkspace
            proposals={data.proposals}
            selectedProposalId={data.selectedProposalId}
            repository={data.repository}
            nextCursor={data.nextCursor}
            basePath={basePath}
            commandPath={flowcordiaProposalCommandsPath(organization, project)}
            canWrite={data.canWrite}
          />
        )}
      </PageBody>
    </PageContainer>
  );
}
