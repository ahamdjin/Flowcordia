import { createHash } from "node:crypto";
import {
  PRODUCTION_WEBHOOK_REVOCATION_REASONS,
  type ProductionWebhookRevocationReason,
} from "@flowcordia/control-plane";
import { prisma } from "~/db.server";
import { env } from "~/env.server";
import { flowcordiaPublicWebhookUrl } from "./ingress-contract.server";

export type FlowcordiaWebhookDeliveryProjectionState = "PROCESSING" | "DELIVERED" | "FAILED";

export interface FlowcordiaWebhookDeliveryProjection {
  reference: string;
  state: FlowcordiaWebhookDeliveryProjectionState;
  attempts: number;
  receivedAt: string;
  completedAt: string | null;
  failureCode: string | null;
}

export interface FlowcordiaProductionWebhookBindingProjection {
  nodeId: string;
  publicId: string;
  state: "ACTIVE" | "INACTIVE" | "REVOKED";
  revocation: {
    revokedAt: string;
    reason: ProductionWebhookRevocationReason;
  } | null;
  recentDeliveries: FlowcordiaWebhookDeliveryProjection[];
  activeRevision: {
    revision: number;
    fingerprint: string;
    mergeCommitSha: string;
    workerVersion: string;
    taskIdentifier: string;
    method: string;
    path: string;
    publicUrl: string;
    createdAt: string;
  } | null;
}

const revocationReasons = new Set<string>(PRODUCTION_WEBHOOK_REVOCATION_REASONS);

function deliveryReference(endpointId: string, deliveryId: string): string {
  return createHash("sha256")
    .update(`flowcordia:webhook-delivery-reference:v1:${endpointId}:${deliveryId}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

function deliveryState(
  status: "RECEIVED" | "TRIGGERED" | "FAILED"
): FlowcordiaWebhookDeliveryProjectionState {
  if (status === "TRIGGERED") return "DELIVERED";
  if (status === "FAILED") return "FAILED";
  return "PROCESSING";
}

function revocationReason(value: string | null): ProductionWebhookRevocationReason | null {
  return value && revocationReasons.has(value)
    ? (value as ProductionWebhookRevocationReason)
    : null;
}

export async function queryFlowcordiaProductionWebhookBindings(input: {
  organizationId: string;
  projectId: string;
  workflowId: string | null;
}): Promise<FlowcordiaProductionWebhookBindingProjection[]> {
  if (!input.workflowId) return [];
  const endpoints = await prisma.flowcordiaWebhookEndpoint.findMany({
    where: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      workflowId: input.workflowId,
      runtimeEnvironment: {
        type: "PRODUCTION",
        archivedAt: null,
        project: { deletedAt: null },
        organization: { deletedAt: null },
      },
    },
    orderBy: [{ nodeId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nodeId: true,
      publicId: true,
      activeRevisionId: true,
      revokedAt: true,
      revocationReason: true,
      activeRevision: {
        select: {
          revision: true,
          fingerprint: true,
          mergeCommitSha: true,
          workerVersion: true,
          taskIdentifier: true,
          method: true,
          path: true,
          createdAt: true,
          nodeId: true,
        },
      },
    },
  });
  const deliveryGroups = await Promise.all(
    endpoints.map(async (endpoint) => ({
      endpointId: endpoint.id,
      deliveries: await prisma.flowcordiaPublicWebhookDelivery.findMany({
        where: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          workflowId: input.workflowId!,
          webhookEndpointId: endpoint.id,
        },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          deliveryId: true,
          status: true,
          attempts: true,
          receivedAt: true,
          completedAt: true,
          failureCode: true,
        },
      }),
    }))
  );
  const deliveriesByEndpoint = new Map(
    deliveryGroups.map((group) => [group.endpointId, group.deliveries] as const)
  );

  return endpoints.map((endpoint) => {
    const activeRevision =
      endpoint.activeRevision && endpoint.activeRevision.nodeId === endpoint.nodeId
        ? {
            revision: endpoint.activeRevision.revision,
            fingerprint: endpoint.activeRevision.fingerprint,
            mergeCommitSha: endpoint.activeRevision.mergeCommitSha,
            workerVersion: endpoint.activeRevision.workerVersion,
            taskIdentifier: endpoint.activeRevision.taskIdentifier,
            method: endpoint.activeRevision.method,
            path: endpoint.activeRevision.path,
            publicUrl: flowcordiaPublicWebhookUrl({
              origin: env.APP_ORIGIN,
              publicId: endpoint.publicId,
              path: endpoint.activeRevision.path,
            }),
            createdAt: endpoint.activeRevision.createdAt.toISOString(),
          }
        : null;
    const reason = revocationReason(endpoint.revocationReason);
    const recentDeliveries = (deliveriesByEndpoint.get(endpoint.id) ?? []).map((delivery) => ({
      reference: deliveryReference(endpoint.id, delivery.deliveryId),
      state: deliveryState(delivery.status),
      attempts: delivery.attempts,
      receivedAt: delivery.receivedAt.toISOString(),
      completedAt: delivery.completedAt?.toISOString() ?? null,
      failureCode: delivery.failureCode,
    }));
    return {
      nodeId: endpoint.nodeId,
      publicId: endpoint.publicId,
      state: endpoint.revokedAt
        ? "REVOKED"
        : endpoint.activeRevisionId && activeRevision
          ? "ACTIVE"
          : "INACTIVE",
      revocation:
        endpoint.revokedAt && reason
          ? { revokedAt: endpoint.revokedAt.toISOString(), reason }
          : null,
      recentDeliveries,
      activeRevision,
    };
  });
}
