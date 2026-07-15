import type {
  GitHubProposalAuditReceipt,
  GitHubProposalError,
  GitHubProposalReference,
} from "@flowcordia/github-proposals";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { vi } from "vitest";

import {
  ProposalConcurrencyError,
  type ControlPlaneScope,
  type GitHubProposalGateway,
  type LeasedOutboxEvent,
  type LeasedProposalReconciliation,
  type OutboxEventInput,
  type ProposalAuditEventInput,
  type ProposalListQuery,
  type ProposalReconciliationEventInput,
  type ProposalStore,
  type ProposalTransaction,
  type ReconciliationFailureCode,
  type WebhookDeliveryInput,
  type WebhookDeliveryStatus,
  type WebhookProposalLookup,
  type WorkflowProposalAggregate,
} from "../src/index.js";

export const BASE_SHA = "a".repeat(40);
export const HEAD_SHA = "b".repeat(40);
export const MERGE_SHA = "c".repeat(40);
export const BASE_BLOB_SHA = "d".repeat(40);
export const PROPOSAL_ID = "proposal_0001";
export const NOW = new Date("2026-07-15T08:00:00.000Z");

export function createScope(overrides: Partial<ControlPlaneScope> = {}): ControlPlaneScope {
  return {
    tenantId: "tenant_1",
    projectId: "project_1",
    installationId: 42,
    repositoryId: "repo_db_1",
    repositoryGithubId: "987654",
    repository: { owner: "acme", name: "automations", branch: "main" },
    ...overrides,
  };
}

export function createWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "order_intake",
    name: "Order intake",
    nodes: [
      {
        id: "order_created",
        name: "Order created",
        kind: "trigger",
        operation: "webhook.receive",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "route_order",
        name: "Route order",
        kind: "action",
        operation: "http.request",
        position: { x: 300, y: 0 },
        configuration: { url: "https://example.test/orders" },
      },
    ],
    edges: [{ id: "created_to_route", source: "order_created", target: "route_order" }],
  };
}

export function createReference(
  overrides: Partial<GitHubProposalReference> = {}
): GitHubProposalReference {
  return {
    repository: { owner: "acme", name: "automations", branch: "main" },
    proposalId: PROPOSAL_ID,
    workflowId: "order_intake",
    baseBranch: "main",
    baseCommitSha: BASE_SHA,
    creatorReviewerId: "300",
    branch: "flowcordia/proposals/order_intake/proposal_0001",
    headSha: HEAD_SHA,
    pullRequestNumber: 17,
    pullRequestUrl: "https://github.com/acme/automations/pull/17",
    draft: true,
    state: "open",
    merged: false,
    ...overrides,
  };
}

export function createReceipt(
  operation: "create" | "submit" | "promote",
  overrides: Partial<GitHubProposalAuditReceipt> = {}
): GitHubProposalAuditReceipt {
  return {
    operation,
    outcome: operation === "create" ? "created" : operation === "submit" ? "submitted" : "promoted",
    tenantId: "tenant_1",
    projectId: "project_1",
    installationId: 42,
    repository: { owner: "acme", name: "automations", branch: "main" },
    proposalId: PROPOSAL_ID,
    workflowId: "order_intake",
    baseBranch: "main",
    proposalBranch: "flowcordia/proposals/order_intake/proposal_0001",
    baseCommitSha: BASE_SHA,
    headSha: HEAD_SHA,
    pullRequestNumber: 17,
    actorId: "user_42",
    correlationId: `request_${operation}`,
    creatorReviewerId: "300",
    ...(operation === "promote" ? { mergeCommitSha: MERGE_SHA } : {}),
    ...overrides,
  };
}

export function githubError(overrides: Partial<GitHubProposalError> = {}): GitHubProposalError {
  return {
    code: "unavailable",
    operation: "create",
    phase: "pull_request",
    message: "GitHub is temporarily unavailable.",
    retryable: true,
    ...overrides,
  };
}

interface StoredOutbox extends OutboxEventInput {
  id: string;
  attempts: number;
  lockToken: string | null;
  lockedBy: string | null;
  lockExpiresAt: Date | null;
  publishedAt: Date | null;
  lastError: string | null;
}

interface StoredDelivery extends WebhookDeliveryInput {
  status: WebhookDeliveryStatus;
  proposalStorageId: string | null;
  completedAt: Date | null;
  failureCode: string | null;
}

interface StoredReconciliation {
  proposalStorageId: string;
  availableAt: Date;
  attempts: number;
  lockToken: string | null;
  lockedBy: string | null;
  lockExpiresAt: Date | null;
  lastErrorCode: ReconciliationFailureCode | null;
  lastErrorMessage: string | null;
}

