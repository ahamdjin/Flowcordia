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
const POLICY_KEYS = new Set([
  "minimumApprovals",
  "requiredCheckNames",
  "requiredReviewerIds",
  "allowedReviewerIds",
  "requireCurrentHeadApprovals",
  "allowSelfApproval",
  "blockChangesRequested",
]);

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
  const issues = Object.keys(candidate)
    .filter((key) => !POLICY_KEYS.has(key))
    .map((key) => `Unknown proposal policy property "${key}".`);
  issues.push(
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
    )
  );

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

function latestChecksForHead(checks: readonly GitHubCheck[], headSha: string): Map<string, GitHubCheck> {
  const latest = new Map<string, GitHubCheck>();
  for (const check of checks
    .filter((candidate) => candidate.commitSha === headSha)
    .sort((left, right) => checkOrder(left).localeCompare(checkOrder(right)))) {
    latest.set(check.name, check);
  }
  return latest;
}

function blocker(
  blockers: GitHubProposalPolicyBlocker[],
  value: GitHubProposalPolicyBlocker
): void {
  blockers.push(value);
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
  const pullRequest = input.snapshot.pullRequest;
  const blockers: GitHubProposalPolicyBlocker[] = [];
  if (pullRequest.state !== "open") {
    blocker(blockers, { code: "pull_request_closed", message: "Pull request is closed." });
  }
  if (pullRequest.draft) {
    blocker(blockers, { code: "pull_request_draft", message: "Pull request is still a draft." });
  }
  if (pullRequest.headSha !== input.expectedHeadSha) {
    blocker(blockers, {
      code: "head_changed",
      message: "Pull request head changed.",
      expected: input.expectedHeadSha,
      actual: pullRequest.headSha,
    });
  }
  if (pullRequest.baseBranch !== input.expectedBaseBranch) {
    blocker(blockers, {
      code: "base_changed",
      message: "Pull request base branch changed.",
      expected: input.expectedBaseBranch,
      actual: pullRequest.baseBranch,
    });
  }
  if (pullRequest.headBranch !== input.expectedProposalBranch) {
    blocker(blockers, {
      code: "branch_changed",
      message: "Pull request branch changed.",
      expected: input.expectedProposalBranch,
      actual: pullRequest.headBranch,
    });
  }
  if (pullRequest.mergeable === null) {
    blocker(blockers, {
      code: "mergeability_unknown",
      message: "GitHub has not finished calculating mergeability.",
    });
  } else if (!pullRequest.mergeable) {
    blocker(blockers, { code: "merge_conflict", message: "Pull request has merge conflicts." });
  }

  const latestReviews = latestDecisiveReviews(input.snapshot.reviews);
  const allowedReviewers = policy.allowedReviewerIds
    ? new Set(policy.allowedReviewerIds)
    : undefined;
  const countedReviewerIds = [...latestReviews.values()]
    .filter((review) => review.state === "approved")
    .filter((review) => !policy.requireCurrentHeadApprovals || review.commitSha === input.expectedHeadSha)
    .filter((review) => allowedReviewers === undefined || allowedReviewers.has(review.reviewerId))
    .filter(
      (review) =>
        policy.allowSelfApproval ||
        (review.reviewerId !== pullRequest.authorId &&
          review.reviewerId !== input.proposalCreatorReviewerId)
    )
    .map((review) => review.reviewerId)
    .sort();

  if (policy.blockChangesRequested) {
    for (const review of latestReviews.values()) {
      if (review.state === "changes_requested") {
        blocker(blockers, {
          code: "changes_requested",
          message: "A reviewer requested changes.",
          reviewerId: review.reviewerId,
        });
      }
    }
  }
  if (countedReviewerIds.length < policy.minimumApprovals) {
    blocker(blockers, {
      code: "approval_count",
      message: "The proposal does not have enough eligible approvals.",
      expected: policy.minimumApprovals,
      actual: countedReviewerIds.length,
    });
  }
  for (const reviewerId of policy.requiredReviewerIds) {
    if (!countedReviewerIds.includes(reviewerId)) {
      blocker(blockers, {
        code: "required_reviewer",
        message: "A required reviewer has not approved the exact proposal head.",
        reviewerId,
      });
    }
  }

  const checks = latestChecksForHead(input.snapshot.checks, input.expectedHeadSha);
  for (const checkName of policy.requiredCheckNames) {
    const check = checks.get(checkName);
    if (!check) {
      blocker(blockers, {
        code: "required_check_missing",
        message: "A required check has not reported for the exact proposal head.",
        checkName,
      });
    } else if (check.status !== "completed") {
      blocker(blockers, {
        code: "required_check_pending",
        message: "A required check is still running.",
        checkName,
      });
    } else if (!check.conclusion || !PASSING_CHECK_CONCLUSIONS.has(check.conclusion)) {
      blocker(blockers, {
        code: "required_check_failed",
        message: "A required check did not pass.",
        checkName,
        actual: check.conclusion ?? "unknown",
      });
    }
  }

  return { allowed: blockers.length === 0, blockers, countedReviewerIds };
}
