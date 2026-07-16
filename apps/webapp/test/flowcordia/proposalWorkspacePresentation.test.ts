import type {
  ControlPlaneError,
  ProposalState,
  WorkflowProposalAggregate,
} from "@flowcordia/control-plane";
import { describe, expect, it } from "vitest";
import {
  flowcordiaProposalStateLabel,
  presentFlowcordiaProposal,
  presentFlowcordiaProposalCommandAcknowledgement,
  presentFlowcordiaProposalCommandError,
  presentFlowcordiaProposalWorkspaceCursor,
  summarizeFlowcordiaProposals,
} from "../../app/features/flowcordia/proposals/workspace/presentation";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const MERGE_SHA = "c".repeat(40);

function aggregate(overrides: Partial<WorkflowProposalAggregate> = {}): WorkflowProposalAggregate {
  return {
    storageId: "secret-storage-id",
    proposalId: "proposal-order-intake",
    workflowId: "order_intake",
    workflowPath: ".flowcordia/workflows/order_intake.json",
    desiredWorkflowSha256: "d".repeat(64),
    tenantId: "secret-tenant-id",
    projectId: "secret-project-id",
    installationId: 9_876_543,
    repositoryId: "secret-repository-database-id",
    repositoryGithubId: "secret-repository-github-id",
    repository: { owner: "acme", name: "automations", branch: "main" },
    baseBranch: "main",
    baseCommitSha: BASE_SHA,
    expectedBaseBlobSha: "e".repeat(40),
    proposalBranch: "flowcordia/proposals/order_intake/proposal-order-intake",
    creatorReviewerId: "secret-reviewer-id",
    createdByUserId: "secret-user-id",
    state: "READY",
    operation: "submit",
    headSha: HEAD_SHA,
    pullRequestNumber: 17,
    pullRequestUrl: "https://github.com/acme/automations/pull/17",
    pullRequestDraft: false,
    pullRequestState: "open",
    merged: false,
    mergeCommitSha: MERGE_SHA,
    lastErrorCode: "policy_blocked",
    lastErrorMessage: "secret-provider-error-detail",
    lastCorrelationId: "secret-correlation-id",
    lastGithubEventAt: new Date("2026-07-15T08:01:00.000Z"),
    lastPullRequestEventAt: new Date("2026-07-15T08:02:00.000Z"),
    lastReconciledAt: new Date("2026-07-15T08:03:00.000Z"),
    version: 42,
    createdAt: new Date("2026-07-15T08:00:00.000Z"),
    updatedAt: new Date("2026-07-15T08:04:00.000Z"),
    ...overrides,
  };
}

