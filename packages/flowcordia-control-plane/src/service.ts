import {
  isValidObjectId,
  isValidReviewerId,
  type GitHubProposalAuditReceipt,
  type GitHubProposalError,
  type GitHubProposalReference,
} from "@flowcordia/github-proposals";
import { validateWorkflow } from "@flowcordia/workflow";

import {
  canBeginOperation,
  newProposal,
  proposalIdentityMatches,
  receiptPatch,
  safeFailureMessage,
  stateFromFailure,
  stateWhenOperationBegins,
  validateCommandContext,
  validateControlPlaneScope,
} from "./aggregate/state.js";
import { ProposalConcurrencyError } from "./repository/errors.js";
import type {
  ControlPlaneError,
  ControlPlaneResult,
  ControlPlaneScope,
  CreateProposalCommand,
  GitHubProposalGateway,
  JsonValue,
  OutboxEventInput,
  PromoteProposalCommand,
  ProposalAuditEventInput,
  ProposalCommandValue,
  ProposalEventType,
  ProposalOperation,
  ProposalStore,
  ProposalTransaction,
  SubmitProposalCommand,
  WorkflowProposalAggregate,
} from "./types.js";

interface ProposalCommandServiceOptions {
  store: ProposalStore;
  github: GitHubProposalGateway;
  now?: () => Date;
}

function failed(error: ControlPlaneError): ControlPlaneResult<never> {
  return { success: false, error };
}

function invalidInput(operation: ProposalOperation, issues: string[]): ControlPlaneResult<never> {
  return failed({
    code: "invalid_input",
    operation,
    message: issues.join(" "),
    retryable: false,
  });
}

function errorPayload(error: GitHubProposalError): JsonValue {
  return {
    code: error.code,
    operation: error.operation,
    phase: error.phase,
    message: safeFailureMessage(error),
    retryable: error.retryable,
    ...(error.requestId ? { requestId: error.requestId } : {}),
    ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
    ...(error.expectedHeadSha ? { expectedHeadSha: error.expectedHeadSha } : {}),
    ...(error.actualHeadSha ? { actualHeadSha: error.actualHeadSha } : {}),
    ...(error.policyBlockers
      ? {
          policyBlockers: error.policyBlockers.map((blocker) => ({
            code: blocker.code,
            message: blocker.message,
          })),
        }
      : {}),
  };
}

function proposalPayload(proposal: WorkflowProposalAggregate): JsonValue {
  return {
    proposalId: proposal.proposalId,
    workflowId: proposal.workflowId,
    desiredWorkflowSha256: proposal.desiredWorkflowSha256,
    tenantId: proposal.tenantId,
    projectId: proposal.projectId,
    repositoryId: proposal.repositoryId,
    installationId: proposal.installationId,
    state: proposal.state,
    operation: proposal.operation,
    version: proposal.version,
    proposalBranch: proposal.proposalBranch,
    ...(proposal.headSha ? { headSha: proposal.headSha } : {}),
    ...(proposal.pullRequestNumber !== null
      ? { pullRequestNumber: proposal.pullRequestNumber }
      : {}),
    ...(proposal.mergeCommitSha ? { mergeCommitSha: proposal.mergeCommitSha } : {}),
  };
}

async function appendEvent(
  transaction: ProposalTransaction,
  input: {
    proposal: WorkflowProposalAggregate;
    eventType: ProposalEventType;
    actorId: string;
    correlationId: string;
    dedupeKey: string;
    payload: JsonValue;
    occurredAt: Date;
  }
): Promise<void> {
  const audit: ProposalAuditEventInput = {
    proposalStorageId: input.proposal.storageId,
    eventType: input.eventType,
    actorId: input.actorId,
    correlationId: input.correlationId,
    dedupeKey: input.dedupeKey,
    payload: input.payload,
    occurredAt: input.occurredAt,
  };
  const outbox: OutboxEventInput = {
    dedupeKey: input.dedupeKey,
    eventType: input.eventType,
    aggregateType: "flowcordia.workflow_proposal",
    aggregateId: input.proposal.storageId,
    tenantId: input.proposal.tenantId,
    payload: input.payload,
    occurredAt: input.occurredAt,
    availableAt: input.occurredAt,
  };
  await transaction.appendAudit(audit);
  await transaction.enqueueOutbox(outbox);
}

