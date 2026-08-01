import { json, type MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { FlaskConicalIcon, GitBranchIcon } from "lucide-react";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Badge } from "~/components/primitives/Badge";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import {
  requireFlowcordiaProjectContext,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { resolveFlowcordiaCredentialEnvironment } from "~/features/flowcordia/workflows/credentials/query.server";
import { StudioV2Surface } from "~/features/flowcordia/workflows/studio-v2/StudioV2Surface";
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

    const workspace = await loadOrCreateStudioV2Workspace({
      scope: workspaceScope({ organizationId, projectId, environmentId: environment.id }),
      actorId: user.id,
    });

    return json({
      workspace,
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

  return (
    <PageContainer>
      <NavBar>
        <PageTitle
          title="Studio V2"
          accessory="Local-first workflow authoring built on Flowcordia-owned contracts."
        />
        <PageAccessories>
          <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <FlaskConicalIcon className="size-3" />
            Durable workspace
          </Badge>
          <Badge className="border border-zinc-500/30 bg-zinc-500/10 text-zinc-300 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <GitBranchIcon className="size-3" />
            GitHub optional
          </Badge>
        </PageAccessories>
      </NavBar>
      <PageBody scrollable className="bg-background-dimmed p-4 xl:p-6">
        <div
          data-testid="flowcordia-studio-v2-preview-route"
          data-source-control="optional"
          data-persistence="durable-local"
          className="mx-auto w-full max-w-[1800px]"
        >
          <StudioV2Surface initialWorkspace={data.workspace} canWrite={data.canWrite} />
        </div>
      </PageBody>
    </PageContainer>
  );
}
