import {
  ProposalConcurrencyError,
  ProposalPersistenceError,
  type ControlPlaneScope,
  type JsonValue,
  type LeasedOutboxEvent,
  type OutboxEventInput,
  type ProposalAuditEventInput,
  type ProposalListQuery,
  type ProposalState,
  type ProposalStore,
  type ProposalTransaction,
  type WebhookDeliveryInput,
  type WebhookDeliveryStatus,
  type WebhookProposalLookup,
  type WorkflowProposalAggregate,
  proposalStates,
  proposalEventTypes,
} from "@flowcordia/control-plane";
import type { PrismaTransactionClient } from "~/db.server";
import { $transaction, Prisma, prisma } from "~/db.server";

interface ProposalRow {
  id: string;
  proposalId: string;
  workflowId: string;
  workflowPath: string;
  desiredWorkflowSha256: string;
  organizationId: string;
  projectId: string;
  appInstallationId: bigint;
  repositoryId: string;
  repositoryGithubId: bigint;
  repositoryOwner: string;
  repositoryName: string;
  baseBranch: string;
  baseCommitSha: string;
  expectedBaseBlobSha: string | null;
  proposalBranch: string;
  creatorReviewerId: string | null;
  createdByUserId: string;
  state: string;
  operation: string;
  headSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  pullRequestDraft: boolean | null;
  pullRequestState: string | null;
  merged: boolean;
  mergeCommitSha: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastCorrelationId: string;
  lastGithubEventAt: Date | null;
  lastPullRequestEventAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface OutboxRow {
  id: string;
  dedupeKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  organizationId: string;
  payload: Prisma.JsonValue;
  occurredAt: Date;
  availableAt: Date;
  attempts: number;
  lockToken: string;
  lockExpiresAt: Date;
}

function decimalBigInt(value: string, field: string): bigint {
  if (!/^[1-9][0-9]{0,39}$/.test(value)) {
    throw new ProposalPersistenceError(`${field} must be a positive decimal identifier.`);
  }
  return BigInt(value);
}

function appInstallationBigInt(value: number): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ProposalPersistenceError("GitHub installation ID is invalid.");
  }
  return BigInt(value);
}

