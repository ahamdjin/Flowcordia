import type { WorkflowDefinition, WorkflowIssue } from "@flowcordia/workflow";
import type {
  GitHubRepositoryTarget,
  GitHubWorkflowAccessScope,
  GitHubWorkflowMutationContext,
  GitHubWorkflowSource,
  GitHubWorkflowStore,
} from "@flowcordia/github-workflows";

import type { GitHubProposalPolicy, GitHubProposalPolicyBlocker } from "./policy/types.js";

export type GitHubProposalOperation = "create" | "submit" | "promote";
export type GitHubProposalPhase =
  | "validation"
  | "branch"
  | "workflow"
  | "pull_request"
  | "submission"
  | "policy"
  | "promotion";

export type GitHubProposalErrorCode =
  | "invalid_input"
  | "access_denied"
  | "not_found"
  | "conflict"
  | "proposal_collision"
  | "workflow_error"
  | "policy_blocked"
  | "rate_limited"
  | "unavailable"
  | "ambiguous_mutation";

export interface GitHubProposalError {
  code: GitHubProposalErrorCode;
  operation: GitHubProposalOperation;
  phase: GitHubProposalPhase;
  message: string;
  retryable: boolean;
  repository?: GitHubRepositoryTarget;
  proposalId?: string;
  proposalBranch?: string;
  pullRequestNumber?: number;
  expectedHeadSha?: string;
  actualHeadSha?: string;
  requestId?: string;
  retryAfterMs?: number;
  inputIssues?: string[];
  workflowIssues?: WorkflowIssue[];
  policyBlockers?: GitHubProposalPolicyBlocker[];
}

export type GitHubProposalResult<T> =
  | { success: true; value: T }
  | { success: false; error: GitHubProposalError };

export interface GitHubProposalIdentity {
  proposalId: string;
  workflowId: string;
  baseCommitSha: string;
  creatorReviewerId: string | null;
}

export interface GitHubProposalReference extends GitHubProposalIdentity {
  repository: GitHubRepositoryTarget;
  baseBranch: string;
  branch: string;
  headSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  draft: boolean;
  state: "open" | "closed";
  merged: boolean;
}

export type GitHubProposalAuditOutcome =
  | "created"
  | "resumed"
  | "submitted"
  | "already_ready"
  | "promoted"
  | "already_merged"
  | "recovered";

export interface GitHubProposalAuditReceipt {
  operation: GitHubProposalOperation;
  outcome: GitHubProposalAuditOutcome;
  tenantId: string;
  projectId: string;
  installationId: number;
  repository: GitHubRepositoryTarget;
  proposalId: string;
  workflowId: string;
  baseBranch: string;
  proposalBranch: string;
  baseCommitSha: string;
  headSha: string;
  pullRequestNumber: number;
  actorId: string;
  correlationId: string;
  creatorReviewerId: string | null;
  mergeCommitSha?: string;
}

export interface CreateGitHubProposalInput {
  scope: GitHubWorkflowAccessScope;
  proposalId: string;
  creatorReviewerId: string | null;
  workflow: WorkflowDefinition;
  expectedBaseCommitSha: string;
  expectedBaseBlobSha: string | null;
  mutation: GitHubWorkflowMutationContext;
}

export interface SubmitGitHubProposalInput extends GitHubProposalIdentity {
  scope: GitHubWorkflowAccessScope;
  pullRequestNumber: number;
  expectedHeadSha: string;
  mutation: GitHubWorkflowMutationContext;
}

export type GitHubMergeMethod = "merge" | "squash" | "rebase";

export interface PromoteGitHubProposalInput extends GitHubProposalIdentity {
  scope: GitHubWorkflowAccessScope;
  pullRequestNumber: number;
  expectedHeadSha: string;
  policy: GitHubProposalPolicy;
  mergeMethod: GitHubMergeMethod;
  mutation: GitHubWorkflowMutationContext;
}

export interface CreateGitHubProposalValue {
  proposal: GitHubProposalReference;
  workflowSource: GitHubWorkflowSource;
  resumed: boolean;
  audit: GitHubProposalAuditReceipt;
}

export interface SubmitGitHubProposalValue {
  proposal: GitHubProposalReference;
  noChange: boolean;
  audit: GitHubProposalAuditReceipt;
}

export interface PromoteGitHubProposalValue {
  proposal: GitHubProposalReference;
  mergeCommitSha: string;
  alreadyMerged: boolean;
  audit: GitHubProposalAuditReceipt;
}

export interface GitHubProposalServiceOptions {
  clientResolver: import("./transport/client.js").GitHubProposalClientResolver;
  workflowStore: GitHubWorkflowStore;
}
