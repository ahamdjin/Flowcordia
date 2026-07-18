import { json } from "@remix-run/node";
import { type MetaFunction, useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Code2Icon,
  GitPullRequestIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from "lucide-react";
import { z } from "zod";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import {
  FlowcordiaProposalConfigurationError,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { queryWorkflowStudio } from "~/features/flowcordia/workflows/studio/query.server";
import { WorkflowSourceWorkspace } from "~/features/flowcordia/workflows/studio/WorkflowSourceWorkspace";
import { useEnvironment } from "~/hooks/useEnvironment";
import { useOrganization } from "~/hooks/useOrganizations";
import { useProject } from "~/hooks/useProject";
import { dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import {
  EnvironmentParamSchema,
  flowcordiaProposalWorkspacePath,
  v3EnvironmentPath,
} from "~/utils/pathBuilder";

export const meta: MetaFunction = () => [{ title: "Source | Flowcordia" }];

const SourceSearch = z.object({
  workflow: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{2,127}$/)
    .optional(),
  node: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{1,127}$/)
    .optional(),
});

export const loader = dashboardLoader(
  {
    params: EnvironmentParamSchema,
    searchParams: SourceSearch,
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
          selectedWorkflowId: searchParams.workflow ?? null,
          graph: null,
          draft: null,
          diff: null,
          sourceBuffers: [],
          preview: null,
          functionCatalog: null,
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

export default function FlowcordiaSourceRoute() {
  const data = useLoaderData<typeof loader>();
  const organization = useOrganization();
  const project = useProject();
  const environment = useEnvironment();
  const revalidator = useRevalidator();
  const environmentPath = v3EnvironmentPath(organization, project, environment);
  const workflowsPath = `${environmentPath}/flowcordia/workflows${
    data.selectedWorkflowId ? `?workflow=${encodeURIComponent(data.selectedWorkflowId)}` : ""
  }`;
  const proposalPath = flowcordiaProposalWorkspacePath(organization, project, environment);
  const commandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-drafts`;

  return (
    <PageContainer>
      <NavBar>
        <PageTitle
          title="Flowcordia Source"
          accessory="Durable repository-owned function edits on the same governed workflow proposal."
        />
        <PageAccessories>
          <LinkButton variant="minimal/small" to={workflowsPath} LeadingIcon={WorkflowIcon}>
            Workflow Studio
          </LinkButton>
          <LinkButton variant="minimal/small" to={proposalPath} LeadingIcon={GitPullRequestIcon}>
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
      <PageBody scrollable={false} className="bg-background-dimmed p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-base font-medium text-text-bright">
              <Code2Icon className="size-5 text-violet-300" />
              Governed typed-function source
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-text-dimmed">
              Edit only repository-owned functions already referenced by this workflow. Every saved
              buffer stays bound to its exact Git commit and blob until one combined pull request is
              reviewed and deployed.
            </p>
          </div>
          {data.repository && (
            <div className="font-mono text-xxs text-text-dimmed">
              {data.repository.owner}/{data.repository.name}@{data.repository.branch}
            </div>
          )}
        </div>

        {data.configurationError || !data.repository || !data.sync ? (
          <div className="flex h-[680px] items-center justify-center rounded-lg border border-grid-bright bg-background-bright p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto grid size-12 place-items-center rounded-xl border border-grid-bright bg-background-dimmed">
                <ShieldCheckIcon className="size-5 text-indigo-400" />
              </div>
              <h2 className="mt-4 text-base font-medium text-text-bright">
                Source editing is not connected
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-dimmed">
                {data.configurationError ??
                  "Connect a GitHub repository and configure its production branch before editing repository source."}
              </p>
            </div>
          </div>
        ) : (
          <WorkflowSourceWorkspace
            workflowId={data.selectedWorkflowId}
            graph={data.graph}
            draft={data.draft}
            diff={data.diff}
            sourceBuffers={data.sourceBuffers}
            commandPath={commandPath}
            workflowsPath={workflowsPath}
            proposalPath={proposalPath}
            canWrite={data.canWrite}
            stale={data.stale}
            loadError={data.loadError}
          />
        )}
      </PageBody>
    </PageContainer>
  );
}
