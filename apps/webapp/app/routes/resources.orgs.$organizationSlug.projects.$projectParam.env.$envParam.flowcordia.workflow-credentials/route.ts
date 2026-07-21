import {
  executeFlowcordiaCredentialCommand,
  resolveFlowcordiaCredentialEnvironment,
} from "~/features/flowcordia/workflows/credentials/commands.server";
import {
  requireFlowcordiaProjectContext,
  resolveFlowcordiaProjectContext,
} from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { dashboardAction } from "~/services/routeBuilders/dashboardBuilder";
import { EnvironmentParamSchema } from "~/utils/pathBuilder";

export const action = dashboardAction(
  {
    params: EnvironmentParamSchema,
    context: resolveFlowcordiaProjectContext,
    authorization: { action: "read", resource: { type: "github" } },
  },
  async ({ context, params, request, user, ability }) => {
    const enabled = await canAccessFlowcordiaStudio({
      userId: user.id,
      isAdmin: user.admin,
      isImpersonating: user.isImpersonating,
      organizationSlug: params.organizationSlug,
    });
    if (!enabled) throw new Response("Not found", { status: 404 });

    const { projectId } = requireFlowcordiaProjectContext(context);
    const environment = await resolveFlowcordiaCredentialEnvironment({
      projectId,
      environmentSlug: params.envParam,
    });
    if (!environment) throw new Response("Environment not found", { status: 404 });
    if (!ability.can("write", { type: "envvars", envType: environment.type })) {
      throw new Response("Forbidden", { status: 403 });
    }

    return executeFlowcordiaCredentialCommand({
      context,
      environmentSlug: params.envParam,
      request,
      userId: user.id,
    });
  }
);
