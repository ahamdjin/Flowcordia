import { json } from "@remix-run/node";
import { z } from "zod";
import {
  canRequestFlowcordiaDeployLatest,
  isFlowcordiaExpectedCommitCurrent,
  queryFlowcordiaLatestDeployment,
} from "~/features/flowcordia/deployments/latest.server";
import { resolveOrgIdFromSlug } from "~/models/organization.server";
import { findProjectBySlug } from "~/models/project.server";
import { findEnvironmentBySlug } from "~/models/runtimeEnvironment.server";
import {
  isInitialDeploymentRequestConfigured,
  requestInitialDeployment,
} from "~/services/platform.v3.server";
import { dashboardAction } from "~/services/routeBuilders/dashboardBuilder";
import { EnvironmentParamSchema } from "~/utils/pathBuilder";

const DeployLatestCommandSchema = z
  .object({
    intent: z.literal("deploy-latest"),
    expectedCommitSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/i, "Expected commit must be a full Git SHA."),
  })
  .strict();

export const action = dashboardAction(
  {
    params: EnvironmentParamSchema,
    context: async (params) => {
      const organizationId = await resolveOrgIdFromSlug(params.organizationSlug);
      return organizationId ? { organizationId } : {};
    },
    authorization: { action: "write", resource: { type: "deployments" } },
  },
  async ({ request, params, user }) => {
    const formData = await request.formData();
    const command = DeployLatestCommandSchema.safeParse(Object.fromEntries(formData));
    if (!command.success) {
      return json({ ok: false as const, message: "Unsupported deployment command." }, 400);
    }

    const project = await findProjectBySlug(params.organizationSlug, params.projectParam, user.id);
    if (!project) {
      return json({ ok: false as const, message: "Project not found." }, 404);
    }
    const environment = await findEnvironmentBySlug(project.id, params.envParam, user.id);
    if (!environment) {
      return json({ ok: false as const, message: "Environment not found." }, 404);
    }
    const platformEnvironment =
      environment.type === "PRODUCTION"
        ? "prod"
        : environment.type === "STAGING"
          ? "staging"
          : null;
    if (!platformEnvironment) {
      return json(
        {
          ok: false as const,
          message: "Deploy latest is available for production and staging environments.",
        },
        409
      );
    }

    const latest = await queryFlowcordiaLatestDeployment({
      userId: user.id,
      organizationSlug: params.organizationSlug,
      projectSlug: params.projectParam,
      environmentSlug: params.envParam,
    });
    if (!canRequestFlowcordiaDeployLatest(latest)) {
      return json({ ok: false as const, message: latest.message }, 409);
    }
    const verifiedCommitSha = latest.commitSha;
    if (
      !verifiedCommitSha ||
      !isFlowcordiaExpectedCommitCurrent(latest, command.data.expectedCommitSha)
    ) {
      return json(
        {
          ok: false as const,
          message:
            "The tracked branch changed since this page loaded. Refresh before deploying the new latest commit.",
        },
        409
      );
    }
    if (!isInitialDeploymentRequestConfigured()) {
      return json(
        {
          ok: false as const,
          message:
            "This installation has no server-side build adapter. Automatic GitHub deployments or the Trigger.dev CLI remain available.",
        },
        409
      );
    }

    const requested = await requestInitialDeployment(project.id, {
      environment: platformEnvironment,
    });
    if (requested.status === "requested") {
      return json({
        ok: true as const,
        message: `Flowcordia verified ${verifiedCommitSha.slice(0, 7)} and requested a deployment from the tracked branch.`,
      });
    }
    if (requested.status === "unavailable") {
      return json(
        {
          ok: false as const,
          message:
            "This installation has no server-side build adapter. Automatic GitHub deployments or the Trigger.dev CLI remain available.",
        },
        409
      );
    }
    return json(
      {
        ok: false as const,
        message:
          "The deployment request failed safely. Try again after checking the build service.",
      },
      502
    );
  }
);
