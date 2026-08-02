import { json, type MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useCallback, useState } from "react";
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
import { StudioV2ReleaseError } from "~/features/flowcordia/workflows/studio-v2/release-contract";
import {
  deployStudioV2Release,
  stageStudioV2Workspace,
} from "~/features/flowcordia/workflows/studio-v2/release-service.server";
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
        const data = await handleStudioV2ActivepiecesApi({
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
  const handleWorkspaceChange = useCallback((nextWorkspace: typeof data.workspace) => {
    setWorkspace(nextWorkspace);
  }, []);

  return (
    <div
      data-testid="flowcordia-studio-v2-preview-route"
      data-source-control="optional"
      data-persistence="durable-local"
      data-studio-foundation="activepieces"
      className="h-full min-h-0 w-full overflow-hidden"
    >
      <StudioV2ActivepiecesHost
        workspace={workspace}
        projectId={data.projectId}
        canWrite={data.canWrite}
        onWorkspaceChange={handleWorkspaceChange}
      />
    </div>
  );
}