export class InMemoryProposalStore implements ProposalStore, ProposalTransaction {
  readonly proposals = new Map<string, WorkflowProposalAggregate>();
  readonly audits = new Map<string, ProposalAuditEventInput>();
  readonly outbox = new Map<string, StoredOutbox>();
  readonly deliveries = new Map<string, StoredDelivery>();
  readonly reconciliations = new Map<string, StoredReconciliation>();
  #proposalSequence = 0;
  #outboxSequence = 0;

  async transaction<T>(callback: (transaction: ProposalTransaction) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async findProposal(
    scope: ControlPlaneScope,
    proposalId: string
  ): Promise<WorkflowProposalAggregate | null> {
    return (
      [...this.proposals.values()].find(
        (proposal) =>
          proposal.proposalId === proposalId &&
          proposal.tenantId === scope.tenantId &&
          proposal.projectId === scope.projectId &&
          proposal.installationId === scope.installationId &&
          proposal.repositoryId === scope.repositoryId &&
          proposal.repositoryGithubId === scope.repositoryGithubId
      ) ?? null
    );
  }

  async findProposalForWebhook(
    lookup: WebhookProposalLookup
  ): Promise<WorkflowProposalAggregate | null> {
    return (
      [...this.proposals.values()].find(
        (proposal) =>
          proposal.installationId === lookup.installationId &&
          proposal.repositoryGithubId === lookup.repositoryGithubId &&
          (lookup.eventName === "pull_request" || lookup.eventName === "pull_request_review"
            ? lookup.pullRequestNumber !== null &&
              proposal.pullRequestNumber === lookup.pullRequestNumber
            : lookup.headSha !== null && proposal.headSha === lookup.headSha)
      ) ?? null
    );
  }

  async insertProposal(
    input: Omit<WorkflowProposalAggregate, "storageId" | "version" | "createdAt" | "updatedAt">
  ): Promise<WorkflowProposalAggregate> {
    if (
      [...this.proposals.values()].some(
        (proposal) =>
          proposal.repositoryId === input.repositoryId && proposal.proposalId === input.proposalId
      )
    ) {
      throw new ProposalConcurrencyError("Proposal identity already exists.");
    }
    const created = {
      ...input,
      repository: { ...input.repository },
      storageId: `stored_${++this.#proposalSequence}`,
      version: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.proposals.set(created.storageId, created);
    this.reconciliations.set(created.storageId, {
      proposalStorageId: created.storageId,
      availableAt: created.updatedAt,
      attempts: 0,
      lockToken: null,
      lockedBy: null,
      lockExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    return created;
  }

  async updateProposal(input: {
    storageId: string;
    expectedVersion: number;
    patch: Partial<WorkflowProposalAggregate>;
  }): Promise<WorkflowProposalAggregate> {
    const current = this.proposals.get(input.storageId);
    if (!current || current.version !== input.expectedVersion) {
      throw new ProposalConcurrencyError("Proposal version changed.");
    }
    const updated = {
      ...current,
      ...input.patch,
      storageId: current.storageId,
      proposalId: current.proposalId,
      tenantId: current.tenantId,
      projectId: current.projectId,
      repositoryId: current.repositoryId,
      repositoryGithubId: current.repositoryGithubId,
      version: current.version + 1,
      createdAt: current.createdAt,
      updatedAt: NOW,
    };
    this.proposals.set(updated.storageId, updated);
    if (
      ["CREATING", "DRAFT", "READY", "PROMOTING", "RECONCILING"].includes(updated.state) &&
      !this.reconciliations.has(updated.storageId)
    ) {
      this.reconciliations.set(updated.storageId, {
        proposalStorageId: updated.storageId,
        availableAt: updated.updatedAt,
        attempts: 0,
        lockToken: null,
        lockedBy: null,
        lockExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      });
    }
    return updated;
  }

  async appendAudit(input: ProposalAuditEventInput): Promise<void> {
    this.audits.set(input.dedupeKey, input);
  }

  async enqueueOutbox(input: OutboxEventInput): Promise<void> {
    if (this.outbox.has(input.dedupeKey)) return;
    this.outbox.set(input.dedupeKey, {
      ...input,
      id: `outbox_${++this.#outboxSequence}`,
      attempts: 0,
      lockToken: null,
      lockedBy: null,
      lockExpiresAt: null,
      publishedAt: null,
      lastError: null,
    });
  }

  async insertWebhookDelivery(
    input: WebhookDeliveryInput
  ): Promise<{ status: "inserted" } | { status: "duplicate"; payloadHash: string }> {
    const existing = this.deliveries.get(input.deliveryId);
    if (existing) return { status: "duplicate", payloadHash: existing.payloadHash };
    this.deliveries.set(input.deliveryId, {
      ...input,
      status: "RECEIVED",
      proposalStorageId: null,
      completedAt: null,
      failureCode: null,
    });
    return { status: "inserted" };
  }

  async completeWebhookDelivery(input: {
    deliveryId: string;
    status: Exclude<WebhookDeliveryStatus, "RECEIVED">;
    proposalStorageId: string | null;
    failureCode?: string;
    completedAt: Date;
  }): Promise<void> {
    const current = this.deliveries.get(input.deliveryId);
    if (!current) throw new Error("Webhook delivery was not reserved.");
    this.deliveries.set(input.deliveryId, {
      ...current,
      status: input.status,
      proposalStorageId: input.proposalStorageId,
      completedAt: input.completedAt,
      failureCode: input.failureCode ?? null,
    });
  }

  async listProposals(query: ProposalListQuery): Promise<WorkflowProposalAggregate[]> {
    return [...this.proposals.values()]
      .filter(
        (proposal) =>
          proposal.tenantId === query.tenantId &&
          proposal.projectId === query.projectId &&
          proposal.repositoryId === query.repositoryId &&
          (!query.states || query.states.includes(proposal.state))
      )
      .slice(0, query.limit);
  }

  async claimOutbox(input: {
    workerId: string;
    lockToken: string;
    limit: number;
    now: Date;
    lockExpiresAt: Date;
  }): Promise<LeasedOutboxEvent[]> {
    const available = [...this.outbox.values()].filter(
      (event) =>
        !event.publishedAt &&
        event.availableAt <= input.now &&
        (!event.lockExpiresAt || event.lockExpiresAt <= input.now)
    );
    return available.slice(0, input.limit).map((event) => {
      const claimed = {
        ...event,
        attempts: event.attempts + 1,
        lockToken: input.lockToken,
        lockedBy: input.workerId,
        lockExpiresAt: input.lockExpiresAt,
      };
      this.outbox.set(event.dedupeKey, claimed);
      return {
        id: claimed.id,
        dedupeKey: claimed.dedupeKey,
        eventType: claimed.eventType,
        aggregateType: claimed.aggregateType,
        aggregateId: claimed.aggregateId,
        tenantId: claimed.tenantId,
        payload: claimed.payload,
        occurredAt: claimed.occurredAt,
        availableAt: claimed.availableAt,
        attempts: claimed.attempts,
        lockToken: input.lockToken,
        lockExpiresAt: input.lockExpiresAt,
      };
    });
  }

  async acknowledgeOutbox(input: {
    id: string;
    lockToken: string;
    publishedAt: Date;
  }): Promise<boolean> {
    const entry = [...this.outbox.entries()].find(([, event]) => event.id === input.id);
    if (!entry || entry[1].lockToken !== input.lockToken) return false;
    this.outbox.set(entry[0], { ...entry[1], publishedAt: input.publishedAt, lockToken: null });
    return true;
  }

  async releaseOutbox(input: {
    id: string;
    lockToken: string;
    availableAt: Date;
    lastError: string;
  }): Promise<boolean> {
    const entry = [...this.outbox.entries()].find(([, event]) => event.id === input.id);
    if (!entry || entry[1].lockToken !== input.lockToken) return false;
    this.outbox.set(entry[0], {
      ...entry[1],
      availableAt: input.availableAt,
      lastError: input.lastError,
      lockToken: null,
      lockedBy: null,
      lockExpiresAt: null,
    });
    return true;
  }

  async claimReconciliations(input: {
    workerId: string;
    lockToken: string;
    limit: number;
    now: Date;
    staleBefore: Date;
    lockExpiresAt: Date;
  }): Promise<LeasedProposalReconciliation[]> {
    for (const [storageId, schedule] of this.reconciliations) {
      const proposal = this.proposals.get(schedule.proposalStorageId);
      if (!proposal || ["MERGED", "CLOSED", "FAILED"].includes(proposal.state)) {
        this.reconciliations.delete(storageId);
      }
    }
    return [...this.reconciliations.values()]
      .filter((entry) => {
        const proposal = this.proposals.get(entry.proposalStorageId);
        return (
          proposal !== undefined &&
          (proposal.lastReconciledAt ?? proposal.updatedAt) <= input.staleBefore &&
          entry.availableAt <= input.now &&
          (!entry.lockExpiresAt || entry.lockExpiresAt <= input.now)
        );
      })
      .slice(0, input.limit)
      .map((entry) => {
        const claimed: StoredReconciliation = {
          ...entry,
          attempts: entry.attempts + 1,
          lockedBy: input.workerId,
          lockToken: input.lockToken,
          lockExpiresAt: input.lockExpiresAt,
        };
        this.reconciliations.set(entry.proposalStorageId, claimed);
        const proposal = this.proposals.get(entry.proposalStorageId);
        if (!proposal) throw new Error("Reconciliation proposal is missing.");
        return {
          proposal,
          attempts: claimed.attempts,
          lockToken: input.lockToken,
          lockExpiresAt: input.lockExpiresAt,
        };
      });
  }

  async completeReconciliation(input: ProposalReconciliationEventInput): Promise<boolean> {
    const lease = this.reconciliations.get(input.proposalStorageId);
    const proposal = this.proposals.get(input.proposalStorageId);
    if (
      !lease ||
      lease.lockToken !== input.lockToken ||
      !proposal ||
      proposal.version !== input.expectedVersion
    ) {
      return false;
    }
    const updated = await this.updateProposal({
      storageId: proposal.storageId,
      expectedVersion: proposal.version,
      patch: input.patch,
    });
    await this.appendAudit({
      proposalStorageId: updated.storageId,
      eventType: input.eventType,
      actorId: input.actorId,
      correlationId: input.correlationId,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      occurredAt: input.occurredAt,
    });
    await this.enqueueOutbox({
      dedupeKey: input.dedupeKey,
      eventType: input.eventType,
      aggregateType: "flowcordia.workflow_proposal",
      aggregateId: updated.storageId,
      tenantId: updated.tenantId,
      payload: input.payload,
      occurredAt: input.occurredAt,
      availableAt: input.occurredAt,
    });
    if (input.nextAvailableAt) {
      this.reconciliations.set(input.proposalStorageId, {
        ...lease,
        availableAt: input.nextAvailableAt,
        attempts: 0,
        lockToken: null,
        lockedBy: null,
        lockExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      });
    } else {
      this.reconciliations.delete(input.proposalStorageId);
    }
    return true;
  }

  async deferReconciliation(input: {
    proposalStorageId: string;
    lockToken: string;
    availableAt: Date;
    lastErrorCode: ReconciliationFailureCode;
    lastErrorMessage: string;
  }): Promise<boolean> {
    const lease = this.reconciliations.get(input.proposalStorageId);
    if (!lease || lease.lockToken !== input.lockToken) return false;
    this.reconciliations.set(input.proposalStorageId, {
      ...lease,
      availableAt: input.availableAt,
      lockToken: null,
      lockedBy: null,
      lockExpiresAt: null,
      lastErrorCode: input.lastErrorCode,
      lastErrorMessage: input.lastErrorMessage,
    });
    return true;
  }
}

export function createGateway() {
  const create = vi.fn<GitHubProposalGateway["create"]>(async (input) => ({
    success: true,
    value: {
      proposal: createReference(),
      workflowSource: {
        repository: {
          ...input.scope.repository,
          branch: "flowcordia/proposals/order_intake/proposal_0001",
        },
        path: ".flowcordia/workflows/order_intake.json",
        requestedRevision: "flowcordia/proposals/order_intake/proposal_0001",
        commitSha: HEAD_SHA,
        blobSha: "e".repeat(40),
        sourceSchemaVersion: "0.1",
      },
      resumed: false,
      audit: createReceipt("create", { correlationId: input.mutation.correlationId }),
    },
  }));
  const submit = vi.fn<GitHubProposalGateway["submit"]>(async (input) => ({
    success: true,
    value: {
      proposal: createReference({ draft: false }),
      noChange: false,
      audit: createReceipt("submit", { correlationId: input.mutation.correlationId }),
    },
  }));
  const promote = vi.fn<GitHubProposalGateway["promote"]>(async (input) => ({
    success: true,
    value: {
      proposal: createReference({ draft: false, state: "closed", merged: true }),
      mergeCommitSha: MERGE_SHA,
      alreadyMerged: false,
      audit: createReceipt("promote", { correlationId: input.mutation.correlationId }),
    },
  }));
  return { create, submit, promote } satisfies GitHubProposalGateway;
}

export function createCommand() {
  return {
    scope: createScope(),
    proposalId: PROPOSAL_ID,
    creatorReviewerId: "300",
    workflow: createWorkflow(),
    expectedBaseCommitSha: BASE_SHA,
    expectedBaseBlobSha: BASE_BLOB_SHA,
    actorId: "user_42",
    correlationId: "request_create",
  };
}
