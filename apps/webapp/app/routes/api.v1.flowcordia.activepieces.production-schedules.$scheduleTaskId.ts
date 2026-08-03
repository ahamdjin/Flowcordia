import { json } from "@remix-run/server-runtime";
import { z } from "zod";
import {
  getStudioV2ActivepiecesProductionBindingByScheduleTask,
  runStudioV2ActivepiecesProductionSchedule,
} from "~/features/flowcordia/workflows/studio-v2/activepieces-production-binding.server";
import { getStudioV2ReleaseByPublicIdAcrossScopes } from "~/features/flowcordia/workflows/studio-v2/release-repository.server";
import { createActionApiRoute } from "~/services/routeBuilders/apiBuilder.server";

const ParamsSchema = z.object({ scheduleTaskId: z.string().min(1) });
const BodySchema = z.object({ runId: z.string().min(1).max(256) });

export const { action } = createActionApiRoute(
  {
    params: ParamsSchema,
    body: BodySchema,
  },
  async ({ params, body, authentication }) => {
    const binding = await getStudioV2ActivepiecesProductionBindingByScheduleTask(
      authentication.environment.id,
      params.scheduleTaskId
    );
    if (!binding)
      return json({ error: "Activepieces production schedule not found" }, { status: 404 });
    const release = await getStudioV2ReleaseByPublicIdAcrossScopes(binding.releasePublicId);
    if (!release || release.status !== "DEPLOYED") {
      return json({ error: "Activepieces production release is unavailable" }, { status: 409 });
    }
    const runIds = await runStudioV2ActivepiecesProductionSchedule({
      release,
      binding,
      runId: body.runId,
    });
    return json({ runIds });
  }
);
