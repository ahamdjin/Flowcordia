import {
  PublicWebhookDeliveryConcurrencyError,
  type PublicWebhookDeliveryRecord,
  type PublicWebhookDeliveryStore,
  type PublicWebhookDeliveryTransaction,
  type PublicWebhookDeliveryStatus,
  type ReservePublicWebhookDeliveryInput,
} from "@flowcordia/control-plane";
import type { PrismaTransactionClient } from "~/db.server";
import { $transaction, Prisma, prisma } from "~/db.server";

interface PublicWebhookDeliveryRow {
  id: string;
  organizationId: string;
  projectId: string;
  runtimeEnvironmentId: string;
  workflowId: string;
  webhookEndpointId: string;
  deliveryId: string;
  payloadHash: string;
  status: string;
  attempts: number;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  runFriendlyId: string | null;
  failureCode: string | null;
  receivedAt: Date;
  completedAt: Date | null;
}

function mapDelivery(row: PublicWebhookDeliveryRow): PublicWebhookDeliveryRecord {
  if (!(["RECEIVED", "TRIGGERED", "FAILED"] as const).includes(row.status as never)) {
    throw new PublicWebhookDeliveryConcurrencyError("Stored webhook delivery status is invalid.");
  }
  if (!/^[0-9a-f]{64}$/.test(row.payloadHash)) {
    throw new PublicWebhookDeliveryConcurrencyError("Stored webhook payload digest is invalid.");
  }
  if (!Number.isSafeInteger(row.attempts) || row.attempts < 1) {
    throw new PublicWebhookDeliveryConcurrencyError("Stored webhook attempt count is invalid.");
  }
  return {
    storageId: row.id,
    tenantId: row.organizationId,
    projectId: row.projectId,
    environmentId: row.runtimeEnvironmentId,
    workflowId: row.workflowId,
    endpointId: row.webhookEndpointId,
    deliveryId: row.deliveryId,
    payloadHash: row.payloadHash,
    status: row.status as PublicWebhookDeliveryStatus,
    attempts: row.attempts,
    leaseToken: row.leaseToken,
    leaseExpiresAt: row.leaseExpiresAt,
    runFriendlyId: row.runFriendlyId,
    failureCode: row.failureCode,
    receivedAt: row.receivedAt,
    completedAt: row.completedAt,
  };
}

class PrismaPublicWebhookDeliveryTransaction implements PublicWebhookDeliveryTransaction {
  constructor(private readonly tx: PrismaTransactionClient) {}

  async insertDelivery(
    input: ReservePublicWebhookDeliveryInput
  ): Promise<
    | { status: "inserted"; delivery: PublicWebhookDeliveryRecord }
    | { status: "duplicate"; delivery: PublicWebhookDeliveryRecord }
  > {
    const endpoint = await this.tx.flowcordiaWebhookEndpoint.findFirst({
      where: {
        id: input.endpointId,
        organizationId: input.tenantId,
        projectId: input.projectId,
        runtimeEnvironmentId: input.environmentId,
        workflowId: input.workflowId,
        revokedAt: null,
        activeRevisionId: { not: null },
      },
      select: { id: true },
    });
    if (!endpoint) {
      throw new PublicWebhookDeliveryConcurrencyError(
        "Webhook delivery endpoint is not an active immutable production binding."
      );
    }

    const environment = await this.tx.runtimeEnvironment.findFirst({
      where: {
        id: input.environmentId,
        projectId: input.projectId,
        organizationId: input.tenantId,
        type: "PRODUCTION",
        archivedAt: null,
        project: { deletedAt: null },
        organization: { deletedAt: null },
      },
      select: { id: true },
    });
    if (!environment) {
      throw new PublicWebhookDeliveryConcurrencyError(
        "Webhook delivery environment is not the authorized production environment."
      );
    }

    const inserted = await this.tx.flowcordiaPublicWebhookDelivery.createMany({
      data: {
        organizationId: input.tenantId,
        projectId: input.projectId,
        runtimeEnvironmentId: input.environmentId,
        workflowId: input.workflowId,
        webhookEndpointId: input.endpointId,
        deliveryId: input.deliveryId,
        payloadHash: input.payloadHash,
        status: "RECEIVED",
        attempts: 1,
        leaseToken: input.leaseToken,
        leaseExpiresAt: input.leaseExpiresAt,
        receivedAt: input.receivedAt,
      },
      skipDuplicates: true,
    });

    const row = await this.tx.flowcordiaPublicWebhookDelivery.findFirst({
      where: {
        runtimeEnvironmentId: input.environmentId,
        workflowId: input.workflowId,
        webhookEndpointId: input.endpointId,
        deliveryId: input.deliveryId,
      },
    });
    if (!row) {
      throw new PublicWebhookDeliveryConcurrencyError(
        "Webhook delivery reservation changed concurrently."
      );
    }
    return inserted.count === 1
      ? { status: "inserted", delivery: mapDelivery(row) }
      : { status: "duplicate", delivery: mapDelivery(row) };
  }

