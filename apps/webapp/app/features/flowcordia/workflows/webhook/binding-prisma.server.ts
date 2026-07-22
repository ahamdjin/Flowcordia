import {
  ProductionWebhookBindingConcurrencyError,
  type ProductionWebhookBindingRevisionInput,
  type ProductionWebhookBindingScope,
  type ProductionWebhookRevocationReason,
  type ProductionWebhookBindingStore,
  type ProductionWebhookBindingTransaction,
  type ProductionWebhookEndpointRecord,
  type ProductionWebhookRevisionRecord,
} from "@flowcordia/control-plane";
import type { PrismaTransactionClient } from "~/db.server";
import { $transaction, Prisma, prisma } from "~/db.server";

interface EndpointRow {
  id: string;
  publicId: string;
  organizationId: string;
  projectId: string;
  runtimeEnvironmentId: string;
  workflowId: string;
  nodeId: string;
  activeRevisionId: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  revocationReason: string | null;
}

const endpointSelect = {
  id: true,
  publicId: true,
  organizationId: true,
  projectId: true,
  runtimeEnvironmentId: true,
  workflowId: true,
  nodeId: true,
  activeRevisionId: true,
  revokedAt: true,
  revokedByUserId: true,
  revocationReason: true,
} as const;

const revisionSelect = {
  id: true,
  endpointId: true,
  revision: true,
  fingerprint: true,
  nodeId: true,
  proposalId: true,
  mergeCommitSha: true,
  workflowPath: true,
  workflowBlobSha: true,
  workflowCanonicalSha256: true,
  deploymentId: true,
  deploymentShortCode: true,
  workerId: true,
  workerVersion: true,
  taskIdentifier: true,
  method: true,
  path: true,
  maxBodyBytes: true,
  timestampToleranceSeconds: true,
  credentialReference: true,
  credentialEnvironmentName: true,
  credentialVersion: true,
  createdAt: true,
  endpoint: {
    select: {
      organizationId: true,
      projectId: true,
      runtimeEnvironmentId: true,
      workflowId: true,
      nodeId: true,
    },
  },
} as const;

function mapEndpoint(row: EndpointRow): ProductionWebhookEndpointRecord {
  return {
    storageId: row.id,
    publicId: row.publicId,
    tenantId: row.organizationId,
    projectId: row.projectId,
    environmentId: row.runtimeEnvironmentId,
    workflowId: row.workflowId,
    nodeId: row.nodeId,
    activeRevisionId: row.activeRevisionId,
    revokedAt: row.revokedAt,
    revokedByUserId: row.revokedByUserId,
    revocationReason: row.revocationReason as ProductionWebhookRevocationReason | null,
  };
}

function mapRevision(row: {
  id: string;
  endpointId: string;
  revision: number;
  fingerprint: string;
  nodeId: string;
  proposalId: string;
  mergeCommitSha: string;
  workflowPath: string;
  workflowBlobSha: string;
  workflowCanonicalSha256: string;
  deploymentId: string;
  deploymentShortCode: string;
  workerId: string;
  workerVersion: string;
  taskIdentifier: string;
  method: string;
  path: string;
  maxBodyBytes: number;
  timestampToleranceSeconds: number;
  credentialReference: string;
  credentialEnvironmentName: string;
  credentialVersion: string;
  createdAt: Date;
  endpoint: {
    organizationId: string;
    projectId: string;
    runtimeEnvironmentId: string;
    workflowId: string;
    nodeId: string;
  };
}): ProductionWebhookRevisionRecord {
  if (row.endpoint.nodeId !== row.nodeId) {
    throw new ProductionWebhookBindingConcurrencyError();
  }
  return {
    storageId: row.id,
    endpointId: row.endpointId,
    revision: row.revision,
    fingerprint: row.fingerprint,
    tenantId: row.endpoint.organizationId,
    projectId: row.endpoint.projectId,
    environmentId: row.endpoint.runtimeEnvironmentId,
    workflowId: row.endpoint.workflowId,
    nodeId: row.endpoint.nodeId,
    proposalId: row.proposalId,
    mergeCommitSha: row.mergeCommitSha,
    workflowPath: row.workflowPath,
    workflowBlobSha: row.workflowBlobSha,
    workflowCanonicalSha256: row.workflowCanonicalSha256,
    deploymentId: row.deploymentId,
    deploymentShortCode: row.deploymentShortCode,
    workerId: row.workerId,
    workerVersion: row.workerVersion,
    taskIdentifier: row.taskIdentifier,
    method: row.method,
    path: row.path,
    maxBodyBytes: row.maxBodyBytes,
    timestampToleranceSeconds: row.timestampToleranceSeconds,
    credentialReference: row.credentialReference,
    credentialEnvironmentName: row.credentialEnvironmentName,
    credentialVersion: row.credentialVersion,
    createdAt: row.createdAt,
  };
}

