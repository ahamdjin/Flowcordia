import {
  ProposalCommandService,
  ProposalConcurrencyError,
  newProposal,
  proposalIdentityMatches,
  safeFailureMessage,
  stateFromFailure,
  validateCommandContext,
  validateControlPlaneScope,
  type ControlPlaneError,
  type ControlPlaneResult,
  type CreateProposalCommand,
  type GitHubProposalGateway,
  type JsonValue,
  type OutboxEventInput,
  type ProposalAuditEventInput,
  type ProposalCommandValue,
  type ProposalEventType,
  type ProposalTransaction,
  type WorkflowProposalAggregate,
} from "@flowcordia/control-plane";
import {
  isValidObjectId,
  isValidReviewerId,
  type CreateGitHubProposalWithSourcePatchesInput,
  type GitHubProposalError,
} from "@flowcordia/github-proposals";
import {
  validateGitHubRepositorySourcePatches,
  type GitHubRepositorySourcePatch,
} from "@flowcordia/github-workflows";
import { validateWorkflow } from "@flowcordia/workflow";
import { createGitHubProposalGateway } from "./github.server";
import { flowcordiaProposalStore } from "./prisma.server";

export interface CreateSourceProposalCommand extends CreateProposalCommand {
  sourcePatches: readonly GitHubRepositorySourcePatch[];
  sourceDigest: string;
}

function failed(error: ControlPlaneError): ControlPlaneResult<never> {
  return { success: false, error };
}

function proposalPayload(
  proposal: WorkflowProposalAggregate,
  sourcePatchCount: number,
  sourceDigest: string
): JsonValue {
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
    sourcePatchCount,
    sourceDigest,
  };
}

async function appendEvent(input: {
  transaction: ProposalTransaction;
  proposal: WorkflowProposalAggregate;
  eventType: ProposalEventType;
  actorId: string;
  correlationId: string;
  dedupeKey: string;
  payload: JsonValue;
  occurredAt: Date;
}): Promise<void> {
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
  await input.transaction.appendAudit(audit);
  await input.transaction.enqueueOutbox(outbox);
}

function persistenceFailure(command: CreateSourceProposalCommand, error: unknown) {
  return failed({
    code: error instanceof ProposalConcurrencyError ? "concurrency_conflict" : "persistence_failed",
    operation: "create",
    proposalId: command.proposalId,
    message:
      error instanceof ProposalConcurrencyError
        ? "Proposal changed concurrently; reload it before retrying."
        : "The source-aware proposal could not be persisted.",
    retryable: true,
  });
}

async function reserve(command: CreateSourceProposalCommand) {
  try {
    return await flowcordiaProposalStore.transaction(async (transaction) => {
      const existing = await transaction.findProposal(command.scope, command.proposalId);
      const occurredAt = new Date();
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
        await appendEvent({
          transaction,
          proposal: existing,
          eventType: "proposal.create.resumed",
          actorId: command.actorId,
          correlationId: command.correlationId,
          dedupeKey: `${existing.storageId}:v${existing.version}:create:${command.correlationId}:source-resumed`,
          payload: proposalPayload(
            existing,
            command.sourcePatches.length,
            command.sourceDigest
          ),
          occurredAt,
        });
        return { success: true as const, value: { proposal: existing, resumed: true } };
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
      await appendEvent({
        transaction,
        proposal: inserted,
        eventType: "proposal.create.requested",
        actorId: command.actorId,
        correlationId: command.correlationId,
        dedupeKey: `${inserted.storageId}:v${inserted.version}:create:${command.correlationId}:source-requested`,
        payload: proposalPayload(inserted, command.sourcePatches.length, command.sourceDigest),
        occurredAt,
      });
      return { success: true as const, value: { proposal: inserted, resumed: false } };
    });
  } catch (error) {
    return persistenceFailure(command, error);
  }
}

