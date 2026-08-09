import { useFetcher, useRevalidator } from "@remix-run/react";
import {
  AlertTriangleIcon,
  Code2Icon,
  GitBranchIcon,
  HardDriveIcon,
  PlugIcon,
  RefreshCwIcon,
  WorkflowIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { LinkButton, Button } from "~/components/primitives/Buttons";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import { Paragraph } from "~/components/primitives/Paragraph";
import type { StudioV2WorkflowCatalogItem } from "./workflow-catalog.server";
import type { StudioV2WorkspaceActionData } from "./workspace-http";

function workflowHref(workflow: StudioV2WorkflowCatalogItem, view: "editor" | "source"): string {
  const search = new URLSearchParams({
    workflow: workflow.workflowId,
    _studioWorkspace: workflow.workspaceKey,
  });
  if (view === "source") search.set("view", "source");
  return `?${search.toString()}`;
}

export function StudioV2WorkflowLibrary({
  workflows,
  catalogError,
  canWrite,
}: {
  workflows: StudioV2WorkflowCatalogItem[];
  catalogError: string | null;
  canWrite: boolean;
}) {
  const revalidator = useRevalidator();
  const syncFetcher = useFetcher<StudioV2WorkspaceActionData>();
  const synchronizedCommit = useRef<string | null>(null);
  const syncResult = syncFetcher.data;
  const syncMessage =
    syncResult && !syncResult.ok
      ? syncResult.message
      : syncResult?.ok && syncResult.intent === "repository_sync"
        ? `${syncResult.validCount} workflow${syncResult.validCount === 1 ? "" : "s"} synchronized.`
        : null;

  useEffect(() => {
    if (!syncResult?.ok || syncResult.intent !== "repository_sync") return;
    if (synchronizedCommit.current === syncResult.commitSha) return;
    synchronizedCommit.current = syncResult.commitSha;
    revalidator.revalidate();
  }, [revalidator, syncResult]);

  return (
    <PageContainer>
      <NavBar>
        <PageTitle
          title="Studio"
          accessory="Choose a workflow, then open its visual or source editor."
        />
        <PageAccessories>
          <LinkButton variant="minimal/small" to="/setup/github" LeadingIcon={PlugIcon}>
            GitHub
          </LinkButton>
          <Button
            type="button"
            variant="minimal/small"
            LeadingIcon={RefreshCwIcon}
            disabled={!canWrite}
            isLoading={syncFetcher.state !== "idle"}
            onClick={() =>
              syncFetcher.submit(
                { intent: "repository_sync" },
                { method: "post", encType: "application/json" }
              )
            }
          >
            Sync
          </Button>
        </PageAccessories>
      </NavBar>

      <PageBody scrollable className="bg-background-dimmed">
        <main className="mx-auto flex min-h-full w-full max-w-[92rem] flex-col px-6 py-10 lg:px-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-lg font-medium text-text-bright">Workflows</h1>
              <Paragraph variant="small/dimmed" className="mt-1">
                {workflows.length} workflow{workflows.length === 1 ? "" : "s"}
              </Paragraph>
              {syncMessage ? (
                <Paragraph
                  variant="extra-small/dimmed"
                  className={syncResult && !syncResult.ok ? "mt-1 text-rose-500" : "mt-1"}
                >
                  {syncMessage}
                </Paragraph>
              ) : null}
            </div>
          </div>

          {workflows.length > 0 ? (
            <div className="scrollbar-thin min-w-0 overflow-x-auto overflow-y-hidden pb-4">
              <div className="flex w-max flex-nowrap gap-3">
                {workflows.map((workflow) => {
                  const repositoryBacked = Boolean(workflow.sourceCommitSha);
                  return (
                    <article
                      key={workflow.workspaceKey}
                      className="flex h-48 w-80 shrink-0 flex-col border border-grid-bright bg-background-bright p-4"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="grid size-9 shrink-0 place-items-center border border-grid-bright bg-background-dimmed">
                          <WorkflowIcon className="size-4 text-indigo-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2
                            className="truncate text-sm font-medium text-text-bright"
                            title={workflow.name}
                          >
                            {workflow.name}
                          </h2>
                          <div className="mt-1 flex items-center gap-1.5 text-xxs text-text-dimmed">
                            {repositoryBacked ? (
                              <GitBranchIcon className="size-3.5" />
                            ) : (
                              <HardDriveIcon className="size-3.5" />
                            )}
                            <span>{repositoryBacked ? "Repository" : "Local workspace"}</span>
                          </div>
                        </div>
                        <span
                          className={`mt-1 size-2 shrink-0 rounded-full ${
                            workflow.status === "VALID" ? "bg-green-500" : "bg-rose-500"
                          }`}
                          aria-label={
                            workflow.status === "VALID" ? "Valid workflow" : "Workflow has issues"
                          }
                        />
                      </div>

                      <Paragraph variant="extra-small/dimmed" className="mt-4 line-clamp-2 min-h-8">
                        {workflow.description || workflow.workflowId}
                      </Paragraph>

                      <div className="mt-auto flex items-center justify-between border-t border-grid-dimmed pt-3">
                        <span className="text-xxs text-text-dimmed">
                          {workflow.nodeCount ?? 0} node{workflow.nodeCount === 1 ? "" : "s"}
                        </span>
                        <div className="flex items-center gap-2">
                          <LinkButton
                            variant="minimal/small"
                            to={workflowHref(workflow, "source")}
                            LeadingIcon={Code2Icon}
                          >
                            Source
                          </LinkButton>
                          <LinkButton variant="primary/small" to={workflowHref(workflow, "editor")}>
                            Editor
                          </LinkButton>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex min-h-72 max-w-2xl items-center border border-grid-bright bg-background-bright px-8 py-10">
              <div className="flex items-start gap-4">
                {catalogError ? (
                  <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-400" />
                ) : (
                  <WorkflowIcon className="mt-0.5 size-5 shrink-0 text-text-dimmed" />
                )}
                <div>
                  <h2 className="text-sm font-medium text-text-bright">No workflows yet</h2>
                  <Paragraph variant="small/dimmed" className="mt-2 max-w-lg">
                    {catalogError ??
                      "Connect and synchronize a repository, or create a local Studio workflow."}
                  </Paragraph>
                </div>
              </div>
            </div>
          )}
        </main>
      </PageBody>
    </PageContainer>
  );
}