function persistenceFailure(
  operation: ProposalOperation,
  proposalId: string,
  error: unknown
): ControlPlaneResult<never> {
  const concurrent = error instanceof ProposalConcurrencyError;
  return failed({
    code: concurrent ? "concurrency_conflict" : "persistence_failed",
    operation,
    proposalId,
    message: concurrent
      ? "Proposal changed concurrently; reload it before retrying."
      : "The proposal could not be persisted.",
    retryable: true,
  });
}

function receiptIdentityMatches(
  proposal: WorkflowProposalAggregate,
  reference: GitHubProposalReference,
  receipt: GitHubProposalAuditReceipt,
  expectedActorId: string,
  expectedCorrelationId: string
): boolean {
  return (
    receipt.operation === proposal.operation &&
    receipt.actorId === expectedActorId &&
    receipt.correlationId === expectedCorrelationId &&
    receipt.tenantId === proposal.tenantId &&
    receipt.projectId === proposal.projectId &&
    receipt.installationId === proposal.installationId &&
    receipt.repository.owner === proposal.repository.owner &&
    receipt.repository.name === proposal.repository.name &&
    receipt.proposalId === proposal.proposalId &&
    receipt.workflowId === proposal.workflowId &&
    receipt.baseBranch === proposal.baseBranch &&
    receipt.baseCommitSha === proposal.baseCommitSha &&
    receipt.proposalBranch === proposal.proposalBranch &&
    receipt.creatorReviewerId === proposal.creatorReviewerId &&
    reference.repository.owner === receipt.repository.owner &&
    reference.repository.name === receipt.repository.name &&
    reference.proposalId === receipt.proposalId &&
    reference.workflowId === receipt.workflowId &&
    reference.baseBranch === receipt.baseBranch &&
    reference.baseCommitSha === receipt.baseCommitSha &&
    reference.creatorReviewerId === receipt.creatorReviewerId &&
    reference.branch === receipt.proposalBranch &&
    reference.headSha === receipt.headSha &&
    reference.pullRequestNumber === receipt.pullRequestNumber
  );
}

export class ProposalCommandService {
  readonly #store: ProposalStore;
  readonly #github: GitHubProposalGateway;
  readonly #now: () => Date;

  constructor(options: ProposalCommandServiceOptions) {
    if (!options?.store || typeof options.store.transaction !== "function") {
      throw new TypeError("Proposal command service requires a durable store.");
    }
    if (
      !options.github ||
      typeof options.github.create !== "function" ||
      typeof options.github.submit !== "function" ||
      typeof options.github.promote !== "function"
    ) {
      throw new TypeError("Proposal command service requires a GitHub proposal gateway.");
    }
    this.#store = options.store;
    this.#github = options.github;
    this.#now = options.now ?? (() => new Date());
  }

