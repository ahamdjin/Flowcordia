import type {
  GitHubMergeMethod,
  GitHubProposalAuditReceipt,
  GitHubProposalError,
  GitHubProposalPolicy,
  GitHubProposalResult,
  GitHubProposalService,
  GitHubProposalReference,
} from "@flowcordia/github-proposals";
import type {
  GitHubRepositoryTarget,
  GitHubWorkflowAccessScope,
} from "@flowcordia/github-workflows";
import type { WorkflowDefinition } from "@flowcordia/workflow";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const proposalStates = [
  "CREATING",
  "DRAFT",
  "READY",
  "PROMOTING",
  "MERGED",
  "CLOSED",
  "RECONCILING",
  "FAILED",
] as const;

export type ProposalState = (typeof proposalStates)[number];
export type ProposalOperation = "create" | "submit" | "promote";

export interface ControlPlaneScope extends GitHubWorkflowAccessScope {
  /** Internal database ID. Never accepted from an untrusted client. */
  repositoryId: string;
  /** Decimal GitHub repository ID, serialized to avoid JSON/BigInt loss. */
  repositoryGithubId: string;
}

export interface WorkflowProposalAggregate {
  storageId: string;
  proposalId: string;
  workflowId: string;
  workflowPath: string;
  desiredWorkflowSha256: string;
  tenantId: string;
  projectId: string;
  installationId: number;
  repositoryId: string;
  repositoryGithubId: string;
  repository: GitHubRepositoryTarget;
  baseBranch: string;
  baseCommitSha: string;
  expectedBaseBlobSha: string | null;
  proposalBranch: string;
  creatorReviewerId: string | null;
  createdByUserId: string;
  state: ProposalState;
  operation: ProposalOperation;
  headSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  pullRequestDraft: boolean | null;
  pullRequestState: "open" | "closed" | null;
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

export const proposalEventTypes = [
  "proposal.create.requested",
  "proposal.create.resumed",
  "proposal.submit.requested",
  "proposal.promote.requested",
  "proposal.operation.completed",
  "proposal.operation.blocked",
  "proposal.operation.failed",
  "proposal.reconciliation.required",
  "proposal.github.webhook_received",
  "proposal.github.identity_mismatch",
] as const;

export type ProposalEventType = (typeof proposalEventTypes)[number];

export interface ProposalAuditEventInput {
  proposalStorageId: string;
  eventType: ProposalEventType;
  actorId: string;
  correlationId: string;
  dedupeKey: string;
  payload: JsonValue;
  occurredAt: Date;
}

export interface OutboxEventInput {
  dedupeKey: string;
  eventType: ProposalEventType;
  aggregateType: "flowcordia.workflow_proposal";
  aggregateId: string;
  tenantId: string;
  payload: JsonValue;
  occurredAt: Date;
  availableAt: Date;
}

export interface LeasedOutboxEvent extends OutboxEventInput {
  id: string;
  attempts: number;
  lockToken: string;
  lockExpiresAt: Date;
}

export interface ProposalListQuery {
  tenantId: string;
  projectId: string;
  repositoryId: string;
  states?: readonly ProposalState[];
  limit: number;
  cursor?: { updatedAt: Date; storageId: string };
}

export interface WebhookDeliveryInput {
  deliveryId: string;
  eventName: string;
  action: string | null;
  installationId: number;
  repositoryGithubId: string;
  payloadHash: string;
  normalizedPayload: JsonValue;
  receivedAt: Date;
}

export type WebhookDeliveryStatus = "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";

export interface WebhookProposalLookup {
  eventName: WebhookDeliveryInput["eventName"];
  installationId: number;
  repositoryGithubId: string;
  pullRequestNumber: number | null;
  headSha: string | null;
}

export interface ProposalTransaction {
  findProposal(
    scope: ControlPlaneScope,
    proposalId: string
  ): Promise<WorkflowProposalAggregate | null>;
  findProposalForWebhook(lookup: WebhookProposalLookup): Promise<WorkflowProposalAggregate | null>;
  insertProposal(
    input: Omit<WorkflowProposalAggregate, "storageId" | "version" | "createdAt" | "updatedAt">
  ): Promise<WorkflowProposalAggregate>;
  updateProposal(input: {
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
  }): Promise<WorkflowProposalAggregate>;
  appendAudit(input: ProposalAuditEventInput): Promise<void>;
  enqueueOutbox(input: OutboxEventInput): Promise<void>;
  insertWebhookDelivery(
    input: WebhookDeliveryInput
  ): Promise<{ status: "inserted" } | { status: "duplicate"; payloadHash: string }>;
  completeWebhookDelivery(input: {
    deliveryId: string;
    status: Exclude<WebhookDeliveryStatus, "RECEIVED">;
    proposalStorageId: string | null;
    failureCode?: string;
    completedAt: Date;
  }): Promise<void>;
}

export interface ProposalStore {
  transaction<T>(callback: (transaction: ProposalTransaction) => Promise<T>): Promise<T>;
  listProposals(query: ProposalListQuery): Promise<WorkflowProposalAggregate[]>;
  claimOutbox(input: {
    workerId: string;
    lockToken: string;
    limit: number;
    now: Date;
    lockExpiresAt: Date;
  }): Promise<LeasedOutboxEvent[]>;
  acknowledgeOutbox(input: { id: string; lockToken: string; publishedAt: Date }): Promise<boolean>;
  releaseOutbox(input: {
    id: string;
    lockToken: string;
    availableAt: Date;
    lastError: string;
  }): Promise<boolean>;
}

export interface GitHubProposalGateway {
  create: GitHubProposalService["create"];
  submit: GitHubProposalService["submit"];
  promote: GitHubProposalService["promote"];
}

interface ProposalCommandContext {
  scope: ControlPlaneScope;
  proposalId: string;
  actorId: string;
  correlationId: string;
}

export interface CreateProposalCommand extends ProposalCommandContext {
  creatorReviewerId: string | null;
  workflow: WorkflowDefinition;
  expectedBaseCommitSha: string;
  expectedBaseBlobSha: string | null;
}

export interface SubmitProposalCommand extends ProposalCommandContext {
  expectedHeadSha: string;
}

export interface PromoteProposalCommand extends ProposalCommandContext {
  expectedHeadSha: string;
  policy: GitHubProposalPolicy;
  mergeMethod: GitHubMergeMethod;
}

export type ProposalCommand =
  | ({ operation: "create" } & CreateProposalCommand)
  | ({ operation: "submit" } & SubmitProposalCommand)
  | ({ operation: "promote" } & PromoteProposalCommand);

export type ControlPlaneErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "concurrency_conflict"
  | "github_operation_failed"
  | "persistence_failed";

export interface ControlPlaneError {
  code: ControlPlaneErrorCode;
  message: string;
  retryable: boolean;
  proposalId?: string;
  operation?: ProposalOperation;
  github?: GitHubProposalError;
}

export type ControlPlaneResult<T> =
  | { success: true; value: T }
  | { success: false; error: ControlPlaneError };

export interface ProposalCommandValue {
  proposal: WorkflowProposalAggregate;
  github: GitHubProposalReference | null;
  resumed: boolean;
}

export interface ProposalGatewayResult {
  result: GitHubProposalResult<{
    proposal: GitHubProposalReference;
    audit: GitHubProposalAuditReceipt;
  }>;
}
