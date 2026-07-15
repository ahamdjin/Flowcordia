import { json } from "@remix-run/node";
import { type MetaFunction, useLoaderData, useRevalidator } from "@remix-run/react";
import { GitBranchIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { z } from "zod";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Badge } from "~/components/primitives/Badge";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import {
  FlowcordiaProposalConfigurationError,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { WorkflowStudio } from "~/features/flowcordia/workflows/studio/WorkflowStudio";
import { queryWorkflowStudio } from "~/features/flowcordia/workflows/studio/query.server";
import { useEnvironment } from "~/hooks/useEnvironment";
import { useOrganization } from "~/hooks/useOrganizations";
import { useProject } from "~/hooks/useProject";
import { dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import {
  EnvironmentParamSchema,
  flowcordiaProposalWorkspacePath,
  v3EnvironmentPath,
} from "~/utils/pathBuilder";

export const meta: MetaFunction = () => [{ title: "Workflow Studio | Flowcordia" }];

const WorkflowStudioSearch = z.object({
  workflow: z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/).optional(),
});

export const loader = dashboardLoader(
  {
    params: EnvironmentParamSchema,
    searchParams: WorkflowStudioSearch,
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
      const workspace = await queryWorkflowStudio({
        context,
        selectedWorkflowId: searchParams.workflow,
      });
      return json({ ...workspace, canWrite, configurationError: null });
    } catch (error) {
      if (error instanceof FlowcordiaProposalConfigurationError) {
        return json({
          repository: null,
          sync: null,
          workflows: [],
          selectedWorkflowId: null,
          graph: null,
          loadError: null,
          stale: false,
          canWrite,
          configurationError: error.message,
        });
      }
      throw error;
    }
  }
);

export default function FlowcordiaWorkflowStudioRoute() {
  const data = useLoaderData<typeof loader>();
  const organization = useOrganization();
  const project = useProject();
  const environment = useEnvironment();
  const revalidator = useRevalidator();
  const basePath = `${v3EnvironmentPath(organization, project, environment)}/flowcordia/workflows`;
  const commandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-index`;

  return (
    <PageContainer>
      <NavBar>
        <PageTitle
          title="Flowcordia Studio"
          accessory="Repository-backed workflow discovery and exact-commit read-only canvas."
        />
        <PageAccessories>
          <Badge className="border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <GitBranchIcon className="size-3" />
            Repository workflows
          </Badge>
          <LinkButton
            variant="minimal/small"
            to={flowcordiaProposalWorkspacePath(organization, project, environment)}
          >
            Proposals
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
        {data.configurationError || !data.repository || !data.sync ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto grid size-12 place-items-center rounded-xl border border-grid-bright bg-background-bright">
                <ShieldCheckIcon className="size-5 text-indigo-400" />
              </div>
              <h2 className="mt-4 text-base font-medium text-text-bright">
                Workflow Studio is not connected
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-dimmed">
                {data.configurationError ??
                  "Connect a GitHub repository and configure its production branch before opening Studio."}
              </p>
            </div>
          </div>
        ) : (
          <WorkflowStudio
            workflows={data.workflows}
            selectedWorkflowId={data.selectedWorkflowId}
            graph={data.graph}
            sync={data.sync}
            repository={data.repository}
            stale={data.stale}
            loadError={data.loadError}
            basePath={basePath}
            commandPath={commandPath}
            canWrite={data.canWrite}
          />
        )}
      </PageBody>
    </PageContainer>
  );
}
