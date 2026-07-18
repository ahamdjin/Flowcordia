import type {
  GitHubCheck,
  GitHubProposalPolicyBlocker,
  GitHubProposalPolicyEvaluation,
  GitHubProposalSnapshot,
  GitHubReview,
} from "@flowcordia/github-proposals";
import type { FlowcordiaFunctionValidationProjection } from "../../workflows/validation/presentation";
import type { ResolvedFlowcordiaProposalGovernance } from "./service.server";

export interface FlowcordiaProposalGovernancePolicyProjection {
  source: "default" | "stored";
  publicId: string | null;
  version: string | null;
  digest: string;
  minimumApprovals: number;
  requiredCheckNames: string[];
  requiredReviewerIds: string[];
  allowedReviewerIds: string[] | null;
  requireCurrentHeadApprovals: true;
  allowSelfApproval: false;
  blockChangesRequested: true;
  updatedAt: string | null;
}

export interface FlowcordiaProposalGovernanceEvidenceProjection {
  state: "NOT_APPLICABLE" | "PENDING" | "BLOCKED" | "SATISFIED" | "UNAVAILABLE";
  message: string;
  evaluatedHeadSha: string | null;
  countedReviewerIds: string[];
  checks: Array<{
    name: string;
    status: "missing" | "queued" | "in_progress" | "passed" | "failed";
    conclusion: string | null;
  }>;
  reviewers: Array<{
    reviewerId: string;
    required: boolean;
    allowed: boolean;
    state: "approved" | "changes_requested" | "commented" | "pending" | "missing";
    currentHead: boolean;
  }>;
  blockers: Array<{
    code: GitHubProposalPolicyBlocker["code"];
    message: string;
    reviewerId: string | null;
    checkName: string | null;
    expected: string | number | null;
    actual: string | number | null;
  }>;
  functionValidation: Pick<FlowcordiaFunctionValidationProjection, "state" | "message">;
}

const PASSING_CHECK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

function latestCheck(checks: readonly GitHubCheck[], name: string, headSha: string): GitHubCheck | null {
  return (
    [...checks]
      .filter((check) => check.name === name && check.commitSha === headSha)
      .sort((left, right) => {
        const leftTime = left.completedAt ?? left.startedAt ?? "";
        const rightTime = right.completedAt ?? right.startedAt ?? "";
        return `${rightTime}:${right.id}`.localeCompare(`${leftTime}:${left.id}`);
      })[0] ?? null
  );
}

function latestReview(reviews: readonly GitHubReview[], reviewerId: string): GitHubReview | null {
  return (
    [...reviews]
      .filter((review) => review.reviewerId === reviewerId)
      .sort((left, right) =>
        `${right.submittedAt}:${right.id}`.localeCompare(`${left.submittedAt}:${left.id}`)
      )[0] ?? null
  );
}

export function presentFlowcordiaProposalGovernancePolicy(
  governance: ResolvedFlowcordiaProposalGovernance
): FlowcordiaProposalGovernancePolicyProjection {
  return {
    source: governance.source,
    publicId: governance.publicId,
    version: governance.version?.toString() ?? null,
    digest: governance.policyDigest,
    minimumApprovals: governance.profile.minimumApprovals,
    requiredCheckNames: [...governance.profile.requiredCheckNames],
    requiredReviewerIds: [...governance.profile.requiredReviewerIds],
    allowedReviewerIds:
      governance.profile.allowedReviewerIds === null
        ? null
        : [...governance.profile.allowedReviewerIds],
    requireCurrentHeadApprovals: true,
    allowSelfApproval: false,
    blockChangesRequested: true,
    updatedAt: governance.updatedAt?.toISOString() ?? null,
  };
}

function presentBlocker(blocker: GitHubProposalPolicyBlocker) {
  return {
    code: blocker.code,
    message: blocker.message,
    reviewerId: blocker.reviewerId ?? null,
    checkName: blocker.checkName ?? null,
    expected: blocker.expected ?? null,
    actual: blocker.actual ?? null,
  };
}

