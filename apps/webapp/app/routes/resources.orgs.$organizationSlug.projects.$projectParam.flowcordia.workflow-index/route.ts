import { resolveFlowcordiaProjectContext } from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { executeWorkflowStudioCommand } from "~/features/flowcordia/workflows/studio/commands.server";
import { dashboardAction } from "~/services/routeBuilders/dashboardBuilder";
import { ProjectParamSchema } from "~/utils/pathBuilder";

export const action = dashboardAction(
  {
    params: ProjectParamSchema,
    context: resolveFlowcordiaProjectContext,
    authorization: { action: "write", resource: { type: "github" } },
  },
  async ({ context, params, request, user }) => {
    const enabled = await canAccessFlowcordiaStudio({
      userId: user.id,
      isAdmin: user.admin,
      isImpersonating: user.isImpersonating,
      organizationSlug: params.organizationSlug,
    });
    if (!enabled) throw new Response("Not found", { status: 404 });
    return executeWorkflowStudioCommand({ context, request, userId: user.id });
  }
);
