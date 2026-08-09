import { json, type MetaFunction } from "@remix-run/node";
import { useLoaderData, useRevalidator, useSearchParams } from "@remix-run/react";
import { createStudioV2VerticalSliceWorkflow } from "@flowcordia/workflow";
import { ArrowLeftIcon, Code2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import {
  requireFlowcordiaProjectContext,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { resolveFlowcordiaCredentialEnvironment } from "~/features/flowcordia/workflows/credentials/query.server";
import { StudioV2ActivepiecesHost } from "~/features/flowcordia/workflows/studio-v2/StudioV2ActivepiecesHost";
import { StudioV2LifecycleBar } from "~/features/flowcordia/workflows/studio-v2/StudioV2LifecycleBar";
import { StudioV2WorkflowLibrary } from "~/features/flowcordia/workflows/studio-v2/StudioV2WorkflowLibrary";
import {
  StudioV2ActivepiecesApiError,
  handleStudioV2ActivepiecesApi,
} from "~/features/flowcordia/workflows/studio-v2/activepieces-api.server";
import { handleStudioV2ActivepiecesExtendedApi } from "~/features/flowcordia/workflows/studio-v2/activepieces-extended-api.server";
import { handleStudioV2ActivepiecesTriggerTesting } from "~/features/flowcordia/workflows/studio-v2/activepieces-trigger-testing.server";
import { StudioV2ReleaseError } from "~/features/flowcordia/workflows/studio-v2/release-contract";
import {
  deployStudioV2Release,
  listStudioV2ReleaseHistory,
  loadCurrentStudioV2Release,
  loadLatestStudioV2Release,
  rollbackStudioV2Release,
  stageStudioV2Workspace,
} from "~/features/flowcordia/workflows/studio-v2/release-service.server";
import {
  StudioV2SourceTestError,
  executeStudioV2SourceTest,
} from "~/features/flowcordia/workflows/studio-v2/source-test.server";
import { StudioV2SourceSurface } from "~/features/flowcordia/workflows/studio-v2/source/StudioV2SourceSurface";
import {
  hasInvalidStudioV2View,
  normalizeStudioV2ViewSearchParams,
  resolveStudioV2View,
  studioV2SearchParamsForView,
} from "~/features/flowcordia/workflows/studio-v2/source/view-state";
import {
  STUDIO_V2_WORKSPACE_KEY_PATTERN,
  StudioV2WorkspaceError,
  type StudioV2WorkspaceScope,
} from "~/features/flowcordia/workflows/studio-v2/workspace-contract";
import {
  queryStudioV2WorkflowCatalog,
  studioV2WorkspaceKeyForWorkflow,
} from "~/features/flowcordia/workflows/studio-v2/workflow-catalog.server";
import {
  StudioV2WorkspaceCommandError,
  parseStudioV2WorkspaceCommand,
  type StudioV2WorkspaceActionData,
  type StudioV2WorkspaceCommand,
} from "~/features/flowcordia/workflows/studio-v2/workspace-http";
import {
  loadOrCreateStudioV2Workspace,
  saveStudioV2Workspace,
} from "~/features/flowcordia/workflows/studio-v2/workspace-service.server";
import {
  StudioV2WorkflowTestError,
  cancelStudioV2WorkflowTest,
  readStudioV2WorkflowTest,
  startStudioV2WorkflowTest,
} from "~/features/flowcordia/workflows/studio-v2/workflow-test.server";
import { dashboardAction, dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import { EnvironmentParamSchema } from "~/utils/pathBuilder";

export const meta: MetaFunction = () => [{ title: "Studio V2 | Flowcordia" }];

const StudioV2Search = z.object({
  workflow: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{2,127}$/)
    .optional(),
  view: z.enum(["editor", "source"]).optional(),
  _studioWorkspace: z.string().regex(STUDIO_V2_WORKSPACE_KEY_PATTERN).optional(),
  _data: z.string().optional(),
});

function workspaceScope(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  workspaceKey: string;
}): StudioV2WorkspaceScope {
  return input;
}

async function assertStudioAccess(input: {
  userId: string;
  isAdmin: boolean;
  isImpersonating: boolean;
  organizationSlug: string;
}): Promise<void> {
  const enabled = await canAccessFlowcordiaStudio(input);
  if (!enabled) throw new Response("Not found", { status: 404 });
}

async function readWorkspaceCommand(request: Request): Promise<StudioV2WorkspaceCommand> {
  try {
    return parseStudioV2WorkspaceCommand(await request.json());
  } catch (error) {
    if (error instanceof StudioV2WorkspaceCommandError) throw error;
    throw new StudioV2WorkspaceCommandError(
      "The Studio V2 workspace command body must contain valid JSON."
    );
  }
}

export const loader = dashboardLoader(
  {
    params: EnvironmentParamSchema,
    searchParams: StudioV2Search,
    context: resolveFlowcordiaProjectContext,
  },
  async ({ context, params, searchParams, user, ability }) => {
    await assertStudioAccess({
      userId: user.id,
      isAdmin: user.admin,
      isImpersonating: user.isImpersonating,
      organizationSlug: params.organizationSlug,
    });

    const { organizationId, projectId } = requireFlowcordiaProjectContext(context);
    const environment = await resolveFlowcordiaCredentialEnvironment({
      projectId,
      environmentSlug: params.envParam,
    });
    if (!environment) throw new Response("Environment not found", { status: 404 });

    const catalog = await queryStudioV2WorkflowCatalog({
      organizationId,
      projectId,
      environmentId: environment.id,
    });
    const selectedWorkflow = searchParams._studioWorkspace
      ? (catalog.workflows.find(
          (workflow) => workflow.workspaceKey === searchParams._studioWorkspace
        ) ?? null)
      : searchParams.workflow
        ? (catalog.workflows.find((workflow) => workflow.workflowId === searchParams.workflow) ??
          null)
        : null;
    const selectedWorkflowId = selectedWorkflow?.workflowId ?? null;
    const canWrite = ability.can("write", { type: "envvars", envType: environment.type });

    if (!selectedWorkflow) {
      return json({
        workspace: null,
        projectId,
        workflows: catalog.workflows,
        workflowCatalogError: catalog.error,
        selectedWorkflow: null,
        selectedWorkflowId: null,
        selectedWorkspaceKey: null,
        latestRelease: null,
        currentRelease: null,
        releaseHistory: [],
        canWrite,
      });
    }

    const workspaceKey = selectedWorkflow.workspaceKey;
    const scope = workspaceScope({
      organizationId,
      projectId,
      environmentId: environment.id,
      workspaceKey,
    });
    const initialDocument = createStudioV2VerticalSliceWorkflow();
    if (selectedWorkflow) {
      initialDocument.id = selectedWorkflow.workflowId;
      initialDocument.name = selectedWorkflow.name;
      initialDocument.description = selectedWorkflow.description ?? undefined;
    }
    const workspace = await loadOrCreateStudioV2Workspace({
      scope,
      actorId: user.id,
      initialDocument,
    });
    const [latestRelease, currentRelease, releaseHistory] = await Promise.all([
      loadLatestStudioV2Release(scope),
      loadCurrentStudioV2Release(scope),
      listStudioV2ReleaseHistory(scope),
    ]);

    return json({
      workspace,
      projectId,
      workflows: catalog.workflows,
      workflowCatalogError: catalog.error,
      selectedWorkflow,
      selectedWorkflowId,
      selectedWorkspaceKey: workspaceKey,
      latestRelease,
      currentRelease,
      releaseHistory,
      canWrite,
    });
  }
);

function workspaceErrorResponse(error: unknown): Response {
  if (error instanceof StudioV2WorkspaceCommandError) {
    return json<StudioV2WorkspaceActionData>(
      { ok: false, code: "invalid_command", message: error.message },
      { status: 400 }
    );
  }
  if (error instanceof StudioV2ActivepiecesApiError) {
    return json<StudioV2WorkspaceActionData>(
      { ok: false, code: error.code, message: error.message },
      { status: error.status }
    );
  }
  if (error instanceof StudioV2SourceTestError) {
    return json<StudioV2WorkspaceActionData>(
      { ok: false, code: error.code, message: error.message },
      { status: error.status }
    );
  }
  if (error instanceof StudioV2WorkflowTestError) {
    return json<StudioV2WorkspaceActionData>(
      { ok: false, code: error.code, message: error.message },
      { status: error.status }
    );
  }
  if (error instanceof StudioV2ReleaseError) {
    const status =
      error.code === "release_not_found"
        ? 404
        : error.code === "release_conflict"
          ? 409
          : error.code === "deployment_failed"
            ? 502
            : error.code === "corrupt_release"
              ? 500
              : 400;
    return json<StudioV2WorkspaceActionData>(
      { ok: false, code: error.code, message: error.message },
      { status }
    );
  }
  if (error instanceof StudioV2WorkspaceError) {
    const status =
      error.code === "workspace_not_found"
        ? 404
        : error.code === "workspace_conflict"
          ? 409
          : error.code === "corrupt_workspace"
            ? 500
            : 400;
    return json<StudioV2WorkspaceActionData>(
      { ok: false, code: error.code, message: error.message },
      { status }
    );
  }
  throw error;
}

export const action = dashboardAction(
  {
    params: EnvironmentParamSchema,
    searchParams: StudioV2Search,
    context: resolveFlowcordiaProjectContext,
  },
  async ({ context, params, searchParams, request, user, ability }) => {
    await assertStudioAccess({
      userId: user.id,
      isAdmin: user.admin,
      isImpersonating: user.isImpersonating,
      organizationSlug: params.organizationSlug,
    });

    const { organizationId, projectId } = requireFlowcordiaProjectContext(context);
    const environment = await resolveFlowcordiaCredentialEnvironment({
      projectId,
      environmentSlug: params.envParam,
    });
    if (!environment) throw new Response("Environment not found", { status: 404 });
    const canWrite = ability.can("write", { type: "envvars", envType: environment.type });
    const workspaceKey =
      searchParams._studioWorkspace ?? studioV2WorkspaceKeyForWorkflow(searchParams.workflow);

    try {
      const command = await readWorkspaceCommand(request);
      if (command.intent === "activepieces_api") {
        const triggerTesting = await handleStudioV2ActivepiecesTriggerTesting({
          command,
          organizationId,
          projectId,
          environmentId: environment.id,
          actorId: user.id,
          canWrite,
          workspaceKey,
        });
        if (triggerTesting.handled) {
          return json<StudioV2WorkspaceActionData>({
            ok: true,
            intent: "activepieces_api",
            data: triggerTesting.data,
          });
        }

        const extended = await handleStudioV2ActivepiecesExtendedApi({
          command,
          organizationId,
          projectId,
          environmentId: environment.id,
          actorId: user.id,
          canWrite,
          workspaceKey,
        });
        const data = extended.handled
          ? extended.data
          : await handleStudioV2ActivepiecesApi({
              command,
              organizationId,
              projectId,
              environmentId: environment.id,
              actorId: user.id,
              canWrite,
              workspaceKey,
            });
        return json<StudioV2WorkspaceActionData>({
          ok: true,
          intent: "activepieces_api",
          data,
          ...(extended.handled && extended.transport ? { transport: extended.transport } : {}),
        });
      }

      if (!canWrite) throw new Response("Forbidden", { status: 403 });

      const scope = workspaceScope({
        organizationId,
        projectId,
        environmentId: environment.id,
        workspaceKey,
      });

      if (command.intent === "deploy") {
        const release = await deployStudioV2Release({
          scope,
          releasePublicId: command.releasePublicId,
          actorId: user.id,
        });
        return json<StudioV2WorkspaceActionData>({ ok: true, intent: "deploy", release });
      }

      if (command.intent === "rollback") {
        const release = await rollbackStudioV2Release({
          scope,
          releasePublicId: command.releasePublicId,
          actorId: user.id,
        });
        return json<StudioV2WorkspaceActionData>({ ok: true, intent: "rollback", release });
      }

      const expectedVersion = BigInt(command.expectedVersion);
      if (command.intent === "save") {
        const workspace = await saveStudioV2Workspace({
          scope,
          expectedVersion,
          document: command.document,
          actorId: user.id,
        });
        return json<StudioV2WorkspaceActionData>({ ok: true, intent: "save", workspace });
      }

      if (command.intent === "source_test") {
        const sourceTest = await executeStudioV2SourceTest({
          scope,
          expectedVersion,
          actorId: user.id,
          testInput: command.input,
        });
        return json<StudioV2WorkspaceActionData>({
          ok: true,
          intent: "source_test",
          sourceTest,
        });
      }

      if (command.intent === "stage") {
        const release = await stageStudioV2Workspace({
          scope,
          expectedVersion,
          actorId: user.id,
        });
        return json<StudioV2WorkspaceActionData>({ ok: true, intent: "stage", release });
      }

      if (command.intent === "cancel_test") {
        const cancelled = await cancelStudioV2WorkflowTest({
          scope,
          expectedVersion,
          runId: command.runId,
        });
        return json<StudioV2WorkspaceActionData>({
          ok: true,
          intent: "cancel_test",
          runId: cancelled.runId,
        });
      }

      const test =
        command.intent === "test_status"
          ? await readStudioV2WorkflowTest({
              scope,
              expectedVersion,
              actorId: user.id,
              runId: command.runId,
            })
          : await startStudioV2WorkflowTest({
              scope,
              expectedVersion,
              actorId: user.id,
              testInput: command.input,
            });
      return json<StudioV2WorkspaceActionData>({
        ok: true,
        intent: "test",
        ...(test.status === "completed" ? { workspace: test.workspace } : {}),
        test:
          test.status === "completed"
            ? {
                status: "completed",
                runId: test.runId,
                success: test.success,
                execution: test.execution,
              }
            : test,
      });
    } catch (error) {
      return workspaceErrorResponse(error);
    }
  }
);

export default function FlowcordiaStudioV2Route() {
  const data = useLoaderData<typeof loader>();
  const [workspace, setWorkspace] = useState(data.workspace);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string>();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const studioView = resolveStudioV2View(searchParams);
  const [sourceMounted, setSourceMounted] = useState(studioView === "source");
  const handleWorkspaceChange = useCallback((nextWorkspace: NonNullable<typeof data.workspace>) => {
    setWorkspace(nextWorkspace);
    setEditorError(undefined);
  }, []);

  useEffect(() => {
    if (studioView === "source") setSourceMounted(true);
  }, [studioView]);

  useEffect(() => {
    setWorkspace(data.workspace);
  }, [data.workspace]);

  useEffect(() => {
    if (!workspace || editorSaving) return;
    const interval = window.setInterval(() => revalidator.revalidate(), 15_000);
    return () => window.clearInterval(interval);
  }, [editorSaving, revalidator, workspace]);

  useEffect(() => {
    if (!hasInvalidStudioV2View(searchParams)) return;
    setSearchParams(normalizeStudioV2ViewSearchParams(searchParams), { replace: true });
  }, [searchParams, setSearchParams]);

  const handleStudioViewChange = useCallback(
    (nextView: string) => {
      const view = nextView === "source" ? "source" : "editor";
      setSearchParams(studioV2SearchParamsForView(searchParams, view));
    },
    [searchParams, setSearchParams]
  );

  const studioShellAttributes = {
    "data-testid": "flowcordia-studio-v2-preview-route",
    "data-source-control": "optional",
    "data-source-editor-foundation": "sandpack",
    "data-persistence": "durable-local",
    "data-studio-foundation": "activepieces",
  } as const;

  if (!workspace || !data.selectedWorkflow || !data.selectedWorkspaceKey) {
    return (
      <div
        {...studioShellAttributes}
        data-studio-view="library"
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      >
        <StudioV2WorkflowLibrary
          workflows={data.workflows}
          catalogError={data.workflowCatalogError}
        />
      </div>
    );
  }

  return (
    <div
      {...studioShellAttributes}
      data-studio-view={studioView}
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      {studioView === "editor" ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-grid-dimmed bg-background-bright px-2">
          <LinkButton variant="minimal/small" to="." LeadingIcon={ArrowLeftIcon}>
            Workflows
          </LinkButton>
          <div className="h-4 w-px bg-grid-bright" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-bright">
            {data.selectedWorkflow.name}
          </span>
          {editorError ? (
            <span className="max-w-72 truncate text-xxs text-rose-500" role="alert">
              {editorError}
            </span>
          ) : null}
          <StudioV2LifecycleBar
            workspace={workspace}
            initialRelease={data.latestRelease}
            initialCurrentRelease={data.currentRelease}
            releaseHistory={data.releaseHistory}
            canWrite={data.canWrite}
            editorSaving={editorSaving}
            onWorkspaceChange={handleWorkspaceChange}
          />
          <Button
            type="button"
            variant="minimal/small"
            LeadingIcon={Code2Icon}
            disabled={editorSaving}
            onClick={() => handleStudioViewChange("source")}
          >
            Source
          </Button>
        </div>
      ) : null}

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          data-studio-v2-view="editor"
          aria-hidden={studioView !== "editor"}
          className={`absolute inset-0 ${
            studioView === "editor" ? "visible" : "invisible pointer-events-none"
          }`}
        >
          <StudioV2ActivepiecesHost
            workspace={workspace}
            projectId={data.projectId}
            canWrite={data.canWrite}
            active={studioView === "editor"}
            onSavingChange={setEditorSaving}
            onError={(message) => {
              setEditorError(message);
              revalidator.revalidate();
            }}
            onWorkspaceChange={handleWorkspaceChange}
          />
        </div>

        {sourceMounted ? (
          <div
            data-studio-v2-view="source"
            aria-hidden={studioView !== "source"}
            className={`absolute inset-0 ${
              studioView === "source" ? "visible" : "invisible pointer-events-none"
            }`}
          >
            <StudioV2SourceSurface
              studioWorkspace={workspace}
              readOnly={!data.canWrite}
              onStudioWorkspaceChange={handleWorkspaceChange}
              onExitSource={() => handleStudioViewChange("editor")}
              onExitStudio={() => setSearchParams(new URLSearchParams())}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
