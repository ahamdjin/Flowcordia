import { createHash } from "node:crypto";
import {
  buildProposalBranch,
  isValidObjectId,
  isValidProposalId,
  type GitHubProposalAuditReceipt,
  type GitHubProposalError,
} from "@flowcordia/github-proposals";
import { serializeWorkflow, type WorkflowDefinition } from "@flowcordia/workflow";
import {
  buildWorkflowPath,
  isValidWorkflowId,
  validateAccessScope,
} from "@flowcordia/github-workflows";

import type {
  ControlPlaneScope,
  ProposalOperation,
  ProposalState,
  WorkflowProposalAggregate,
} from "../types.js";

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/;
const DECIMAL_ID_PATTERN = /^[1-9][0-9]{0,39}$/;

export function workflowSha256(workflow: WorkflowDefinition): string {
  return createHash("sha256").update(serializeWorkflow(workflow), "utf8").digest("hex");
}

export function validateControlPlaneScope(scope: unknown): string[] {
  const issues = validateAccessScope(scope);
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return issues;
  const controlScope = scope as Partial<ControlPlaneScope>;
  if (!SAFE_ID_PATTERN.test(controlScope.repositoryId ?? "")) {
    issues.push("Repository database ID has an invalid format.");
  }
  if (!DECIMAL_ID_PATTERN.test(controlScope.repositoryGithubId ?? "")) {
    issues.push("GitHub repository ID must be a positive decimal string.");
  }
  return issues;
}

export function validateCommandContext(input: {
  proposalId: string;
  actorId: string;
  correlationId: string;
}): string[] {
  const issues: string[] = [];
  if (!isValidProposalId(input.proposalId ?? "")) issues.push("Proposal ID has an invalid format.");
  if (!SAFE_ID_PATTERN.test(input.actorId ?? "")) issues.push("Actor ID has an invalid format.");
  if (!SAFE_ID_PATTERN.test(input.correlationId ?? "")) {
    issues.push("Correlation ID has an invalid format.");
  }
  return issues;
}

export function newProposal(input: {
  scope: ControlPlaneScope;
  proposalId: string;
  workflow: WorkflowDefinition;
  expectedBaseCommitSha: string;
  expectedBaseBlobSha: string | null;
  creatorReviewerId: string | null;
  actorId: string;
  correlationId: string;
}): Omit<WorkflowProposalAggregate, "storageId" | "version" | "createdAt" | "updatedAt"> {
  if (!isValidWorkflowId(input.workflow.id))
    throw new TypeError("Workflow ID has an invalid format.");
  if (!isValidObjectId(input.expectedBaseCommitSha)) {
    throw new TypeError("Base commit SHA has an invalid format.");
  }
  if (input.expectedBaseBlobSha !== null && !isValidObjectId(input.expectedBaseBlobSha)) {
    throw new TypeError("Base blob SHA has an invalid format.");
  }

  return {
    proposalId: input.proposalId,
    workflowId: input.workflow.id,
    workflowPath: buildWorkflowPath(input.workflow.id),
    desiredWorkflowSha256: workflowSha256(input.workflow),
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    installationId: input.scope.installationId,
    repositoryId: input.scope.repositoryId,
    repositoryGithubId: input.scope.repositoryGithubId,
    repository: { ...input.scope.repository },
    baseBranch: input.scope.repository.branch,
    baseCommitSha: input.expectedBaseCommitSha,
    expectedBaseBlobSha: input.expectedBaseBlobSha,
    proposalBranch: buildProposalBranch(input.workflow.id, input.proposalId),
    creatorReviewerId: input.creatorReviewerId,
    createdByUserId: input.actorId,
    state: "CREATING",
    operation: "create",
    headSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    pullRequestDraft: null,
    pullRequestState: null,
    merged: false,
    mergeCommitSha: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastCorrelationId: input.correlationId,
    lastGithubEventAt: null,
    lastPullRequestEventAt: null,
  };
}

export function proposalIdentityMatches(
  proposal: WorkflowProposalAggregate,
  input: {
    scope: ControlPlaneScope;
    workflow: WorkflowDefinition;
    expectedBaseCommitSha: string;
    expectedBaseBlobSha: string | null;
    creatorReviewerId: string | null;
  }
): boolean {
  return (
    proposal.tenantId === input.scope.tenantId &&
    proposal.projectId === input.scope.projectId &&
    proposal.installationId === input.scope.installationId &&
    proposal.repositoryId === input.scope.repositoryId &&
    proposal.repositoryGithubId === input.scope.repositoryGithubId &&
    proposal.repository.owner === input.scope.repository.owner &&
    proposal.repository.name === input.scope.repository.name &&
    proposal.baseBranch === input.scope.repository.branch &&
    proposal.workflowId === input.workflow.id &&
    proposal.desiredWorkflowSha256 === workflowSha256(input.workflow) &&
    proposal.baseCommitSha === input.expectedBaseCommitSha &&
    proposal.expectedBaseBlobSha === input.expectedBaseBlobSha &&
    proposal.creatorReviewerId === input.creatorReviewerId
  );
}

export function canBeginOperation(
  proposal: WorkflowProposalAggregate,
  operation: Exclude<ProposalOperation, "create">
): boolean {
  if (operation === "submit") {
    return proposal.state === "DRAFT" || proposal.state === "RECONCILING";
  }
  return proposal.state === "READY" || proposal.state === "RECONCILING";
}

export function stateWhenOperationBegins(
  operation: Exclude<ProposalOperation, "create">
): ProposalState {
  return operation === "promote" ? "PROMOTING" : "DRAFT";
}

export function stateFromReceipt(receipt: GitHubProposalAuditReceipt): ProposalState {
  switch (receipt.operation) {
    case "create":
      return "DRAFT";
    case "submit":
      return "READY";
    case "promote":
      return "MERGED";
  }
}

export function receiptPatch(
  receipt: GitHubProposalAuditReceipt,
  proposal: WorkflowProposalAggregate
): Partial<WorkflowProposalAggregate> {
  return {
    state: stateFromReceipt(receipt),
    operation: receipt.operation,
    proposalBranch: receipt.proposalBranch,
    headSha: receipt.headSha,
    pullRequestNumber: receipt.pullRequestNumber,
    mergeCommitSha: receipt.mergeCommitSha ?? proposal.mergeCommitSha,
    merged: receipt.operation === "promote" ? true : proposal.merged,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastCorrelationId: receipt.correlationId,
  };
}

export function stateFromFailure(
  operation: ProposalOperation,
  current: ProposalState,
  error: GitHubProposalError
): ProposalState {
  if (error.code === "policy_blocked") return current === "PROMOTING" ? "READY" : current;
  if (error.code === "ambiguous_mutation" || error.retryable) return "RECONCILING";
  if (operation === "create") return "FAILED";
  if (operation === "promote" && current === "PROMOTING") return "READY";
  return current;
}

export function safeFailureMessage(error: GitHubProposalError): string {
  const message = error.message.trim();
  return message.length <= 500 ? message : `${message.slice(0, 497)}...`;
}
