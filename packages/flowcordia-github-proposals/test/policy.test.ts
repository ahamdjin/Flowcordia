import { describe, expect, it } from "vitest";

import { evaluateProposalPolicy, validateProposalPolicy } from "../src/index.js";
import {
  HEAD_SHA,
  createCheck,
  createPullRequest,
  createReview,
  createSnapshot,
} from "./fixtures.js";

function evaluate(
  snapshot = createSnapshot(),
  policy: Parameters<typeof evaluateProposalPolicy>[0]["policy"] = {},
  proposalCreatorReviewerId: string | null = "300"
) {
  const pullRequest = snapshot.pullRequest;
  return evaluateProposalPolicy({
    snapshot,
    policy,
    expectedHeadSha: HEAD_SHA,
    expectedBaseBranch: "main",
    expectedProposalBranch: pullRequest.headBranch,
    proposalCreatorReviewerId,
  });
}

describe("proposal policy", () => {
  it("allows one distinct non-author approval on the current head by default", () => {
    expect(evaluate().allowed).toBe(true);
    expect(evaluate().countedReviewerIds).toEqual(["200"]);
  });

  it("does not count an approval for a stale head", () => {
    const result = evaluate(
      createSnapshot({ reviews: [createReview({ commitSha: "a".repeat(40) })] })
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "approval_count" }));
  });

  it("can explicitly allow stale approvals when an organization chooses that policy", () => {
    const result = evaluate(
      createSnapshot({ reviews: [createReview({ commitSha: "a".repeat(40) })] }),
      { requireCurrentHeadApprovals: false }
    );
    expect(result.allowed).toBe(true);
  });

  it("excludes pull request author self-approval by default", () => {
    const result = evaluate(createSnapshot({ reviews: [createReview({ reviewerId: "100" })] }));
    expect(result.allowed).toBe(false);
    expect(result.countedReviewerIds).toEqual([]);
  });

  it("excludes the proposal creator when the GitHub App authored the pull request", () => {
    const result = evaluate(createSnapshot(), {}, "200");
    expect(result.allowed).toBe(false);
    expect(result.countedReviewerIds).toEqual([]);
  });

  it("allows self-approval only when policy opts in", () => {
    const result = evaluate(createSnapshot({ reviews: [createReview({ reviewerId: "100" })] }), {
      allowSelfApproval: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("uses the latest decisive review per reviewer", () => {
    const result = evaluate(
      createSnapshot({
        reviews: [
          createReview({ id: 1, state: "approved", submittedAt: "2026-07-15T10:00:00Z" }),
          createReview({
            id: 2,
            state: "changes_requested",
            submittedAt: "2026-07-15T11:00:00Z",
          }),
        ],
      })
    );
    expect(result.countedReviewerIds).toEqual([]);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "changes_requested" }));
  });

  it("a dismissed review clears that reviewer's prior blocker", () => {
    const result = evaluate(
      createSnapshot({
        reviews: [
          createReview({ id: 1, state: "changes_requested", submittedAt: "2026-07-15T10:00:00Z" }),
          createReview({ id: 2, state: "dismissed", submittedAt: "2026-07-15T11:00:00Z" }),
          createReview({ id: 3, reviewerId: "201", submittedAt: "2026-07-15T12:00:00Z" }),
        ],
      })
    );
    expect(result.allowed).toBe(true);
    expect(result.countedReviewerIds).toEqual(["201"]);
  });

  it("enforces named required reviewers", () => {
    const result = evaluate(createSnapshot(), {
      minimumApprovals: 0,
      requiredReviewerIds: ["201"],
    });
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "required_reviewer", reviewerId: "201" })
    );
  });

  it("counts only reviewers in the allowlist", () => {
    const result = evaluate(createSnapshot(), { allowedReviewerIds: ["201"] });
    expect(result.countedReviewerIds).toEqual([]);
    expect(result.allowed).toBe(false);
  });

  it("reports a missing required check for the current head", () => {
    const result = evaluate(createSnapshot({ checks: [] }), { requiredCheckNames: ["PR Checks"] });
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "required_check_missing", checkName: "PR Checks" })
    );
  });

  it("reports a pending required check", () => {
    const result = evaluate(
      createSnapshot({ checks: [createCheck({ status: "in_progress", conclusion: null })] }),
      { requiredCheckNames: ["PR Checks"] }
    );
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "required_check_pending" })
    );
  });

  it("reports a failed required check", () => {
    const result = evaluate(createSnapshot({ checks: [createCheck({ conclusion: "failure" })] }), {
      requiredCheckNames: ["PR Checks"],
    });
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "required_check_failed" })
    );
  });

  it("accepts success, neutral, and skipped check conclusions", () => {
    for (const conclusion of ["success", "neutral", "skipped"]) {
      expect(
        evaluate(createSnapshot({ checks: [createCheck({ conclusion })] }), {
          requiredCheckNames: ["PR Checks"],
        }).allowed
      ).toBe(true);
    }
  });

  it("uses the newest check attempt with the same name", () => {
    const result = evaluate(
      createSnapshot({
        checks: [
          createCheck({ id: 1, conclusion: "failure", completedAt: "2026-07-15T10:01:00Z" }),
          createCheck({ id: 2, conclusion: "success", completedAt: "2026-07-15T10:02:00Z" }),
        ],
      }),
      { requiredCheckNames: ["PR Checks"] }
    );
    expect(result.allowed).toBe(true);
  });

  it("ignores a successful check reported for another commit", () => {
    const result = evaluate(
      createSnapshot({ checks: [createCheck({ commitSha: "a".repeat(40) })] }),
      { requiredCheckNames: ["PR Checks"] }
    );
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "required_check_missing" })
    );
  });

  it("blocks draft and closed pull requests", () => {
    const result = evaluate(createSnapshot({ pullRequest: { draft: true, state: "closed" } }));
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["pull_request_draft", "pull_request_closed"])
    );
  });

  it("fails closed on unknown mergeability and conflicts", () => {
    expect(
      evaluate(createSnapshot({ pullRequest: { mergeable: null, mergeableState: "unknown" } }))
        .blockers
    ).toContainEqual(expect.objectContaining({ code: "mergeability_unknown" }));
    expect(
      evaluate(createSnapshot({ pullRequest: { mergeable: false, mergeableState: "dirty" } }))
        .blockers
    ).toContainEqual(expect.objectContaining({ code: "merge_conflict" }));
  });

  it("reports exact base, branch, and head identity drift", () => {
    const snapshot = createSnapshot({
      pullRequest: { baseBranch: "release", headBranch: "other", headSha: "f".repeat(40) },
    });
    const result = evaluateProposalPolicy({
      snapshot,
      policy: {},
      expectedHeadSha: HEAD_SHA,
      expectedBaseBranch: "main",
      expectedProposalBranch: createPullRequest().headBranch,
      proposalCreatorReviewerId: "300",
    });
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["base_changed", "branch_changed", "head_changed"])
    );
  });

  it("validates bounded, unique policy configuration", () => {
    expect(validateProposalPolicy({ minimumApprovals: -1 })).toContain(
      "Minimum approvals must be an integer between 0 and 100."
    );
    expect(validateProposalPolicy({ requiredCheckNames: ["ci", "ci"] })).toContain(
      "Required check names must not contain duplicates."
    );
    expect(
      validateProposalPolicy({ requiredReviewerIds: ["201"], allowedReviewerIds: ["202"] })
    ).toContain("Every required reviewer must also be present in the allowed reviewer list.");
    expect(validateProposalPolicy({ requiredReviewerIds: ["mutable-login"] })).toContain(
      "Required reviewer IDs contains an invalid item."
    );
  });
});