  async reacquireDelivery(input: {
    storageId: string;
    payloadHash: string;
    now: Date;
    leaseToken: string;
    leaseExpiresAt: Date;
  }): Promise<PublicWebhookDeliveryRecord | null> {
    const updated = await this.tx.flowcordiaPublicWebhookDelivery.updateMany({
      where: {
        id: input.storageId,
        payloadHash: input.payloadHash,
        status: { in: ["RECEIVED", "FAILED"] },
        OR: [
          { status: "FAILED" },
          { leaseToken: null },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: input.now } },
        ],
      },
      data: {
        status: "RECEIVED",
        attempts: { increment: 1 },
        leaseToken: input.leaseToken,
        leaseExpiresAt: input.leaseExpiresAt,
        runFriendlyId: null,
        failureCode: null,
        completedAt: null,
      },
    });
    if (updated.count !== 1) return null;
    const row = await this.tx.flowcordiaPublicWebhookDelivery.findUnique({
      where: { id: input.storageId },
    });
    return row ? mapDelivery(row) : null;
  }

  async completeDelivery(input: {
    storageId: string;
    leaseToken: string;
    runFriendlyId: string;
    completedAt: Date;
  }): Promise<boolean> {
    const updated = await this.tx.flowcordiaPublicWebhookDelivery.updateMany({
      where: {
        id: input.storageId,
        status: "RECEIVED",
        leaseToken: input.leaseToken,
        leaseExpiresAt: { gt: input.completedAt },
      },
      data: {
        status: "TRIGGERED",
        leaseToken: null,
        leaseExpiresAt: null,
        runFriendlyId: input.runFriendlyId,
        failureCode: null,
        completedAt: input.completedAt,
      },
    });
    return updated.count === 1;
  }

  async failDelivery(input: {
    storageId: string;
    leaseToken: string;
    failureCode: string;
    completedAt: Date;
  }): Promise<boolean> {
    const updated = await this.tx.flowcordiaPublicWebhookDelivery.updateMany({
      where: {
        id: input.storageId,
        status: "RECEIVED",
        leaseToken: input.leaseToken,
        leaseExpiresAt: { gt: input.completedAt },
      },
      data: {
        status: "FAILED",
        leaseToken: null,
        leaseExpiresAt: null,
        runFriendlyId: null,
        failureCode: input.failureCode,
        completedAt: input.completedAt,
      },
    });
    return updated.count === 1;
  }
}

export class PrismaPublicWebhookDeliveryStore implements PublicWebhookDeliveryStore {
  async transaction<T>(
    callback: (transaction: PublicWebhookDeliveryTransaction) => Promise<T>
  ): Promise<T> {
    try {
      const result = await $transaction(
        prisma,
        "flowcordia.public-webhook-delivery.transaction",
        async (transaction) => callback(new PrismaPublicWebhookDeliveryTransaction(transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (result === undefined) {
        throw new PublicWebhookDeliveryConcurrencyError("Webhook delivery transaction aborted.");
      }
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new PublicWebhookDeliveryConcurrencyError(
          "Serializable webhook delivery transaction conflicted."
        );
      }
      throw error;
    }
  }
}

export const flowcordiaPublicWebhookDeliveryStore = new PrismaPublicWebhookDeliveryStore();