class PrismaProductionWebhookBindingTransaction implements ProductionWebhookBindingTransaction {
  constructor(private readonly tx: PrismaTransactionClient) {}

  async ensureEndpoint(input: {
    scope: ProductionWebhookBindingScope;
    publicId: string;
    now: Date;
  }): Promise<ProductionWebhookEndpointRecord> {
    const environment = await this.tx.runtimeEnvironment.findFirst({
      where: {
        id: input.scope.environmentId,
        projectId: input.scope.projectId,
        organizationId: input.scope.tenantId,
        type: "PRODUCTION",
        archivedAt: null,
        project: { deletedAt: null },
        organization: { deletedAt: null },
      },
      select: { id: true },
    });
    if (!environment) throw new ProductionWebhookBindingConcurrencyError();

    const endpoint = await this.tx.flowcordiaWebhookEndpoint.upsert({
      where: {
        runtimeEnvironmentId_workflowId_nodeId: {
          runtimeEnvironmentId: input.scope.environmentId,
          workflowId: input.scope.workflowId,
          nodeId: input.scope.nodeId,
        },
      },
      create: {
        publicId: input.publicId,
        organizationId: input.scope.tenantId,
        projectId: input.scope.projectId,
        runtimeEnvironmentId: input.scope.environmentId,
        workflowId: input.scope.workflowId,
        nodeId: input.scope.nodeId,
        createdAt: input.now,
      },
      update: {},
      select: endpointSelect,
    });
    if (
      endpoint.organizationId !== input.scope.tenantId ||
      endpoint.projectId !== input.scope.projectId ||
      endpoint.nodeId !== input.scope.nodeId
    ) {
      throw new ProductionWebhookBindingConcurrencyError();
    }
    return mapEndpoint(endpoint);
  }

  async findRevisionByFingerprint(input: {
    endpointId: string;
    fingerprint: string;
  }): Promise<ProductionWebhookRevisionRecord | null> {
    const revision = await this.tx.flowcordiaWebhookRevision.findUnique({
      where: {
        endpointId_fingerprint: {
          endpointId: input.endpointId,
          fingerprint: input.fingerprint,
        },
      },
      select: revisionSelect,
    });
    return revision ? mapRevision(revision) : null;
  }