async function persistFailure(
  proposal: WorkflowProposalAggregate,
  command: CreateSourceProposalCommand,
  error: GitHubProposalError
): Promise<void> {
  try {
    await flowcordiaProposalStore.transaction(async (transaction) => {
      const current = await transaction.findProposal(command.scope, proposal.proposalId);
      if (!current) return;
      const nextState = stateFromFailure(error.operation, current.state, error);
      const updated = await transaction.updateProposal({
        storageId: current.storageId,
        expectedVersion: current.version,
        patch: {
          state: nextState,
          operation: error.operation,
          lastCorrelationId: command.correlationId,
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
      const occurredAt = new Date();
      await appendEvent({
        transaction,
        proposal: updated,
        eventType,
        actorId: command.actorId,
        correlationId: command.correlationId,
        dedupeKey: `${updated.storageId}:v${updated.version}:create:${command.correlationId}:${error.code}:source`,
        payload: {
          proposal: proposalPayload(
            updated,
            command.sourcePatches.length,
            command.sourceDigest
          ),
          error: {
            code: error.code,
            operation: error.operation,
            phase: error.phase,
            message: safeFailureMessage(error),
            retryable: error.retryable,
          },
        },
        occurredAt,
      });
    });
  } catch {
    // The requested event remains durable, so reconciliation can recover an uncertain GitHub result.
  }
}

function validate(command: CreateSourceProposalCommand): string[] {
  const issues = [
    ...validateControlPlaneScope(command?.scope),
    ...validateCommandContext(command),
  ];
  if (!validateWorkflow(command?.workflow).success) issues.push("Workflow definition is invalid.");
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
  if (!/^[0-9a-f]{64}$/.test(command?.sourceDigest ?? "")) {
    issues.push("Source patch digest has an invalid format.");
  }
  const patches = validateGitHubRepositorySourcePatches(command?.sourcePatches);
  if (!patches.success) issues.push(...patches.issues.map((issue) => issue.message));
  return issues;
}

export async function createSourceAwareProposalCommandService(scope: CreateProposalCommand["scope"]) {
  const github = await createGitHubProposalGateway(scope);
  const canonical = new ProposalCommandService({ store: flowcordiaProposalStore, github });
  return {
    async create(
      command: CreateSourceProposalCommand
    ): Promise<ControlPlaneResult<ProposalCommandValue>> {
      const issues = validate(command);
      if (issues.length > 0) {
        return failed({
          code: "invalid_input",
          operation: "create",
          message: issues.join(" "),
          retryable: false,
        });
      }
      const reserved = await reserve(command);
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
          message: "This proposal ID is terminal after a definitive source creation failure.",
          retryable: false,
        });
      }

      const createWithSources = github.create as unknown as (
        input: CreateGitHubProposalWithSourcePatchesInput
      ) => ReturnType<GitHubProposalGateway["create"]>;
      const result = await createWithSources({
        scope: command.scope,
        proposalId: command.proposalId,
        creatorReviewerId: command.creatorReviewerId,
        workflow: command.workflow,
        expectedBaseCommitSha: command.expectedBaseCommitSha,
        expectedBaseBlobSha: command.expectedBaseBlobSha,
        sourcePatches: command.sourcePatches,
        mutation: { actorId: command.actorId, correlationId: command.correlationId },
      });
      if (!result.success) {
        await persistFailure(proposal, command, result.error);
        return failed({
          code: "github_operation_failed",
          operation: "create",
          proposalId: proposal.proposalId,
          message: result.error.message,
          retryable: result.error.retryable,
          github: result.error,
        });
      }

      const persisted = await canonical.create({
        scope: command.scope,
        proposalId: command.proposalId,
        creatorReviewerId: command.creatorReviewerId,
        workflow: command.workflow,
        expectedBaseCommitSha: command.expectedBaseCommitSha,
        expectedBaseBlobSha: command.expectedBaseBlobSha,
        actorId: command.actorId,
        correlationId: `${command.correlationId}:receipt`,
      });
      if (!persisted.success) return persisted;
      return {
        success: true,
        value: {
          ...persisted.value,
          resumed: resumed || persisted.value.resumed,
        },
      };
    },
  };
}