function mapProposal(row: ProposalRow): WorkflowProposalAggregate {
  if (!/^[0-9a-f]{64}$/.test(row.desiredWorkflowSha256)) {
    throw new ProposalPersistenceError("Stored desired workflow digest is invalid.");
  }
  const installationId = Number(row.appInstallationId);
  if (!Number.isSafeInteger(installationId) || BigInt(installationId) !== row.appInstallationId) {
    throw new ProposalPersistenceError("Stored GitHub installation ID is invalid.");
  }
  if (!proposalStates.includes(row.state as ProposalState)) {
    throw new ProposalPersistenceError("Stored proposal state is invalid.");
  }
  if (!(["create", "submit", "promote"] as const).includes(row.operation as never)) {
    throw new ProposalPersistenceError("Stored proposal operation is invalid.");
  }
  if (
    row.pullRequestState !== null &&
    row.pullRequestState !== "open" &&
    row.pullRequestState !== "closed"
  ) {
    throw new ProposalPersistenceError("Stored pull request state is invalid.");
  }
  return {
    storageId: row.id,
    proposalId: row.proposalId,
    workflowId: row.workflowId,
    workflowPath: row.workflowPath,
    desiredWorkflowSha256: row.desiredWorkflowSha256,
    tenantId: row.organizationId,
    projectId: row.projectId,
    installationId,
    repositoryId: row.repositoryId,
    repositoryGithubId: row.repositoryGithubId.toString(),
    repository: {
      owner: row.repositoryOwner,
      name: row.repositoryName,
      branch: row.baseBranch,
    },
    baseBranch: row.baseBranch,
    baseCommitSha: row.baseCommitSha,
    expectedBaseBlobSha: row.expectedBaseBlobSha,
    proposalBranch: row.proposalBranch,
    creatorReviewerId: row.creatorReviewerId,
    createdByUserId: row.createdByUserId,
    state: row.state as ProposalState,
    operation: row.operation as WorkflowProposalAggregate["operation"],
    headSha: row.headSha,
    pullRequestNumber: row.pullRequestNumber,
    pullRequestUrl: row.pullRequestUrl,
    pullRequestDraft: row.pullRequestDraft,
    pullRequestState: row.pullRequestState,
    merged: row.merged,
    mergeCommitSha: row.mergeCommitSha,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    lastCorrelationId: row.lastCorrelationId,
    lastGithubEventAt: row.lastGithubEventAt,
    lastPullRequestEventAt: row.lastPullRequestEventAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function json(value: JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

class PrismaProposalTransaction implements ProposalTransaction {
  constructor(private readonly tx: PrismaTransactionClient) {}

  async findProposal(
    scope: ControlPlaneScope,
    proposalId: string
  ): Promise<WorkflowProposalAggregate | null> {
    const row = await this.tx.flowcordiaWorkflowProposal.findFirst({
      where: {
        proposalId,
        organizationId: scope.tenantId,
        projectId: scope.projectId,
        repositoryId: scope.repositoryId,
        repositoryGithubId: decimalBigInt(scope.repositoryGithubId, "GitHub repository ID"),
        appInstallationId: appInstallationBigInt(scope.installationId),
      },
    });
    return row ? mapProposal(row) : null;
  }

  async findProposalForWebhook(
    lookup: WebhookProposalLookup
  ): Promise<WorkflowProposalAggregate | null> {
    const pullRequestEvent =
      lookup.eventName === "pull_request" || lookup.eventName === "pull_request_review";
    if (
      (pullRequestEvent && lookup.pullRequestNumber === null) ||
      (!pullRequestEvent && lookup.headSha === null)
    ) {
      return null;
    }
    const row = await this.tx.flowcordiaWorkflowProposal.findFirst({
      where: {
        appInstallationId: appInstallationBigInt(lookup.installationId),
        repositoryGithubId: decimalBigInt(lookup.repositoryGithubId, "GitHub repository ID"),
        ...(pullRequestEvent
          ? { pullRequestNumber: lookup.pullRequestNumber }
          : { headSha: lookup.headSha }),
      },
      orderBy: { updatedAt: "desc" },
    });
    return row ? mapProposal(row) : null;
  }

  async insertProposal(
    input: Omit<WorkflowProposalAggregate, "storageId" | "version" | "createdAt" | "updatedAt">
  ): Promise<WorkflowProposalAggregate> {
    const appInstallationId = appInstallationBigInt(input.installationId);
    const repositoryGithubId = decimalBigInt(input.repositoryGithubId, "GitHub repository ID");
    const repository = await this.tx.githubRepository.findFirst({
      where: {
        id: input.repositoryId,
        githubId: repositoryGithubId,
        installation: {
          appInstallationId,
          organizationId: input.tenantId,
          deletedAt: null,
          suspendedAt: null,
        },
        ConnectedGithubRepository: { some: { projectId: input.projectId } },
      },
      select: { installationId: true },
    });
    if (!repository) {
      throw new ProposalPersistenceError(
        "Proposal repository is not connected to the authorized project and installation."
      );
    }
    try {
      const row = await this.tx.flowcordiaWorkflowProposal.create({
        data: {
          proposalId: input.proposalId,
          workflowId: input.workflowId,
          workflowPath: input.workflowPath,
          desiredWorkflowSha256: input.desiredWorkflowSha256,
          organizationId: input.tenantId,
          projectId: input.projectId,
          githubAppInstallationId: repository.installationId,
          appInstallationId,
          repositoryId: input.repositoryId,
          repositoryGithubId,
          repositoryOwner: input.repository.owner,
          repositoryName: input.repository.name,
          baseBranch: input.baseBranch,
          baseCommitSha: input.baseCommitSha,
          expectedBaseBlobSha: input.expectedBaseBlobSha,
          proposalBranch: input.proposalBranch,
          creatorReviewerId: input.creatorReviewerId,
          createdByUserId: input.createdByUserId,
          state: input.state,
          operation: input.operation,
          lastCorrelationId: input.lastCorrelationId,
        },
      });
      return mapProposal(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ProposalConcurrencyError("Proposal identity already exists.");
      }
      throw error;
    }
  }

  async updateProposal(input: {
    storageId: string;
    expectedVersion: number;
    patch: Partial<
      Omit<
        WorkflowProposalAggregate,
        | "storageId"
        | "proposalId"
        | "tenantId"
        | "projectId"
        | "repositoryId"
        | "repositoryGithubId"
        | "createdAt"
        | "version"
      >
    >;
  }): Promise<WorkflowProposalAggregate> {
    const patch = input.patch;
    const updated = await this.tx.flowcordiaWorkflowProposal.updateMany({
      where: { id: input.storageId, version: input.expectedVersion },
      data: {
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.operation !== undefined ? { operation: patch.operation } : {}),
        ...(patch.proposalBranch !== undefined ? { proposalBranch: patch.proposalBranch } : {}),
        ...(patch.headSha !== undefined ? { headSha: patch.headSha } : {}),
        ...(patch.pullRequestNumber !== undefined
          ? { pullRequestNumber: patch.pullRequestNumber }
          : {}),
        ...(patch.pullRequestUrl !== undefined ? { pullRequestUrl: patch.pullRequestUrl } : {}),
        ...(patch.pullRequestDraft !== undefined
          ? { pullRequestDraft: patch.pullRequestDraft }
          : {}),
        ...(patch.pullRequestState !== undefined
          ? { pullRequestState: patch.pullRequestState }
          : {}),
        ...(patch.merged !== undefined ? { merged: patch.merged } : {}),
        ...(patch.mergeCommitSha !== undefined ? { mergeCommitSha: patch.mergeCommitSha } : {}),
        ...(patch.lastErrorCode !== undefined ? { lastErrorCode: patch.lastErrorCode } : {}),
        ...(patch.lastErrorMessage !== undefined
          ? { lastErrorMessage: patch.lastErrorMessage }
          : {}),
        ...(patch.lastCorrelationId !== undefined
          ? { lastCorrelationId: patch.lastCorrelationId }
          : {}),
        ...(patch.lastGithubEventAt !== undefined
          ? { lastGithubEventAt: patch.lastGithubEventAt }
          : {}),
        ...(patch.lastPullRequestEventAt !== undefined
          ? { lastPullRequestEventAt: patch.lastPullRequestEventAt }
          : {}),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ProposalConcurrencyError("Proposal version changed.");
    }
    const row = await this.tx.flowcordiaWorkflowProposal.findUnique({
      where: { id: input.storageId },
    });
    if (!row) throw new ProposalConcurrencyError("Proposal was deleted concurrently.");
    return mapProposal(row);
  }

  async appendAudit(input: ProposalAuditEventInput): Promise<void> {
    await this.tx.flowcordiaProposalAuditEvent.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: {
        proposalStorageId: input.proposalStorageId,
        eventType: input.eventType,
        actorId: input.actorId,
        correlationId: input.correlationId,
        dedupeKey: input.dedupeKey,
        payload: json(input.payload),
        occurredAt: input.occurredAt,
      },
    });
  }

  async enqueueOutbox(input: OutboxEventInput): Promise<void> {
    await this.tx.flowcordiaOutboxEvent.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: {
        organizationId: input.tenantId,
        dedupeKey: input.dedupeKey,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: json(input.payload),
        occurredAt: input.occurredAt,
        availableAt: input.availableAt,
      },
    });
  }

  async insertWebhookDelivery(
    input: WebhookDeliveryInput
  ): Promise<{ status: "inserted" } | { status: "duplicate"; payloadHash: string }> {
    // Avoid an expected unique violation: PostgreSQL would abort the surrounding transaction
    // before we could compare the existing delivery hash.
    const inserted = await this.tx.flowcordiaGithubWebhookDelivery.createMany({
      data: {
        deliveryId: input.deliveryId,
        eventName: input.eventName,
        action: input.action,
        appInstallationId: appInstallationBigInt(input.installationId),
        repositoryGithubId: decimalBigInt(input.repositoryGithubId, "GitHub repository ID"),
        payloadHash: input.payloadHash,
        normalizedPayload: json(input.normalizedPayload),
        receivedAt: input.receivedAt,
      },
      skipDuplicates: true,
    });
    if (inserted.count === 1) return { status: "inserted" };
    const existing = await this.tx.flowcordiaGithubWebhookDelivery.findUnique({
      where: { deliveryId: input.deliveryId },
      select: { payloadHash: true },
    });
    if (!existing) throw new ProposalConcurrencyError("Webhook delivery changed concurrently.");
    return { status: "duplicate", payloadHash: existing.payloadHash };
  }

  async completeWebhookDelivery(input: {
    deliveryId: string;
    status: Exclude<WebhookDeliveryStatus, "RECEIVED">;
    proposalStorageId: string | null;
    failureCode?: string;
    completedAt: Date;
  }): Promise<void> {
    const result = await this.tx.flowcordiaGithubWebhookDelivery.updateMany({
      where: { deliveryId: input.deliveryId, status: "RECEIVED" },
      data: {
        status: input.status,
        proposalStorageId: input.proposalStorageId,
        failureCode: input.failureCode,
        completedAt: input.completedAt,
      },
    });
    if (result.count !== 1) {
      throw new ProposalConcurrencyError("Webhook delivery was completed concurrently.");
    }
  }
}

