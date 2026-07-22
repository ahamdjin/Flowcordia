import { randomBytes } from "node:crypto";
import {
  ProductionWebhookBindingConcurrencyError,
  ProductionWebhookBindingNotFoundError,
  ProductionWebhookBindingService,
  ProductionWebhookReplacementRequiresRevocationError,
} from "@flowcordia/control-plane";
import { prisma } from "~/db.server";
import { flowcordiaProductionWebhookBindingStore } from "./binding-prisma.server";

export type FlowcordiaWebhookReplacementErrorCode =
  | "production_not_ready"
  | "endpoint_not_found"
  | "replacement_requires_revocation"
  | "replacement_conflict"
  | "replacement_failed";

export class FlowcordiaWebhookReplacementError extends Error {
  constructor(
    readonly code: FlowcordiaWebhookReplacementErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaWebhookReplacementError";
  }
}

function proposedPublicId(): string {
  return randomBytes(24).toString("base64url");
}

export async function replaceFlowcordiaProductionWebhook(input: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  nodeId: string;
  expectedRevokedPublicId: string;
  actorId: string;
  replacedAt?: Date;
}) {
  const environment = await prisma.runtimeEnvironment.findFirst({
    where: {
      organizationId: input.tenantId,
      projectId: input.projectId,
      type: "PRODUCTION",
      archivedAt: null,
      project: { deletedAt: null },
      organization: { deletedAt: null },
    },
    select: { id: true },
  });
  if (!environment) {
    throw new FlowcordiaWebhookReplacementError(
      "production_not_ready",
      "The production environment is unavailable.",
      409,
      true
    );
  }

  try {
    const result = await new ProductionWebhookBindingService(
      flowcordiaProductionWebhookBindingStore
    ).replaceRevoked({
      scope: {
        tenantId: input.tenantId,
        projectId: input.projectId,
        environmentId: environment.id,
        workflowId: input.workflowId,
        nodeId: input.nodeId,
      },
      expectedRevokedPublicId: input.expectedRevokedPublicId,
      proposedPublicId: proposedPublicId(),
      actorId: input.actorId,
      replacedAt: input.replacedAt ?? new Date(),
    });
    return {
      ...result,
      nodeId: input.nodeId,
    };
  } catch (error) {
    if (error instanceof ProductionWebhookBindingNotFoundError) {
      throw new FlowcordiaWebhookReplacementError(
        "endpoint_not_found",
        "The exact revoked production webhook endpoint was not found.",
        404,
        false
      );
    }
    if (error instanceof ProductionWebhookReplacementRequiresRevocationError) {
      throw new FlowcordiaWebhookReplacementError(
        "replacement_requires_revocation",
        "Only the current revoked production webhook endpoint can be replaced.",
        409,
        false
      );
    }
    if (error instanceof ProductionWebhookBindingConcurrencyError) {
      throw new FlowcordiaWebhookReplacementError(
        "replacement_conflict",
        "The production webhook replacement changed concurrently.",
        409,
        true
      );
    }
    if (error instanceof FlowcordiaWebhookReplacementError) throw error;
    throw new FlowcordiaWebhookReplacementError(
      "replacement_failed",
      "The replacement production webhook endpoint could not be created.",
      503,
      true
    );
  }
}
