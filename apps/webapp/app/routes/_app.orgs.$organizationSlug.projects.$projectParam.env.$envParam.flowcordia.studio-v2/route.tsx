import { json, type MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { FlaskConicalIcon, GitBranchIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Badge } from "~/components/primitives/Badge";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import {
  FlowcordiaProposalConfigurationError,
  requireFlowcordiaProjectContext,
  resolveControlPlaneScope,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { resolveFlowcordiaCredentialEnvironment } from "~/features/flowcordia/workflows/credentials/query.server";
import { StudioV2ActivepiecesHost } from "~/features/flowcordia/workflows/studio-v2/StudioV2ActivepiecesHost";
import { StudioV2ReleaseControls } from "~/features/flowcordia/workflows/studio-v2/StudioV2ReleaseControls";
import { StudioV2ReleaseError } from "~/features/flowcordia/workflows/studio-v2/release-contract";
import {
  deployStudioV2Release,
  loadLatestStudioV2Release,
  stageStudioV2Workspace,
} from "~/features/flowcordia/workflows/studio-v2/release-service.server";
import {
  StudioV2SourceControlError,
  pushStudioV2ReleaseToGitHub,
} from "~/features/flowcordia/workflows/studio-v2/source-control-service.server";
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

async function sourceControlConfigured(input: {
  organizationId: string;
  projectId: string;
}): Promise<boolean> {
  try {
    await resolveControlPlaneScope(input);
    return true;
  } catch (error) {
    if (error instanceof FlowcordiaProposalConfigurationError) return false;
    throw error;
  }
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
    const [workspace, release, hasSourceControl] = await Promise.all([
      loadOrCreateStudioV2Workspace({ scope, actorId: user.id }),
      loadLatestStudioV2Release(scope),
      sourceControlConfigured({ organizationId, projectId }),
    ]);

    return json({
      workspace,
      release,
      projectId,
      sourceControlConfigured: hasSourceControl,
      canWrite: ability.can("write", { type: "envvars", envType: environment.type }),
      environment: { slug: environment.slug, type: environment.type },
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
  if (error instanceof StudioV2SourceControlError) {
    const status =
      error.code === "source_control_not_configured"
        ? 409
        : error.code === "source_control_conflict"
          ? 409
          : 502;
    return json<StudioV2WorkspaceActionData>(
      { ok: false, code: error.code, message: error.message },
      { status }
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
    if (!ability.can("write", { type: "envvars", envType: environment.type })) {
      throw new Response("Forbidden", { status: 403 });
    }

    try {
      const command = await readWorkspaceCommand(request);
      const scope = workspaceScope({ organizationId, projectId, environmentId: environment.id });

      if (command.intent === "push") {
        const sourceControl = await pushStudioV2ReleaseToGitHub({
          scope,
          releasePublicId: command.releasePublicId,
          actorId: user.id,
        });
        return json<StudioV2WorkspaceActionData>({ ok: true, intent: "push", sourceControl });
      }

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
    <PageContainer>
      <NavBar>
        <PageTitle
          title="Studio V2"
          accessory="The actual Activepieces workflow builder, adapted to Flowcordia contracts and permissions."
        />
        <PageAccessories>
          <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <FlaskConicalIcon className="size-3" />
            Flowcordia runtime
          </Badge>
          <Badge className="border border-zinc-500/30 bg-zinc-500/10 text-zinc-300 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <GitBranchIcon className="size-3" />
            {data.sourceControlConfigured ? "GitHub connected" : "GitHub optional"}
          </Badge>
        </PageAccessories>
      </NavBar>
      <PageBody scrollable className="bg-background-dimmed p-4 xl:p-6">
        <div
          data-testid="flowcordia-studio-v2-preview-route"
          data-source-control={data.sourceControlConfigured ? "configured" : "optional"}
          data-persistence="durable-local"
          data-studio-foundation="activepieces"
          className="mx-auto w-full max-w-[1800px]"
        >
          <StudioV2ReleaseControls
            workspace={workspace}
            initialRelease={data.release}
            canWrite={data.canWrite}
            environment={data.environment}
            sourceControlConfigured={data.sourceControlConfigured}
          />
          <StudioV2ActivepiecesHost
            workspace={workspace}
            projectId={data.projectId}
            canWrite={data.canWrite}
            onWorkspaceChange={handleWorkspaceChange}
          />
        </div>
      </PageBody>
    </PageContainer>
  );
}