export class PrismaProposalStore implements ProposalStore {
  async transaction<T>(callback: (transaction: ProposalTransaction) => Promise<T>): Promise<T> {
    try {
      const result = await $transaction(
        prisma,
        "flowcordia.proposal.transaction",
        async (transaction) => callback(new PrismaProposalTransaction(transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (result === undefined) throw new ProposalPersistenceError("Proposal transaction aborted.");
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new ProposalConcurrencyError("Serializable proposal transaction conflicted.");
      }
      throw error;
    }
  }

  async listProposals(query: ProposalListQuery): Promise<WorkflowProposalAggregate[]> {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      throw new ProposalPersistenceError("Proposal list limit is invalid.");
    }
    if (query.cursor && Number.isNaN(query.cursor.updatedAt.getTime())) {
      throw new ProposalPersistenceError("Proposal list cursor is invalid.");
    }
    const rows = await prisma.flowcordiaWorkflowProposal.findMany({
      where: {
        organizationId: query.tenantId,
        projectId: query.projectId,
        repositoryId: query.repositoryId,
        ...(query.states ? { state: { in: [...query.states] } } : {}),
        ...(query.cursor
          ? {
              OR: [
                { updatedAt: { lt: query.cursor.updatedAt } },
                {
                  updatedAt: query.cursor.updatedAt,
                  id: { lt: query.cursor.storageId },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit,
    });
    return rows.map(mapProposal);
  }

  async claimOutbox(input: {
    workerId: string;
    lockToken: string;
    limit: number;
    now: Date;
    lockExpiresAt: Date;
  }): Promise<LeasedOutboxEvent[]> {
    const result = await $transaction(prisma, "flowcordia.outbox.claim", async (transaction) =>
      transaction.$queryRaw<OutboxRow[]>(Prisma.sql`
          WITH candidates AS (
            SELECT "id"
            FROM "FlowcordiaOutboxEvent"
            WHERE "publishedAt" IS NULL
              AND "availableAt" <= ${input.now}
              AND ("lockExpiresAt" IS NULL OR "lockExpiresAt" <= ${input.now})
            ORDER BY "availableAt" ASC, "id" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${input.limit}
          )
          UPDATE "FlowcordiaOutboxEvent" AS event
          SET "lockedBy" = ${input.workerId},
              "lockToken" = ${input.lockToken},
              "lockExpiresAt" = ${input.lockExpiresAt},
              "attempts" = event."attempts" + 1,
              "updatedAt" = ${input.now}
          FROM candidates
          WHERE event."id" = candidates."id"
          RETURNING event.*
        `)
    );
    if (result === undefined) throw new ProposalPersistenceError("Outbox claim aborted.");
    return result.map((row) => {
      if (
        row.aggregateType !== "flowcordia.workflow_proposal" ||
        !proposalEventTypes.includes(row.eventType as LeasedOutboxEvent["eventType"])
      ) {
        throw new ProposalPersistenceError("Stored outbox event identity is invalid.");
      }
      return {
        id: row.id,
        dedupeKey: row.dedupeKey,
        eventType: row.eventType as LeasedOutboxEvent["eventType"],
        aggregateType: "flowcordia.workflow_proposal",
        aggregateId: row.aggregateId,
        tenantId: row.organizationId,
        payload: row.payload as JsonValue,
        occurredAt: row.occurredAt,
        availableAt: row.availableAt,
        attempts: row.attempts,
        lockToken: row.lockToken,
        lockExpiresAt: row.lockExpiresAt,
      };
    });
  }

  async acknowledgeOutbox(input: {
    id: string;
    lockToken: string;
    publishedAt: Date;
  }): Promise<boolean> {
    const result = await prisma.flowcordiaOutboxEvent.updateMany({
      where: { id: input.id, lockToken: input.lockToken, publishedAt: null },
      data: {
        publishedAt: input.publishedAt,
        lockedBy: null,
        lockToken: null,
        lockExpiresAt: null,
        lastError: null,
      },
    });
    return result.count === 1;
  }

  async releaseOutbox(input: {
    id: string;
    lockToken: string;
    availableAt: Date;
    lastError: string;
  }): Promise<boolean> {
    const result = await prisma.flowcordiaOutboxEvent.updateMany({
      where: { id: input.id, lockToken: input.lockToken, publishedAt: null },
      data: {
        availableAt: input.availableAt,
        lastError: input.lastError,
        lockedBy: null,
        lockToken: null,
        lockExpiresAt: null,
      },
    });
    return result.count === 1;
  }
}

export const flowcordiaProposalStore = new PrismaProposalStore();
