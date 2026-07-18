import { Await, useLoaderData } from "@remix-run/react";
import { Code2Icon, GitPullRequestIcon, WorkflowIcon } from "lucide-react";
import { Suspense } from "react";
import { LinkButton } from "~/components/primitives/Buttons";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { NavBar, PageTitle } from "~/components/navigation/AppNavigation";
import { resolveFlowcordiaProjectContext } from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { unavailableWorkflowFunctionCatalog } from "~/features/flowcordia/workflows/functions/presentation";
import { unavailableFlowcordiaPreview } from "~/features/flowcordia/workflows/preview/presentation";
import { presentWorkflowIndexSync } from "~/features/flowcordia/workflows/studio/presentation";
import { queryWorkflowStudio } from "~/features/flowcordia/workflows/studio/query.server";
import { WorkflowSourceWorkspace } from "~/features/flowcordia/workflows/studio/WorkflowSourceWorkspace";
import { dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import { ProjectParamSchema } from "~/utils/pathBuilder";

export const loader = dashboardLoader(
  {
    params: ProjectParamSchema,
    context: resolveFlowcordiaProjectContext,
    authorization: { action: "read", resource: { type: "github" } },
  },
  async ({ context, params, request, user }) => {
    const enabled = await canAccessFlowcordiaStudio({
      userId: user.id,
      isAdmin: user.admin,
      isImpersonating: user.isImpersonating,
      organizationSlug: params.organizationSlug,
    });
    if (!enabled) throw new Response("Not found", { status: 404 });
    const url = new URL(request.url);
    const selectedWorkflowId = url.searchParams.get("workflow") ?? undefined;
    const canWrite = context.permission === "write";
    const commandPath = `/resources/orgs/${params.organizationSlug}/projects/${params.projectParam}/flowcordia/workflow-drafts`;
    const workflowsPath = `../workflows${selectedWorkflowId ? `?workflow=${encodeURIComponent(selectedWorkflowId)}` : ""}`;

    try {
      const workspace = await queryWorkflowStudio({ context, selectedWorkflowId });
      return {
        workspace,
        commandPath,
        workflowsPath,
        proposalPath: "../proposals",
        canWrite,
        configurationError: null,
      };
    } catch {
      return {
        workspace: {
          repository: { owner: "Unavailable", name: "Repository", branch: "unknown" },
          sync: presentWorkflowIndexSync(null),
          workflows: [],
          selectedWorkflowId: selectedWorkflowId ?? null,
          graph: null,
          draft: null,
          diff: null,
          sourceBuffers: [],
          preview: unavailableFlowcordiaPreview(),
          functionCatalog: unavailableWorkflowFunctionCatalog(),
          loadError: null,
          stale: false,
        },
        commandPath,
        workflowsPath,
        proposalPath: "../proposals",
        canWrite,
        configurationError:
          "Flowcordia source editing is unavailable until the project GitHub connection is configured.",
      };
    }
  }
);

export default function FlowcordiaSourceRoute() {
  const { workspace, commandPath, workflowsPath, proposalPath, canWrite, configurationError } =
    useLoaderData<typeof loader>();

  return (
    <PageContainer>
      <NavBar>
        <PageTitle title="Flowcordia Source" />
        <div className="flex items-center gap-2">
          <LinkButton variant="minimal/small" to={workflowsPath}>
            <WorkflowIcon className="mr-1.5 size-4" />
            Workflow Studio
          </LinkButton>
          <LinkButton variant="minimal/small" to={proposalPath}>
            <GitPullRequestIcon className="mr-1.5 size-4" />
            Proposals
          </LinkButton>
        </div>
      </NavBar>
      <PageBody scrollable={false} className="p-4">
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
          <div className="font-mono text-xxs text-text-dimmed">
            {workspace.repository.owner}/{workspace.repository.name}@{workspace.repository.branch}
          </div>
        </div>

        {configurationError ? (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
            {configurationError}
          </div>
        ) : (
          <Suspense fallback={<div className="text-sm text-text-dimmed">Loading source workspace…</div>}>
            <Await resolve={workspace}>
              {(resolved) => (
                <WorkflowSourceWorkspace
                  workflowId={resolved.selectedWorkflowId}
                  graph={resolved.graph}
                  draft={resolved.draft}
                  diff={resolved.diff}
                  sourceBuffers={resolved.sourceBuffers}
                  commandPath={commandPath}
                  workflowsPath={workflowsPath}
                  proposalPath={proposalPath}
                  canWrite={canWrite}
                  stale={resolved.stale}
                  loadError={resolved.loadError}
                />
              )}
            </Await>
          </Suspense>
        )}
      </PageBody>
    </PageContainer>
  );
}
