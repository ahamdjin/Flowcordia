import { json } from "@remix-run/node";
import { type MetaFunction, useLoaderData, useRevalidator } from "@remix-run/react";
import { Code2Icon, GitBranchIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Badge } from "~/components/primitives/Badge";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import { env } from "~/env.server";
import {
  FlowcordiaProposalConfigurationError,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { WorkflowProductionProofPanel } from "~/features/flowcordia/workflows/production/WorkflowProductionProofPanel";
import { RepositoryReadinessPanel } from "~/features/flowcordia/workflows/readiness/RepositoryReadinessPanel";
import type { FlowcordiaRepositoryReadinessProjection } from "~/features/flowcordia/workflows/readiness/presentation";
import { WorkflowRollbackPanel } from "~/features/flowcordia/workflows/rollback/WorkflowRollbackPanel";
import { WorkflowStudio } from "~/features/flowcordia/workflows/studio/WorkflowStudio";
import { WorkflowStudioTestingPanel } from "~/features/flowcordia/workflows/studio/WorkflowStudioTestingPanel";
import {
  buildWorkflowLifecycleSteps,
  findDefaultLifecycleStep,
  type FlowcordiaLifecycleStepId,
  WorkflowLifecycleRail,
} from "~/features/flowcordia/workflows/studio/WorkflowLifecycleRail";
import { queryWorkflowStudio } from "~/features/flowcordia/workflows/studio/query.server";
import { WorkflowFunctionValidationPanel } from "~/features/flowcordia/workflows/validation/WorkflowFunctionValidationPanel";
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
  workflow: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{2,127}$/)
    .optional(),
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
      const canTriggerPreview = workspace.selectedWorkflowId
        ? ability.can("trigger", {
            type: "tasks",
            id: `flowcordia-${workspace.selectedWorkflowId}`,
          })
        : false;
      const canTriggerValidation = workspace.selectedWorkflowId
        ? ability.can("trigger", {
            type: "tasks",
            id: `flowcordia-validate-${workspace.selectedWorkflowId}`,
          })
        : false;
      const canTriggerProduction = workspace.selectedWorkflowId
        ? ability.can("trigger", {
            type: "tasks",
            id: `flowcordia-${workspace.selectedWorkflowId}`,
          })
        : false;
      return json({
        ...workspace,
        canWrite,
        canTriggerPreview,
        canTriggerValidation,
        canTriggerProduction,
        applicationCommitSha: env.FLOWCORDIA_APPLICATION_COMMIT_SHA ?? null,
        configurationError: null,
      });
    } catch (error) {
      if (error instanceof FlowcordiaProposalConfigurationError) {
        return json({
          repository: null,
          sync: null,
          workflows: [],
          selectedWorkflowId: null,
          graph: null,
          draft: null,
          diff: null,
          sourceBuffers: [],
          preview: null,
          production: null,
          rollback: null,
          validation: null,
          functionCatalog: null,
          loadError: null,
          stale: false,
          canWrite,
          canTriggerPreview: false,
          canTriggerValidation: false,
          canTriggerProduction: false,
          applicationCommitSha: env.FLOWCORDIA_APPLICATION_COMMIT_SHA ?? null,
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
  const environmentPath = v3EnvironmentPath(organization, project, environment);
  const basePath = `${environmentPath}/flowcordia/workflows`;
  const sourcePath = `${environmentPath}/flowcordia/source${
    data.selectedWorkflowId ? `?workflow=${encodeURIComponent(data.selectedWorkflowId)}` : ""
  }`;
  const commandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-index`;
  const draftCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-drafts`;
  const previewCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-preview`;
  const productionCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-production`;
  const rollbackCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/workflow-rollback`;
  const validationCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/function-validation`;
  const readinessCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/repository-readiness`;
  const bootstrapCommandPath = `/resources/orgs/${organization.slug}/projects/${project.slug}/flowcordia/repository-bootstrap`;
  const repositoryIdentity = data.repository
    ? `${data.repository.owner}/${data.repository.name}:${data.repository.branch}:${data.sync?.observedCommitSha ?? ""}`
    : "unconfigured";
  const [readinessState, setReadinessState] = useState<
    FlowcordiaRepositoryReadinessProjection["state"] | "NOT_CHECKED"
  >("NOT_CHECKED");
  const lifecycleSteps = data.sync
    ? buildWorkflowLifecycleSteps({
        syncState: data.sync.state,
        loadErrorCode: data.loadError?.code ?? null,
        readinessState,
        workflowSelected: Boolean(data.graph && data.selectedWorkflowId),
        draftPresent: Boolean(data.draft),
        draftStale: Boolean(data.draft?.stale),
        proposalState: data.production?.proposal
          ? "MERGED"
          : data.preview?.proposal
            ? "OPEN"
            : "NONE",
        previewState: data.preview?.state ?? "NOT_REQUESTED",
        productionState: data.production?.state ?? "NOT_PROMOTED",
      })
    : [];
  const [selectedLifecycleStep, setSelectedLifecycleStep] = useState<FlowcordiaLifecycleStepId>(
    () => findDefaultLifecycleStep(lifecycleSteps)
  );
  const selectedStep =
    lifecycleSteps.find((step) => step.id === selectedLifecycleStep) ?? lifecycleSteps[0];

  useEffect(() => {
    setReadinessState("NOT_CHECKED");
  }, [repositoryIdentity]);

  return (
    <PageContainer>
      <NavBar>
        <PageTitle
          title="Flowcordia Studio"
          accessory="Repository-backed workflows with durable visual drafts before Git review."
        />
        <PageAccessories>
          <Badge className="border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <GitBranchIcon className="size-3" />
            Repository workflows
          </Badge>
          <LinkButton variant="minimal/small" to={sourcePath} LeadingIcon={Code2Icon}>
            Source
          </LinkButton>
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
          <div
            data-testid="flowcordia-studio-route"
            data-connected="false"
            data-application-commit={data.applicationCommitSha ?? ""}
            className="flex h-full items-center justify-center p-8 text-center"
          >
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
          <div
            data-testid="flowcordia-studio-route"
            data-connected="true"
            data-application-commit={data.applicationCommitSha ?? ""}
            className="flex h-full min-h-0 flex-col"
          >
            <WorkflowLifecycleRail
              steps={lifecycleSteps}
              selectedStepId={selectedLifecycleStep}
              onSelectStep={setSelectedLifecycleStep}
            />
            <div
              data-testid="flowcordia-lifecycle-workspace"
              className="flex min-h-0 flex-1 flex-col 2xl:flex-row"
            >
              <main className="min-h-0 min-w-0 flex-1" aria-label="Workflow canvas">
                <WorkflowStudio
                  workflows={data.workflows}
                  selectedWorkflowId={data.selectedWorkflowId}
                  graph={data.graph}
                  draft={data.draft}
                  diff={data.diff}
                  preview={data.preview}
                  functionCatalog={data.functionCatalog}
                  sync={data.sync}
                  repository={data.repository}
                  stale={data.stale}
                  loadError={data.loadError}
                  basePath={basePath}
                  proposalPath={flowcordiaProposalWorkspacePath(organization, project, environment)}
                  bootstrapCommandPath={bootstrapCommandPath}
                  commandPath={commandPath}
                  draftCommandPath={draftCommandPath}
                  canWrite={data.canWrite}
                />
              </main>
              <aside
                aria-label="Workflow operations"
                data-testid="flowcordia-operations-workspace"
                data-selected-step={selectedLifecycleStep}
                className="max-h-[42vh] min-h-0 shrink-0 overflow-y-auto border-t border-grid-bright bg-background-dimmed 2xl:max-h-none 2xl:w-[30rem] 2xl:border-l 2xl:border-t-0"
              >
                <header className="sticky top-0 z-20 border-b border-grid-bright bg-background-dimmed/95 px-4 py-3 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                        Workflow operations
                      </div>
                      <h2 className="mt-0.5 text-sm font-medium text-text-bright">
                        {selectedStep?.label ?? "Repository"}
                      </h2>
                    </div>
                    {selectedStep && (
                      <Badge className="border border-grid-bright bg-background-bright text-text-dimmed">
                        {selectedStep.detail}
                      </Badge>
                    )}
                  </div>
                </header>

                <div hidden={selectedLifecycleStep !== "repository"}>
                  <RepositoryReadinessPanel
                    key={repositoryIdentity}
                    commandPath={readinessCommandPath}
                    onReadinessChange={setReadinessState}
                  />
                </div>

                <div
                  hidden={selectedLifecycleStep !== "build" && selectedLifecycleStep !== "preview"}
                >
                  <WorkflowStudioTestingPanel
                    graph={data.graph}
                    draft={data.draft}
                    preview={data.preview}
                    functionCatalog={data.functionCatalog}
                    repositoryKey={`${data.repository.owner}/${data.repository.name}:${data.repository.branch}`}
                    draftCommandPath={draftCommandPath}
                    previewCommandPath={previewCommandPath}
                    canWrite={data.canWrite}
                    canTriggerPreview={data.canTriggerPreview}
                    compact
                    stale={data.stale}
                    loadError={data.loadError}
                  />
                </div>

                <div hidden={selectedLifecycleStep !== "review"}>
                  <section
                    data-testid="flowcordia-review-operations"
                    data-state={
                      data.production?.proposal
                        ? "MERGED"
                        : data.preview?.proposal
                          ? "OPEN"
                          : "NONE"
                    }
                    className="border-b border-grid-bright bg-background-bright px-4 py-4"
                  >
                    <h3 className="text-sm font-medium text-text-bright">Governed Git review</h3>
                    <p className="mt-1 text-xs leading-5 text-text-dimmed">
                      {data.production?.proposal
                        ? "The exact proposal head is merged. Production still requires its matching deployment and execution proof."
                        : data.preview?.proposal
                          ? "Review the generated code, required checks, and exact proposal head before promotion."
                          : "Publish a Studio draft to create a governed proposal before review can begin."}
                    </p>
                    <LinkButton
                      className="mt-3"
                      variant="secondary/small"
                      to={flowcordiaProposalWorkspacePath(organization, project, environment)}
                    >
                      Open proposals
                    </LinkButton>
                  </section>
                  {data.graph && data.selectedWorkflowId && data.validation && (
                    <WorkflowFunctionValidationPanel
                      workflowId={data.selectedWorkflowId}
                      validation={data.validation}
                      commandPath={validationCommandPath}
                      canTrigger={data.canTriggerValidation}
                    />
                  )}
                </div>

                <div hidden={selectedLifecycleStep !== "production"}>
                  {data.graph && data.selectedWorkflowId && data.production && (
                    <WorkflowProductionProofPanel
                      workflowId={data.selectedWorkflowId}
                      production={data.production}
                      commandPath={productionCommandPath}
                      canTrigger={data.canTriggerProduction}
                    />
                  )}
                  {data.graph && data.selectedWorkflowId && data.rollback && (
                    <WorkflowRollbackPanel
                      key={data.selectedWorkflowId}
                      workflowId={data.selectedWorkflowId}
                      rollback={data.rollback}
                      commandPath={rollbackCommandPath}
                      proposalPath={flowcordiaProposalWorkspacePath(
                        organization,
                        project,
                        environment
                      )}
                      canWrite={data.canWrite}
                    />
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </PageBody>
    </PageContainer>
  );
}
