import type { GitHubProposalSnapshot } from "../transport/client.js";

export interface GitHubProposalPolicy {
  minimumApprovals?: number;
  requiredCheckNames?: readonly string[];
  requiredReviewerIds?: readonly string[];
  allowedReviewerIds?: readonly string[];
  requireCurrentHeadApprovals?: boolean;
  allowSelfApproval?: boolean;
  blockChangesRequested?: boolean;
}

export type GitHubProposalPolicyBlockerCode =
  | "invalid_policy"
  | "pull_request_closed"
  | "pull_request_draft"
  | "head_changed"
  | "base_changed"
  | "branch_changed"
  | "mergeability_unknown"
  | "merge_conflict"
  | "changes_requested"
  | "approval_count"
  | "required_reviewer"
  | "required_check_missing"
  | "required_check_pending"
  | "required_check_failed"
  | "github_rules_blocked";

export interface GitHubProposalPolicyBlocker {
  code: GitHubProposalPolicyBlockerCode;
  message: string;
  reviewerId?: string;
  checkName?: string;
  expected?: string | number;
  actual?: string | number;
}

export interface EvaluateGitHubProposalPolicyInput {
  snapshot: GitHubProposalSnapshot;
  policy: GitHubProposalPolicy;
  expectedHeadSha: string;
  expectedBaseBranch: string;
  expectedProposalBranch: string;
  proposalCreatorReviewerId: string | null;
}

export interface GitHubProposalPolicyEvaluation {
  allowed: boolean;
  blockers: GitHubProposalPolicyBlocker[];
  countedReviewerIds: string[];
}
