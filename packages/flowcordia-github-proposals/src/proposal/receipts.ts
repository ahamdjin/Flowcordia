import type {
  GitHubWorkflowAccessScope,
  GitHubWorkflowMutationContext,
} from "@flowcordia/github-workflows";

import type { GitHubPullRequest } from "../transport/client.js";
import type {
  GitHubProposalAuditOutcome,
  GitHubProposalAuditReceipt,
  GitHubProposalIdentity,
  GitHubProposalOperation,
  GitHubProposalReference,
} from "../types.js";

export function proposalReference(
  scope: GitHubWorkflowAccessScope,
  identity: GitHubProposalIdentity,
  proposalBranch: string,
  pullRequest: GitHubPullRequest
): GitHubProposalReference {
  return {
    ...identity,
    repository: { ...scope.repository },
    baseBranch: scope.repository.branch,
    branch: proposalBranch,
    headSha: pullRequest.headSha,
    pullRequestNumber: pullRequest.number,
    pullRequestUrl: pullRequest.url,
    draft: pullRequest.draft,
    state: pullRequest.state,
    merged: pullRequest.merged,
  };
}

export function proposalAudit(input: {
  operation: GitHubProposalOperation;
  outcome: GitHubProposalAuditOutcome;
  scope: GitHubWorkflowAccessScope;
  identity: GitHubProposalIdentity;
  proposalBranch: string;
  pullRequest: GitHubPullRequest;
  mutation: GitHubWorkflowMutationContext;
  mergeCommitSha?: string;
}): GitHubProposalAuditReceipt {
  return {
    operation: input.operation,
    outcome: input.outcome,
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    installationId: input.scope.installationId,
    repository: { ...input.scope.repository },
    proposalId: input.identity.proposalId,
    workflowId: input.identity.workflowId,
    baseBranch: input.scope.repository.branch,
    proposalBranch: input.proposalBranch,
    baseCommitSha: input.identity.baseCommitSha,
    headSha: input.pullRequest.headSha,
    pullRequestNumber: input.pullRequest.number,
    actorId: input.mutation.actorId,
    correlationId: input.mutation.correlationId,
    creatorReviewerId: input.identity.creatorReviewerId,
    ...(input.mergeCommitSha ? { mergeCommitSha: input.mergeCommitSha } : {}),
  };
}
