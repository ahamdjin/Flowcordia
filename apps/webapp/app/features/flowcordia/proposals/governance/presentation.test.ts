import {
  defaultFlowcordiaProposalGovernanceProfile,
  effectiveFlowcordiaProposalPolicy,
  evaluateProposalPolicy,
  flowcordiaProposalGovernanceProfileDigest,
  type GitHubProposalSnapshot,
} from "@flowcordia/github-proposals";
import { describe, expect, it } from "vitest";
import type { FlowcordiaFunctionValidationProjection } from "../../workflows/validation/presentation";
import {
  presentFlowcordiaProposalGovernanceEvidence,
  presentFlowcordiaProposalGovernancePolicy,
} from "./presentation";
import type { ResolvedFlowcordiaProposalGovernance } from "./service.server";

const HEAD_SHA = "a".repeat(40);

function governance(): ResolvedFlowcordiaProposalGovernance {
  const profile = {
    ...defaultFlowcordiaProposalGovernanceProfile(),
    requiredReviewerIds: ["201"],
  };
  return {
    source: "stored",
    publicId: "4c9d73be-6502-4cb8-b929-5fbca8acc654",
    version: 3n,
    profile,
    policyDigest: flowcordiaProposalGovernanceProfileDigest(profile),
    effectivePolicy: effectiveFlowcordiaProposalPolicy(profile),
    updatedAt: new Date("2026-07-19T01:00:00.000Z"),
  };
}

function snapshot(
  reviews: GitHubProposalSnapshot["reviews"] = [
    {
      id: 1,
      reviewerId: "201",
      state: "approved",
      commitSha: HEAD_SHA,
      submittedAt: "2026-07-19T01:01:00.000Z",
    },
  ]
): GitHubProposalSnapshot {
  return {
    pullRequest: {
      number: 22,
      nodeId: "PR_node",
      url: "https://github.example.test/acme/workflows/pull/22",
      state: "open",
      draft: false,
      merged: false,
      mergeCommitSha: null,
      baseBranch: "main",
      headBranch: "flowcordia/proposals/order-intake/proposal-22",
      headSha: HEAD_SHA,
      authorId: "101",
      body: null,
      mergeable: true,
      mergeableState: "clean",
    },
    checks: [],
    reviews,
  };
}

function evidence(input: {
  snapshot?: GitHubProposalSnapshot;
  functionState?: FlowcordiaFunctionValidationProjection["state"];
}) {
  const resolved = governance();
  const github = input.snapshot ?? snapshot();
  return presentFlowcordiaProposalGovernanceEvidence({
    governance: resolved,
    snapshot: github,
    evaluation: evaluateProposalPolicy({
      snapshot: github,
      policy: resolved.effectivePolicy,
      expectedHeadSha: HEAD_SHA,
      expectedBaseBranch: "main",
      expectedProposalBranch: "flowcordia/proposals/order-intake/proposal-22",
      proposalCreatorReviewerId: "102",
    }),
    expectedHeadSha: HEAD_SHA,
    functionValidation: {
      state: input.functionState ?? "PASSED",
      message: "Bounded repository validation status.",
    },
  });
}

describe("Flowcordia proposal governance presentation", () => {
  it("projects the immutable enterprise floor and public policy identity", () => {
    expect(presentFlowcordiaProposalGovernancePolicy(governance())).toEqual({
      source: "stored",
      publicId: "4c9d73be-6502-4cb8-b929-5fbca8acc654",
      version: "3",
      digest: governance().policyDigest,
      minimumApprovals: 1,
      requiredCheckNames: [],
      requiredReviewerIds: ["201"],
      allowedReviewerIds: null,
      requireCurrentHeadApprovals: true,
      allowSelfApproval: false,
      blockChangesRequested: true,
      updatedAt: "2026-07-19T01:00:00.000Z",
    });
  });

  it("keeps a decisive approval visible when a later comment does not replace it", () => {
    const result = evidence({
      snapshot: snapshot([
        {
          id: 1,
          reviewerId: "201",
          state: "approved",
          commitSha: HEAD_SHA,
          submittedAt: "2026-07-19T01:01:00.000Z",
        },
        {
          id: 2,
          reviewerId: "201",
          state: "commented",
          commitSha: HEAD_SHA,
          submittedAt: "2026-07-19T01:02:00.000Z",
        },
      ]),
    });

    expect(result.state).toBe("SATISFIED");
    expect(result.countedReviewerIds).toEqual(["201"]);
    expect(result.reviewers).toEqual([
      {
        reviewerId: "201",
        required: true,
        allowed: true,
        state: "approved",
        currentHead: true,
      },
    ]);
  });

  it("clears dismissed approvals from both policy and reviewer evidence", () => {
    const result = evidence({
      snapshot: snapshot([
        {
          id: 1,
          reviewerId: "201",
          state: "approved",
          commitSha: HEAD_SHA,
          submittedAt: "2026-07-19T01:01:00.000Z",
        },
        {
          id: 2,
          reviewerId: "201",
          state: "dismissed",
          commitSha: HEAD_SHA,
          submittedAt: "2026-07-19T01:02:00.000Z",
        },
      ]),
    });

    expect(result.state).toBe("BLOCKED");
    expect(result.countedReviewerIds).toEqual([]);
    expect(result.reviewers[0]).toMatchObject({ state: "missing", currentHead: false });
  });

  it("distinguishes pending and unavailable validation from durable blockers", () => {
    expect(evidence({ functionState: "READY_TO_RUN" }).state).toBe("PENDING");
    expect(evidence({ functionState: "UNAVAILABLE" }).state).toBe("UNAVAILABLE");
    expect(evidence({ functionState: "FAILED" }).state).toBe("BLOCKED");
  });

  it("does not let pending validation hide a known GitHub blocker", () => {
    const blockedSnapshot = snapshot();
    blockedSnapshot.pullRequest.draft = true;

    expect(evidence({ snapshot: blockedSnapshot, functionState: "READY_TO_RUN" })).toMatchObject({
      state: "BLOCKED",
      blockers: [{ code: "pull_request_draft" }],
    });
  });
});