  async create(command: CreateProposalCommand): Promise<ControlPlaneResult<ProposalCommandValue>> {
    const issues = [
      ...validateControlPlaneScope(command?.scope),
      ...validateCommandContext(command),
    ];
    const workflow = validateWorkflow(command?.workflow);
    if (!workflow.success) issues.push("Workflow definition is invalid.");
    if (!isValidObjectId(command?.expectedBaseCommitSha ?? "")) {
      issues.push("Base commit SHA has an invalid format.");
    }
    if (
      command?.expectedBaseBlobSha !== null &&
      !isValidObjectId(command?.expectedBaseBlobSha ?? "")
    ) {
      issues.push("Base blob SHA has an invalid format.");
    }
    if (
      command?.creatorReviewerId !== null &&
      !isValidReviewerId(command?.creatorReviewerId ?? "")
    ) {
      issues.push("Creator reviewer identity has an invalid format.");
    }
    if (issues.length > 0) return invalidInput("create", issues);

    const reserved = await this.#reserveCreate(command);
    if (!reserved.success) return reserved;
    const { proposal, resumed } = reserved.value;

    if (["DRAFT", "READY", "PROMOTING", "MERGED", "CLOSED"].includes(proposal.state)) {
      return { success: true, value: { proposal, github: null, resumed: true } };
    }
    if (proposal.state === "FAILED") {
      return failed({
        code: "conflict",
        operation: "create",
        proposalId: proposal.proposalId,
        message: "This proposal ID is terminal after a definitive creation failure; use a new ID.",
        retryable: false,
      });
    }

    const result = await this.#github.create({
      scope: command.scope,
      proposalId: command.proposalId,
      creatorReviewerId: command.creatorReviewerId,
      workflow: command.workflow,
      expectedBaseCommitSha: command.expectedBaseCommitSha,
      expectedBaseBlobSha: command.expectedBaseBlobSha,
      mutation: { actorId: command.actorId, correlationId: command.correlationId },
    });
    if (!result.success) {
      await this.#persistFailure(proposal, command.actorId, command.correlationId, result.error);
      return failed({
        code: "github_operation_failed",
        operation: "create",
        proposalId: proposal.proposalId,
        message: result.error.message,
        retryable: result.error.retryable,
        github: result.error,
      });
    }

    const persisted = await this.#persistReceipt(
      proposal,
      result.value.proposal,
      result.value.audit,
      command.actorId,
      command.correlationId
    );
    if (!persisted.success) return persisted;
    return {
      success: true,
      value: { proposal: persisted.value, github: result.value.proposal, resumed },
    };
  }

  async submit(command: SubmitProposalCommand): Promise<ControlPlaneResult<ProposalCommandValue>> {
    return this.#executeExisting("submit", command);
  }

  async promote(
    command: PromoteProposalCommand
  ): Promise<ControlPlaneResult<ProposalCommandValue>> {
    return this.#executeExisting("promote", command);
  }

  async #reserveCreate(
    command: CreateProposalCommand
  ): Promise<ControlPlaneResult<{ proposal: WorkflowProposalAggregate; resumed: boolean }>> {
    try {
      return await this.#store.transaction(async (transaction) => {
        const existing = await transaction.findProposal(command.scope, command.proposalId);
        const occurredAt = this.#now();
        if (existing) {
          if (
            !proposalIdentityMatches(existing, {
              scope: command.scope,
              workflow: command.workflow,
              expectedBaseCommitSha: command.expectedBaseCommitSha,
              expectedBaseBlobSha: command.expectedBaseBlobSha,
              creatorReviewerId: command.creatorReviewerId,
            })
          ) {
            return failed({
              code: "conflict",
              operation: "create",
              proposalId: command.proposalId,
              message: "Proposal ID is already bound to different immutable identity data.",
              retryable: false,
            });
          }
          const dedupeKey = `${existing.storageId}:v${existing.version}:create:${command.correlationId}:resumed`;
          await appendEvent(transaction, {
            proposal: existing,
            eventType: "proposal.create.resumed",
            actorId: command.actorId,
            correlationId: command.correlationId,
            dedupeKey,
            payload: proposalPayload(existing),
            occurredAt,
          });
          return { success: true, value: { proposal: existing, resumed: true } };
        }

        const inserted = await transaction.insertProposal(
          newProposal({
            scope: command.scope,
            proposalId: command.proposalId,
            workflow: command.workflow,
            expectedBaseCommitSha: command.expectedBaseCommitSha,
            expectedBaseBlobSha: command.expectedBaseBlobSha,
            creatorReviewerId: command.creatorReviewerId,
            actorId: command.actorId,
            correlationId: command.correlationId,
          })
        );
        const dedupeKey = `${inserted.storageId}:v${inserted.version}:create:${command.correlationId}:requested`;
        await appendEvent(transaction, {
          proposal: inserted,
          eventType: "proposal.create.requested",
          actorId: command.actorId,
          correlationId: command.correlationId,
          dedupeKey,
          payload: proposalPayload(inserted),
          occurredAt,
        });
        return { success: true, value: { proposal: inserted, resumed: false } };
      });
    } catch (error) {
      return persistenceFailure("create", command.proposalId, error);
    }
  }

  async #executeExisting(
    operation: "submit",
    command: SubmitProposalCommand
  ): Promise<ControlPlaneResult<ProposalCommandValue>>;
  async #executeExisting(
    operation: "promote",
    command: PromoteProposalCommand
  ): Promise<ControlPlaneResult<ProposalCommandValue>>;
  async #executeExisting(
    operation: "submit" | "promote",
    command: SubmitProposalCommand | PromoteProposalCommand
  ): Promise<ControlPlaneResult<ProposalCommandValue>> {
    const issues = [
      ...validateControlPlaneScope(command?.scope),
      ...validateCommandContext(command),
    ];
    if (!isValidObjectId(command?.expectedHeadSha ?? "")) {
      issues.push("Expected head SHA has an invalid format.");
    }
    if (issues.length > 0) return invalidInput(operation, issues);

    const begun = await this.#beginExistingOperation(operation, command);
    if (!begun.success) return begun;
    const { proposal, noChange } = begun.value;
    if (noChange) return { success: true, value: { proposal, github: null, resumed: true } };

    const identity = {
      proposalId: proposal.proposalId,
      workflowId: proposal.workflowId,
      baseCommitSha: proposal.baseCommitSha,
      creatorReviewerId: proposal.creatorReviewerId,
    };
    const mutation = { actorId: command.actorId, correlationId: command.correlationId };
    const result =
      operation === "submit"
        ? await this.#github.submit({
            scope: command.scope,
            ...identity,
            pullRequestNumber: proposal.pullRequestNumber!,
            expectedHeadSha: command.expectedHeadSha,
            mutation,
          })
        : await this.#github.promote({
            scope: command.scope,
            ...identity,
            pullRequestNumber: proposal.pullRequestNumber!,
            expectedHeadSha: command.expectedHeadSha,
            policy: (command as PromoteProposalCommand).policy,
            mergeMethod: (command as PromoteProposalCommand).mergeMethod,
            mutation,
          });

    if (!result.success) {
      await this.#persistFailure(proposal, command.actorId, command.correlationId, result.error);
      return failed({
        code: "github_operation_failed",
        operation,
        proposalId: proposal.proposalId,
        message: result.error.message,
        retryable: result.error.retryable,
        github: result.error,
      });
    }
    const persisted = await this.#persistReceipt(
      proposal,
      result.value.proposal,
      result.value.audit,
      command.actorId,
      command.correlationId
    );
    if (!persisted.success) return persisted;
    return {
      success: true,
      value: { proposal: persisted.value, github: result.value.proposal, resumed: false },
    };
  }

  async #beginExistingOperation(
    operation: "submit" | "promote",
    command: SubmitProposalCommand | PromoteProposalCommand
  ): Promise<ControlPlaneResult<{ proposal: WorkflowProposalAggregate; noChange: boolean }>> {
    try {
      return await this.#store.transaction(async (transaction) => {
        const current = await transaction.findProposal(command.scope, command.proposalId);
        if (!current) {
          return failed({
            code: "not_found",
            operation,
            proposalId: command.proposalId,
            message: "Proposal was not found in the authorized repository scope.",
            retryable: false,
          });
        }
        if (current.headSha === null) {
          return failed({
            code: "conflict",
            operation,
            proposalId: current.proposalId,
            message: "Proposal does not have a persisted head identity.",
            retryable: false,
          });
        }
        if (current.headSha !== command.expectedHeadSha) {
          return failed({
            code: "conflict",
            operation,
            proposalId: current.proposalId,
            message: "Expected head does not match the persisted proposal head.",
            retryable: false,
          });
        }
        if (operation === "submit" && ["READY", "PROMOTING", "MERGED"].includes(current.state)) {
          return { success: true, value: { proposal: current, noChange: true } };
        }
        if (operation === "promote" && current.state === "MERGED") {
          return { success: true, value: { proposal: current, noChange: true } };
        }
        if (!canBeginOperation(current, operation)) {
          return failed({
            code: "conflict",
            operation,
            proposalId: current.proposalId,
            message: `Proposal state ${current.state} cannot begin ${operation}.`,
            retryable: false,
          });
        }
        if (current.pullRequestNumber === null) {
          return failed({
            code: "conflict",
            operation,
            proposalId: current.proposalId,
            message: "Proposal does not have a persisted pull request identity.",
            retryable: false,
          });
        }

        const updated = await transaction.updateProposal({
          storageId: current.storageId,
          expectedVersion: current.version,
          patch: {
            state: stateWhenOperationBegins(operation),
            operation,
            lastCorrelationId: command.correlationId,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
        const occurredAt = this.#now();
        const eventType =
          operation === "submit" ? "proposal.submit.requested" : "proposal.promote.requested";
        await appendEvent(transaction, {
          proposal: updated,
          eventType,
          actorId: command.actorId,
          correlationId: command.correlationId,
          dedupeKey: `${updated.storageId}:v${updated.version}:${operation}:${command.correlationId}:requested`,
          payload: proposalPayload(updated),
          occurredAt,
        });
        return { success: true, value: { proposal: updated, noChange: false } };
      });
    } catch (error) {
      return persistenceFailure(operation, command.proposalId, error);
    }
  }

  async #persistReceipt(
    proposal: WorkflowProposalAggregate,
    reference: GitHubProposalReference,
    receipt: GitHubProposalAuditReceipt,
    expectedActorId: string,
    expectedCorrelationId: string
  ): Promise<ControlPlaneResult<WorkflowProposalAggregate>> {
    try {
      return await this.#store.transaction(async (transaction) => {
        const current = await transaction.findProposal(
          {
            tenantId: proposal.tenantId,
            projectId: proposal.projectId,
            installationId: proposal.installationId,
            repositoryId: proposal.repositoryId,
            repositoryGithubId: proposal.repositoryGithubId,
            repository: { ...proposal.repository },
          },
          proposal.proposalId
        );
        if (
          !current ||
          !receiptIdentityMatches(
            current,
            reference,
            receipt,
            expectedActorId,
            expectedCorrelationId
          )
        ) {
          return failed({
            code: "conflict",
            operation: receipt.operation,
            proposalId: proposal.proposalId,
            message: "GitHub receipt does not match the durable proposal identity.",
            retryable: false,
          });
        }
        const updated = await transaction.updateProposal({
          storageId: current.storageId,
          expectedVersion: current.version,
          patch: {
            ...receiptPatch(receipt, current),
            pullRequestUrl: reference.pullRequestUrl,
            pullRequestDraft: reference.draft,
            pullRequestState: reference.state,
            merged: reference.merged,
          },
        });
        const occurredAt = this.#now();
        const payload: JsonValue = {
          ...(proposalPayload(updated) as Record<string, JsonValue>),
          outcome: receipt.outcome,
        };
        await appendEvent(transaction, {
          proposal: updated,
          eventType: "proposal.operation.completed",
          actorId: receipt.actorId,
          correlationId: receipt.correlationId,
          dedupeKey: `${updated.storageId}:v${updated.version}:${receipt.operation}:${receipt.correlationId}:${receipt.outcome}`,
          payload,
          occurredAt,
        });
        return { success: true, value: updated };
      });
    } catch (error) {
      return persistenceFailure(receipt.operation, proposal.proposalId, error);
    }
  }

  async #persistFailure(
    proposal: WorkflowProposalAggregate,
    actorId: string,
    correlationId: string,
    error: GitHubProposalError
  ): Promise<void> {
    try {
      await this.#store.transaction(async (transaction) => {
        const scope: ControlPlaneScope = {
          tenantId: proposal.tenantId,
          projectId: proposal.projectId,
          installationId: proposal.installationId,
          repositoryId: proposal.repositoryId,
          repositoryGithubId: proposal.repositoryGithubId,
          repository: { ...proposal.repository },
        };
        const current = await transaction.findProposal(scope, proposal.proposalId);
        if (!current) return;
        const nextState = stateFromFailure(error.operation, current.state, error);
        const updated = await transaction.updateProposal({
          storageId: current.storageId,
          expectedVersion: current.version,
          patch: {
            state: nextState,
            operation: error.operation,
            lastCorrelationId: correlationId,
            lastErrorCode: error.code,
            lastErrorMessage: safeFailureMessage(error),
          },
        });
        const eventType: ProposalEventType =
          error.code === "policy_blocked"
            ? "proposal.operation.blocked"
            : nextState === "RECONCILING"
              ? "proposal.reconciliation.required"
              : "proposal.operation.failed";
        const occurredAt = this.#now();
        await appendEvent(transaction, {
          proposal: updated,
          eventType,
          actorId,
          correlationId,
          dedupeKey: `${updated.storageId}:v${updated.version}:${error.operation}:${correlationId}:${error.code}`,
          payload: {
            proposal: proposalPayload(updated),
            error: errorPayload(error),
          },
          occurredAt,
        });
      });
    } catch {
      // The caller still receives the GitHub error. The pre-call requested event remains in the
      // outbox, so a reconciler can recover an operation whose post-call persistence also failed.
    }
  }
}
