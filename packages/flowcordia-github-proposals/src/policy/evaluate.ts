import type { GitHubCheck, GitHubReview } from "../transport/client.js";
import type {
  EvaluateGitHubProposalPolicyInput,
  GitHubProposalPolicy,
  GitHubProposalPolicyBlocker,
  GitHubProposalPolicyEvaluation,
} from "./types.js";

const REVIEWER_ID_PATTERN = /^[1-9][0-9]{0,15}$/;
const MAX_POLICY_ITEMS = 100;
const PASSING_CHECK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const DECISIVE_REVIEW_STATES = new Set(["approved", "changes_requested", "dismissed"]);

interface NormalizedPolicy {
  minimumApprovals: number;
  requiredCheckNames: readonly string[];
  requiredReviewerIds: readonly string[];
  allowedReviewerIds?: readonly string[];
  requireCurrentHeadApprovals: boolean;
  allowSelfApproval: boolean;
  blockChangesRequested: boolean;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function validateStringList(
  value: readonly string[] | undefined,
  label: string,
  pattern?: RegExp
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_POLICY_ITEMS) {
    return [`${label} must be an array containing at most ${MAX_POLICY_ITEMS} items.`];
  }

  const issues: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      item.length > 160 ||
      hasControlCharacter(item) ||
      (pattern !== undefined && !pattern.test(item))
    ) {
      issues.push(`${label} contains an invalid item.`);
      continue;
    }
    if (seen.has(item)) issues.push(`${label} must not contain duplicates.`);
    seen.add(item);
  }
  return issues;
}

export function validateProposalPolicy(policy: unknown): string[] {
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) {
    return ["Proposal policy is required."];
  }

  const candidate = policy as GitHubProposalPolicy;
  const issues = [
    ...validateStringList(candidate.requiredCheckNames, "Required check names"),
    ...validateStringList(
      candidate.requiredReviewerIds,
      "Required reviewer IDs",
      REVIEWER_ID_PATTERN
    ),
    ...validateStringList(
      candidate.allowedReviewerIds,
      "Allowed reviewer IDs",
      REVIEWER_ID_PATTERN
    ),
  ];

  if (
    candidate.minimumApprovals !== undefined &&
    (!Number.isSafeInteger(candidate.minimumApprovals) ||
      candidate.minimumApprovals < 0 ||
      candidate.minimumApprovals > MAX_POLICY_ITEMS)
  ) {
    issues.push(`Minimum approvals must be an integer between 0 and ${MAX_POLICY_ITEMS}.`);
  }

  for (const [label, value] of [
    ["Require current-head approvals", candidate.requireCurrentHeadApprovals],
    ["Allow self approval", candidate.allowSelfApproval],
    ["Block changes requested", candidate.blockChangesRequested],
  ] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      issues.push(`${label} must be a boolean.`);
    }
  }

  if (candidate.allowedReviewerIds && candidate.requiredReviewerIds) {
    const allowed = new Set(candidate.allowedReviewerIds);
    if (candidate.requiredReviewerIds.some((reviewerId) => !allowed.has(reviewerId))) {
      issues.push("Every required reviewer must also be present in the allowed reviewer list.");
    }
  }

  return [...new Set(issues)];
}

export function isValidReviewerId(reviewerId: string): boolean {
  return REVIEWER_ID_PATTERN.test(reviewerId);
}

function normalizePolicy(policy: GitHubProposalPolicy): NormalizedPolicy {
  return {
    minimumApprovals: policy.minimumApprovals ?? 1,
    requiredCheckNames: policy.requiredCheckNames ?? [],
    requiredReviewerIds: policy.requiredReviewerIds ?? [],
    allowedReviewerIds: policy.allowedReviewerIds,
    requireCurrentHeadApprovals: policy.requireCurrentHeadApprovals ?? true,
    allowSelfApproval: policy.allowSelfApproval ?? false,
    blockChangesRequested: policy.blockChangesRequested ?? true,
  };
}

function reviewOrder(review: GitHubReview): string {
  return `${review.submittedAt}:${String(review.id).padStart(20, "0")}`;
}

function latestDecisiveReviews(reviews: readonly GitHubReview[]): Map<string, GitHubReview> {
  const latest = new Map<string, GitHubReview>();
  for (const review of [...reviews].sort((left, right) =>
    reviewOrder(left).localeCompare(reviewOrder(right))
  )) {
    if (!DECISIVE_REVIEW_STATES.has(review.state)) continue;
    if (review.state === "dismissed") latest.delete(review.reviewerId);
    else latest.set(review.reviewerId, review);
  }
  return latest;
}

function checkOrder(check: GitHubCheck): string {
  return `${check.completedAt ?? check.startedAt ?? ""}:${String(check.id).padStart(20, "0")}`;
}