export function presentFlowcordiaProposalGovernanceEvidence(input: {
  governance: ResolvedFlowcordiaProposalGovernance;
  snapshot: GitHubProposalSnapshot | null;
  evaluation: GitHubProposalPolicyEvaluation | null;
  expectedHeadSha: string | null;
  functionValidation: Pick<FlowcordiaFunctionValidationProjection, "state" | "message">;
  unavailableMessage?: string;
}): FlowcordiaProposalGovernanceEvidenceProjection {
  if (!input.expectedHeadSha || !input.snapshot || !input.evaluation) {
    return {
      state: input.unavailableMessage ? "UNAVAILABLE" : "NOT_APPLICABLE",
      message:
        input.unavailableMessage ?? "Publish an exact proposal head before evaluating governance.",
      evaluatedHeadSha: null,
      countedReviewerIds: [],
      checks: input.governance.profile.requiredCheckNames.map((name) => ({
        name,
        status: "missing" as const,
        conclusion: null,
      })),
      reviewers: input.governance.profile.requiredReviewerIds.map((reviewerId) => ({
        reviewerId,
        required: true,
        allowed: true,
        state: "missing" as const,
        currentHead: false,
      })),
      blockers: [],
      functionValidation: input.functionValidation,
    };
  }

  const headSha = input.expectedHeadSha;
  const checks = input.governance.profile.requiredCheckNames.map((name) => {
    const check = latestCheck(input.snapshot!.checks, name, headSha);
    if (!check) return { name, status: "missing" as const, conclusion: null };
    if (check.status === "queued") {
      return { name, status: "queued" as const, conclusion: check.conclusion };
    }
    if (check.status === "in_progress") {
      return { name, status: "in_progress" as const, conclusion: check.conclusion };
    }
    return {
      name,
      status:
        check.conclusion && PASSING_CHECK_CONCLUSIONS.has(check.conclusion)
          ? ("passed" as const)
          : ("failed" as const),
      conclusion: check.conclusion,
    };
  });

  const reviewerIds = new Set([
    ...input.governance.profile.requiredReviewerIds,
    ...(input.governance.profile.allowedReviewerIds ?? []),
    ...input.evaluation.countedReviewerIds,
  ]);
  const allowed =
    input.governance.profile.allowedReviewerIds === null
      ? null
      : new Set(input.governance.profile.allowedReviewerIds);
  const required = new Set(input.governance.profile.requiredReviewerIds);
  const reviewers = [...reviewerIds].sort().map((reviewerId) => {
    const review = latestReview(input.snapshot!.reviews, reviewerId);
    const currentHead = review?.commitSha === headSha;
    const state =
      review?.state === "approved" ||
      review?.state === "changes_requested" ||
      review?.state === "commented" ||
      review?.state === "pending"
        ? review.state
        : "missing";
    return {
      reviewerId,
      required: required.has(reviewerId),
      allowed: allowed === null || allowed.has(reviewerId),
      state,
      currentHead,
    };
  });

  const functionAllowed = ["PASSED", "NOT_REQUIRED"].includes(input.functionValidation.state);
  const allowedByAll = input.evaluation.allowed && functionAllowed;
  const pending = input.evaluation.blockers.some((blocker) =>
    ["mergeability_unknown", "required_check_pending", "required_check_missing"].includes(
      blocker.code
    )
  );
  return {
    state: allowedByAll ? "SATISFIED" : pending ? "PENDING" : "BLOCKED",
    message: allowedByAll
      ? "Exact-head approvals, checks, repository validation, and mergeability satisfy policy."
      : !functionAllowed
        ? input.functionValidation.message
        : pending
          ? "Governance evidence is still being collected for the exact proposal head."
          : "The exact proposal head does not satisfy promotion policy.",
    evaluatedHeadSha: headSha,
    countedReviewerIds: [...input.evaluation.countedReviewerIds],
    checks,
    reviewers,
    blockers: input.evaluation.blockers.map(presentBlocker),
    functionValidation: input.functionValidation,
  };
}
