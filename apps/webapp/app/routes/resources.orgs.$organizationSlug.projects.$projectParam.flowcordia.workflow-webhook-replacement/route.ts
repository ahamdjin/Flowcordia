import { executeFlowcordiaWebhookReplacementCommand } from "~/features/flowcordia/workflows/webhook/replacement-commands.server";
import { resolveFlowcordiaProjectContext } from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { dashboardAction } from "~/services/routeBuilders/dashboardBuilder";
import { ProjectParamSchema } from "~/utils/pathBuilder";

export const action = dashboardAction(
  {
    params: ProjectParamSchema,
    context: resolveFlowcordiaProjectContext,
    authorization: { action: "write", resource: { type: "github" } },
  },
  async ({ ability, context, params, request, user }) => {
    const enabled = await canAccessFlowcordiaStudio({
      userId: user.id,
      isAdmin: user.admin,
      isImpersonating: user.isImpersonating,
      organizationSlug: params.organizationSlug,
    });
    if (!enabled) throw new Response("Not found", { status: 404 });
    return executeFlowcordiaWebhookReplacementCommand({
      context,
      request,
      ability,
      actorId: user.id,
    });
  }
);
