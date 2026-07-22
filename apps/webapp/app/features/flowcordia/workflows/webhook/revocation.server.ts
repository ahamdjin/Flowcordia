import {
  ProductionWebhookBindingConcurrencyError,
  ProductionWebhookBindingNotFoundError,
  ProductionWebhookBindingService,
  type ProductionWebhookRevocationReason,
} from "@flowcordia/control-plane";
import { prisma } from "~/db.server";
import { flowcordiaProductionWebhookBindingStore } from "./binding-prisma.server";

export type FlowcordiaWebhookRevocationErrorCode =
  | "production_not_ready"
  | "endpoint_not_found"
  | "revocation_conflict"
  | "revocation_failed";

export class FlowcordiaWebhookRevocationError extends Error {
  constructor(
    readonly code: FlowcordiaWebhookRevocationErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaWebhookRevocationError";
  }
}

export async function revokeFlowcordiaProductionWebhook(input: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  nodeId: string;
  expectedPublicId: string;
  actorId: string;
  reason: ProductionWebhookRevocationReason;
  revokedAt?: Date;
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
    throw new FlowcordiaWebhookRevocationError(
      "production_not_ready",
      "The production environment is unavailable.",
      409,
      true
    );
  }

  try {
    const result = await new ProductionWebhookBindingService(
      flowcordiaProductionWebhookBindingStore
    ).revoke({
      scope: {
        tenantId: input.tenantId,
        projectId: input.projectId,
        environmentId: environment.id,
        workflowId: input.workflowId,
        nodeId: input.nodeId,
      },
      expectedPublicId: input.expectedPublicId,
      actorId: input.actorId,
      reason: input.reason,
      revokedAt: input.revokedAt ?? new Date(),
    });
    return {
      ...result,
      nodeId: input.nodeId,
    };
  } catch (error) {
    if (error instanceof ProductionWebhookBindingNotFoundError) {
      throw new FlowcordiaWebhookRevocationError(
        "endpoint_not_found",
        "The exact production webhook endpoint was not found.",
        404,
        false
      );
    }
    if (error instanceof ProductionWebhookBindingConcurrencyError) {
      throw new FlowcordiaWebhookRevocationError(
        "revocation_conflict",
        "The production webhook endpoint changed concurrently.",
        409,
        true
      );
    }
    if (error instanceof FlowcordiaWebhookRevocationError) throw error;
    throw new FlowcordiaWebhookRevocationError(
      "revocation_failed",
      "The production webhook endpoint could not be revoked.",
      503,
      true
    );
  }
}
