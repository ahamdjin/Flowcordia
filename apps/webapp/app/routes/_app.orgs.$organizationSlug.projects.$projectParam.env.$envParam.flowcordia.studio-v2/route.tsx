import { json, type MetaFunction } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { useCallback, useEffect, useState } from "react";
import { ClientTabs, ClientTabsList, ClientTabsTrigger } from "~/components/primitives/ClientTabs";
import {
  requireFlowcordiaProjectContext,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { resolveFlowcordiaCredentialEnvironment } from "~/features/flowcordia/workflows/credentials/query.server";
import { StudioV2ActivepiecesHost } from "~/features/flowcordia/workflows/studio-v2/StudioV2ActivepiecesHost";
import {
  StudioV2ActivepiecesApiError,
  handleStudioV2ActivepiecesApi,
} from "~/features/flowcordia/workflows/studio-v2/activepieces-api.server";
import { handleStudioV2ActivepiecesExtendedApi } from "~/features/flowcordia/workflows/studio-v2/activepieces-extended-api.server";
import { handleStudioV2ActivepiecesTriggerTesting } from "~/features/flowcordia/workflows/studio-v2/activepieces-trigger-testing.server";
import { StudioV2ReleaseError } from "~/features/flowcordia/workflows/studio-v2/release-contract";
import {
  deployStudioV2Release,
  stageStudioV2Workspace,
} from "~/features/flowcordia/workflows/studio-v2/release-service.server";
import { StudioV2SourceSurface } from "~/features/flowcordia/workflows/studio-v2/source/StudioV2SourceSurface";
import {
  hasInvalidStudioV2View,
  normalizeStudioV2ViewSearchParams,
  resolveStudioV2View,
  studioV2SearchParamsForView,
} from "~/features/flowcordia/workflows/studio-v2/source/view-state";
import {
  STUDIO_V2_DEFAULT_WORKSPACE_KEY,
  StudioV2WorkspaceError,
  type StudioV2WorkspaceScope,
} from "~/features/flowcordia/workflows/studio-v2/workspace-contract";
import {
  StudioV2WorkspaceCommandError,
  parseStudioV2WorkspaceCommand,
  type StudioV2WorkspaceActionData,
  type StudioV2WorkspaceCommand,
} from "~/features/flowcordia/workflows/studio-v2/workspace-http";
import {
  loadOrCreateStudioV2Workspace,
  saveStudioV2Workspace,
  structurallyTestStudioV2Workspace,
} from "~/features/flowcordia/workflows/studio-v2/workspace-service.server";
import { dashboardAction, dashboardLoader } from "~/services/routeBuilders/dashboardBuilder";
import { EnvironmentParamSchema } from "~/utils/pathBuilder";

export const meta: MetaFunction = () => [{ title: "Studio V2 | Flowcordia" }];

function workspaceScope(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
}): StudioV2WorkspaceScope {
  return {
    ...input,
    workspaceKey: STUDIO_V2_DEFAULT_WORKSPACE_KEY,
  };
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
    context: resolveFlowcordiaProjectContext,
  },
  async ({ context, params, user, ability }) => {
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

    const scope = workspaceScope({ organizationId, projectId, environmentId: environment.id });
    const workspace = await loadOrCreateStudioV2Workspace({ scope, actorId: user.id });

    return json({
      workspace,
      projectId,
      canWrite: ability.can("write", { type: "envvars", envType: environment.type }),
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
    context: resolveFlowcordiaProjectContext,
  },
  async ({ context, params, request, user, ability }) => {
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
            });
        return json<StudioV2WorkspaceActionData>({
          ok: true,
          intent: "activepieces_api",
          data,
          ...(extended.handled && extended.transport ? { transport: extended.transport } : {}),
        });
      }

      if (!canWrite) throw new Response("Forbidden", { status: 403 });

      const scope = workspaceScope({ organizationId, projectId, environmentId: environment.id });

      if (command.intent === "deploy") {
        const release = await deployStudioV2Release({
          scope,
          releasePublicId: command.releasePublicId,
          actorId: user.id,
        });
        return json<StudioV2WorkspaceActionData>({ ok: true, intent: "deploy", release });
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

      if (command.intent === "stage") {
        const release = await stageStudioV2Workspace({
          scope,
          expectedVersion,
          actorId: user.id,
        });
        return json<StudioV2WorkspaceActionData>({ ok: true, intent: "stage", release });
      }

      const test = await structurallyTestStudioV2Workspace({
        scope,
        expectedVersion,
        actorId: user.id,
      });
      return json<StudioV2WorkspaceActionData>({
        ok: true,
        intent: "test",
        workspace: test.workspace,
        test: {
          success: test.success,
          version: test.version,
          documentSha256: test.documentSha256,
          issues: test.issues,
        },
      });
    } catch (error) {
      return workspaceErrorResponse(error);
    }
  }
);

export default function FlowcordiaStudioV2Route() {
  const data = useLoaderData<typeof loader>();
  const [workspace, setWorkspace] = useState(data.workspace);
  const [searchParams, setSearchParams] = useSearchParams();
  const studioView = resolveStudioV2View(searchParams);
  const [sourceMounted, setSourceMounted] = useState(studioView === "source");
  const handleWorkspaceChange = useCallback((nextWorkspace: typeof data.workspace) => {
    setWorkspace(nextWorkspace);
  }, []);
  const workflowId =
    typeof workspace.document.id === "string" && workspace.document.id.length > 0
      ? workspace.document.id
      : workspace.publicId;

  useEffect(() => {
    if (studioView === "source") setSourceMounted(true);
  }, [studioView]);

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

  return (
    <div
      data-testid="flowcordia-studio-v2-preview-route"
      data-source-control="optional"
      data-source-editor-foundation="sandpack"
      data-persistence="session-memory"
      data-studio-foundation="activepieces"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      {studioView === "editor" ? (
        <div className="flex h-10 shrink-0 items-end border-b border-grid-dimmed bg-background-dimmed px-3">
          <ClientTabs value={studioView} onValueChange={handleStudioViewChange}>
            <ClientTabsList
              variant="underline"
              className="gap-x-5 border-b-0"
              aria-label="Studio view"
            >
              <ClientTabsTrigger value="editor" variant="underline" layoutId="studio-v2-view-tabs">
                Editor
              </ClientTabsTrigger>
              <ClientTabsTrigger value="source" variant="underline" layoutId="studio-v2-view-tabs">
                Source
              </ClientTabsTrigger>
            </ClientTabsList>
          </ClientTabs>
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
              workflowId={workflowId}
              readOnly={!data.canWrite}
              onExitSource={() => handleStudioViewChange("editor")}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
