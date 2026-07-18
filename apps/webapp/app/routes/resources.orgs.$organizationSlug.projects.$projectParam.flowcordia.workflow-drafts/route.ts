import { resolveFlowcordiaProjectContext } from "~/features/flowcordia/proposals/scope.server";
import { canAccessFlowcordiaStudio } from "~/features/flowcordia/proposals/workspace/access.server";
import { executeWorkflowDraftCommand } from "~/features/flowcordia/workflows/drafts/commands.server";
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

    const response = await executeWorkflowDraftCommand({ context, request, userId: user.id });
    if (!response) {
      throw new Response("Workflow draft command returned no response.", { status: 500 });
    }
    return response;
  }
);