  async createRevision(input: {
    endpointId: string;
    fingerprint: string;
    binding: ProductionWebhookBindingRevisionInput;
    createdAt: Date;
  }): Promise<ProductionWebhookRevisionRecord> {
    const endpoint = await this.tx.flowcordiaWebhookEndpoint.findFirst({
      where: {
        id: input.endpointId,
        organizationId: input.binding.tenantId,
        projectId: input.binding.projectId,
        runtimeEnvironmentId: input.binding.environmentId,
        workflowId: input.binding.workflowId,
        nodeId: input.binding.nodeId,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!endpoint) throw new ProductionWebhookBindingConcurrencyError();

    const latest = await this.tx.flowcordiaWebhookRevision.findFirst({
      where: { endpointId: input.endpointId },
      orderBy: [{ revision: "desc" }, { id: "desc" }],
      select: { revision: true },
    });
    const revision = await this.tx.flowcordiaWebhookRevision.create({
      data: {
        endpointId: input.endpointId,
        revision: (latest?.revision ?? 0) + 1,
        fingerprint: input.fingerprint,
        nodeId: input.binding.nodeId,
        proposalId: input.binding.proposalId,
        mergeCommitSha: input.binding.mergeCommitSha,
        workflowPath: input.binding.workflowPath,
        workflowBlobSha: input.binding.workflowBlobSha,
        workflowCanonicalSha256: input.binding.workflowCanonicalSha256,
        deploymentId: input.binding.deploymentId,
        deploymentShortCode: input.binding.deploymentShortCode,
        workerId: input.binding.workerId,
        workerVersion: input.binding.workerVersion,
        taskIdentifier: input.binding.taskIdentifier,
        method: input.binding.method,
        path: input.binding.path,
        maxBodyBytes: input.binding.maxBodyBytes,
        timestampToleranceSeconds: input.binding.timestampToleranceSeconds,
        credentialReference: input.binding.credentialReference,
        credentialEnvironmentName: input.binding.credentialEnvironmentName,
        credentialVersion: input.binding.credentialVersion,
        createdAt: input.createdAt,
      },
      select: revisionSelect,
    });
    return mapRevision(revision);
  }

  async activateRevision(input: {
    endpointId: string;
    revisionId: string;
    activatedAt: Date;
  }): Promise<boolean> {
    const updated = await this.tx.flowcordiaWebhookEndpoint.updateMany({
      where: {
        id: input.endpointId,
        revokedAt: null,
        revisions: { some: { id: input.revisionId } },
      },
      data: {
        activeRevisionId: input.revisionId,
        updatedAt: input.activatedAt,
      },
    });
    return updated.count === 1;
  }

  async revokeEndpoint(input: {
    scope: ProductionWebhookBindingScope;
    expectedPublicId: string;
    actorId: string;
    reason: ProductionWebhookRevocationReason;
    revokedAt: Date;
  }) {
    const where = {
      organizationId: input.scope.tenantId,
      projectId: input.scope.projectId,
      runtimeEnvironmentId: input.scope.environmentId,
      workflowId: input.scope.workflowId,
      nodeId: input.scope.nodeId,
      publicId: input.expectedPublicId,
    } as const;
    const endpoint = await this.tx.flowcordiaWebhookEndpoint.findFirst({
      where,
      select: endpointSelect,
    });
    if (!endpoint || !endpoint.activeRevisionId) return { status: "not_found" as const };
    if (endpoint.revokedAt) {
      return { status: "already_revoked" as const, endpoint: mapEndpoint(endpoint) };
    }

    const updated = await this.tx.flowcordiaWebhookEndpoint.updateMany({
      where: {
        id: endpoint.id,
        ...where,
        activeRevisionId: { not: null },
        revokedAt: null,
      },
      data: {
        revokedAt: input.revokedAt,
        revokedByUserId: input.actorId,
        revocationReason: input.reason,
        updatedAt: input.revokedAt,
      },
    });
    if (updated.count !== 1) {
      const current = await this.tx.flowcordiaWebhookEndpoint.findFirst({
        where,
        select: endpointSelect,
      });
      if (!current) return { status: "not_found" as const };
      if (current.revokedAt) {
        return { status: "already_revoked" as const, endpoint: mapEndpoint(current) };
      }
      throw new ProductionWebhookBindingConcurrencyError();
    }

    const revoked = await this.tx.flowcordiaWebhookEndpoint.findUnique({
      where: { id: endpoint.id },
      select: endpointSelect,
    });
    if (!revoked) throw new ProductionWebhookBindingConcurrencyError();
    return { status: "revoked" as const, endpoint: mapEndpoint(revoked) };
  }
}

export class PrismaProductionWebhookBindingStore implements ProductionWebhookBindingStore {
  async transaction<T>(
    callback: (transaction: ProductionWebhookBindingTransaction) => Promise<T>
  ): Promise<T> {
    try {
      const result = await $transaction(
        prisma,
        "flowcordia.production-webhook-binding.transaction",
        async (transaction) => callback(new PrismaProductionWebhookBindingTransaction(transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (result === undefined) throw new ProductionWebhookBindingConcurrencyError();
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      ) {
        throw new ProductionWebhookBindingConcurrencyError();
      }
      throw error;
    }
  }
}

export const flowcordiaProductionWebhookBindingStore = new PrismaProductionWebhookBindingStore();