function latestChecksForHead(
  checks: readonly GitHubCheck[],
  headSha: string
): Map<string, GitHubCheck> {
  const latest = new Map<string, GitHubCheck>();
  for (const check of checks) {
    if (check.commitSha !== headSha) continue;
    const previous = latest.get(check.name);
    if (!previous || checkOrder(previous).localeCompare(checkOrder(check)) <= 0) {
      latest.set(check.name, check);
    }
  }
  return latest;
}

export function evaluateProposalPolicy(
  input: EvaluateGitHubProposalPolicyInput
): GitHubProposalPolicyEvaluation {
  const policyIssues = validateProposalPolicy(input.policy);
  if (policyIssues.length > 0) {
    return {
      allowed: false,
      blockers: policyIssues.map((message) => ({ code: "invalid_policy", message })),
      countedReviewerIds: [],
    };
  }

  const policy = normalizePolicy(input.policy);
  const { pullRequest } = input.snapshot;
  const blockers: GitHubProposalPolicyBlocker[] = [];

  if (pullRequest.state !== "open") {
    blockers.push({ code: "pull_request_closed", message: "Pull request is not open." });
  }
  if (pullRequest.draft) {
    blockers.push({ code: "pull_request_draft", message: "Pull request is still a draft." });
  }
  if (pullRequest.headSha !== input.expectedHeadSha) {
    blockers.push({
      code: "head_changed",
      message: "Pull request head changed after it was reviewed.",
      expected: input.expectedHeadSha,
      actual: pullRequest.headSha,
    });
  }
  if (pullRequest.baseBranch !== input.expectedBaseBranch) {
    blockers.push({
      code: "base_changed",
      message: "Pull request base branch does not match the proposal.",
      expected: input.expectedBaseBranch,
      actual: pullRequest.baseBranch,
    });
  }
  if (pullRequest.headBranch !== input.expectedProposalBranch) {
    blockers.push({
      code: "branch_changed",
      message: "Pull request head branch does not match the proposal.",
      expected: input.expectedProposalBranch,
      actual: pullRequest.headBranch,
    });
  }
  if (pullRequest.mergeable === null || pullRequest.mergeableState === "unknown") {
    blockers.push({
      code: "mergeability_unknown",
      message: "GitHub has not produced a definitive mergeability result.",
    });
  } else if (!pullRequest.mergeable || pullRequest.mergeableState === "dirty") {
    blockers.push({ code: "merge_conflict", message: "Pull request has a merge conflict." });
  }

  const latestReviews = latestDecisiveReviews(input.snapshot.reviews);
  if (policy.blockChangesRequested) {
    for (const review of latestReviews.values()) {
      if (review.state === "changes_requested") {
        blockers.push({
          code: "changes_requested",
          message: "A reviewer has requested changes.",
          reviewerId: review.reviewerId,
        });
      }
    }
  }

  const allowed = policy.allowedReviewerIds ? new Set(policy.allowedReviewerIds) : undefined;
  const countedReviewerIds = [...latestReviews.values()]
    .filter((review) => review.state === "approved")
    .filter(
      (review) => !policy.requireCurrentHeadApprovals || review.commitSha === pullRequest.headSha
    )
    .filter(
      (review) =>
        policy.allowSelfApproval ||
        (review.reviewerId !== pullRequest.authorId &&
          review.reviewerId !== input.proposalCreatorReviewerId)
    )
    .filter((review) => allowed === undefined || allowed.has(review.reviewerId))
    .map((review) => review.reviewerId)
    .sort();
  const counted = new Set(countedReviewerIds);

  if (countedReviewerIds.length < policy.minimumApprovals) {
    blockers.push({
      code: "approval_count",
      message: "The proposal does not have enough eligible approvals for the current head.",
      expected: policy.minimumApprovals,
      actual: countedReviewerIds.length,
    });
  }
  for (const reviewerId of policy.requiredReviewerIds) {
    if (!counted.has(reviewerId)) {
      blockers.push({
        code: "required_reviewer",
        message: "A required reviewer has not approved the current head.",
        reviewerId,
      });
    }
  }

  const checks = latestChecksForHead(input.snapshot.checks, pullRequest.headSha);
  for (const checkName of policy.requiredCheckNames) {
    const check = checks.get(checkName);
    if (!check) {
      blockers.push({
        code: "required_check_missing",
        message: "A required check has not reported for the current head.",
        checkName,
      });
    } else if (check.status !== "completed") {
      blockers.push({
        code: "required_check_pending",
        message: "A required check is still running.",
        checkName,
      });
    } else if (!check.conclusion || !PASSING_CHECK_CONCLUSIONS.has(check.conclusion)) {
      blockers.push({
        code: "required_check_failed",
        message: "A required check did not complete successfully.",
        checkName,
      });
    }
  }

  return { allowed: blockers.length === 0, blockers, countedReviewerIds };
}