describe("Flowcordia proposal workspace presentation", () => {
  it("returns the explicit browser contract without internal scope or provider details", () => {
    const result = presentFlowcordiaProposal(aggregate());

    expect(result).toEqual({
      proposalId: "proposal-order-intake",
      workflow: {
        id: "order_intake",
        path: ".flowcordia/workflows/order_intake.json",
        desiredSha256: "d".repeat(64),
      },
      repository: { owner: "acme", name: "automations" },
      git: {
        baseBranch: "main",
        baseCommitSha: BASE_SHA,
        proposalBranch: "flowcordia/proposals/order_intake/proposal-order-intake",
        headSha: HEAD_SHA,
      },
      pullRequest: {
        number: 17,
        url: "https://github.com/acme/automations/pull/17",
        draft: false,
        state: "open",
        merged: false,
        mergeCommitSha: MERGE_SHA,
      },
      state: "READY",
      operation: "submit",
      availableAction: "promote",
      lastError: {
        code: "policy_blocked",
        message: "GitHub review, check, or branch policy is not satisfied yet.",
      },
      activity: {
        githubEventAt: "2026-07-15T08:01:00.000Z",
        pullRequestEventAt: "2026-07-15T08:02:00.000Z",
        reconciledAt: "2026-07-15T08:03:00.000Z",
        createdAt: "2026-07-15T08:00:00.000Z",
        updatedAt: "2026-07-15T08:04:00.000Z",
      },
    });

    const serialized = JSON.stringify(result);
    for (const sensitive of [
      "secret-storage-id",
      "secret-tenant-id",
      "secret-project-id",
      "secret-repository-database-id",
      "secret-repository-github-id",
      "secret-reviewer-id",
      "secret-user-id",
      "secret-provider-error-detail",
      "secret-correlation-id",
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
    expect(result).not.toHaveProperty("installationId");
    expect(result).not.toHaveProperty("version");
  });

  it("only emits credential-free HTTPS pull-request URLs", () => {
    expect(
      presentFlowcordiaProposal(
        aggregate({ pullRequestUrl: "http://github.example.test/acme/automations/pull/17" })
      ).pullRequest?.url
    ).toBeNull();
    expect(
      presentFlowcordiaProposal(
        aggregate({
          pullRequestUrl: "https://token:secret@github.example.test/acme/automations/pull/17#raw",
        })
      ).pullRequest?.url
    ).toBeNull();
    expect(
      presentFlowcordiaProposal(
        aggregate({ pullRequestUrl: "https://github.example.test/acme/automations/pull/17" })
      ).pullRequest?.url
    ).toBe("https://github.example.test/acme/automations/pull/17");
    expect(
      presentFlowcordiaProposal(
        aggregate({ pullRequestUrl: "https://github.example.test/other/repository/pull/17" })
      ).pullRequest?.url
    ).toBeNull();
    expect(
      presentFlowcordiaProposal(
        aggregate({ pullRequestUrl: "https://github.example.test/acme/automations/pull/99" })
      ).pullRequest?.url
    ).toBeNull();
  });

  it("returns a minimal command acknowledgement for the browser", () => {
    const result = presentFlowcordiaProposalCommandAcknowledgement(aggregate());

    expect(result).toEqual({
      ok: true,
      proposalId: "proposal-order-intake",
      state: "READY",
      updatedAt: "2026-07-15T08:04:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("secret-tenant-id");
    expect(JSON.stringify(result)).not.toContain("secret-storage-id");
  });

  it("normalizes command failures without returning provider details", () => {
    const error: ControlPlaneError = {
      code: "github_operation_failed",
      message: "secret-control-plane-provider-detail",
      retryable: false,
      github: {
        code: "policy_blocked",
        operation: "promote",
        phase: "policy",
        message: "secret-github-provider-detail",
        retryable: false,
      },
    };

    const result = presentFlowcordiaProposalCommandError(error);
    expect(result).toEqual({
      error: {
        code: "github_operation_failed",
        message: "GitHub review, check, or branch policy is not satisfied yet.",
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret-control-plane-provider-detail");
    expect(JSON.stringify(result)).not.toContain("secret-github-provider-detail");
  });

  it("uses public proposal identity instead of storage identity for pagination", () => {
    const result = presentFlowcordiaProposalWorkspaceCursor(aggregate());

    expect(result).toEqual({
      proposalId: "proposal-order-intake",
      updatedAt: "2026-07-15T08:04:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("secret-storage-id");
  });

  it("fails closed unless the current state and observed head allow one exact action", () => {
    expect(presentFlowcordiaProposal(aggregate({ state: "DRAFT" })).availableAction).toBe("submit");
    expect(presentFlowcordiaProposal(aggregate({ state: "READY" })).availableAction).toBe(
      "promote"
    );
    expect(
      presentFlowcordiaProposal(aggregate({ state: "RECONCILING" })).availableAction
    ).toBeNull();
    expect(
      presentFlowcordiaProposal(aggregate({ state: "READY", headSha: null })).availableAction
    ).toBeNull();
  });

  it("summarizes only the proposals in the loaded page", () => {
    const proposals = (["CREATING", "READY", "RECONCILING", "FAILED", "MERGED"] as const).map(
      (state) => presentFlowcordiaProposal(aggregate({ proposalId: `proposal-${state}`, state }))
    );

    expect(summarizeFlowcordiaProposals(proposals)).toEqual({
      total: 5,
      active: 3,
      awaitingReview: 1,
      needsAttention: 2,
      merged: 1,
    });
  });

  it("provides a user-facing label for every durable proposal state", () => {
    const states: ProposalState[] = [
      "CREATING",
      "DRAFT",
      "READY",
      "PROMOTING",
      "MERGED",
      "CLOSED",
      "RECONCILING",
      "FAILED",
    ];

    expect(states.map(flowcordiaProposalStateLabel)).toEqual([
      "Creating",
      "Draft",
      "Ready for promotion",
      "Promoting",
      "Merged",
      "Closed",
      "Reconciling",
      "Needs attention",
    ]);
  });
});
