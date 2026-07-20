import { workflowSha256 } from "@flowcordia/control-plane";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";

const mocks = vi.hoisted(() => ({
  assertContent: vi.fn(),
  assertTree: vi.fn(),
  claimMutation: vi.fn(),
  compareCommits: vi.fn(),
  completeIntent: vi.fn(),
  findAttempt: vi.fn(),
  findTarget: vi.fn(),
  readIntent: vi.fn(),
  recordFailure: vi.fn(),
  renewMutation: vi.fn(),
  retireIntent: vi.fn(),
  rollbackSourcePatches: vi.fn(),
  sourceRead: vi.fn(),
  workflowRead: vi.fn(),
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/intent.server", () => ({
  claimFlowcordiaRollbackMutation: mocks.claimMutation,
  completeFlowcordiaRollbackIntent: mocks.completeIntent,
  readFlowcordiaRollbackIntentByProposal: mocks.readIntent,
  recordFlowcordiaRollbackIntentFailure: mocks.recordFailure,
  renewFlowcordiaRollbackMutation: mocks.renewMutation,
  retireFlowcordiaRollbackIntent: mocks.retireIntent,
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/repository.server", () => ({
  findFlowcordiaRollbackAttempt: mocks.findAttempt,
  findFlowcordiaRollbackTarget: mocks.findTarget,
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/content-verification", () => ({
  assertFlowcordiaRollbackContentAtHead: mocks.assertContent,
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/diff-attestation.server", () => ({
  assertFlowcordiaRollbackDiffAtHead: mocks.assertTree,
}));

vi.mock("../../app/features/flowcordia/workflows/index/github.server", () => ({
  createWorkflowIndexGitHubGateway: vi.fn(async () => ({
    workflowStore: { read: mocks.workflowRead },
    sourcePatchStore: { read: mocks.sourceRead },
    repositoryComparison: { compareCommits: mocks.compareCommits },
  })),
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/service.server", () => ({
  rollbackRecovery: (input: Record<string, unknown>) => ({
    attemptProposalId: input.proposalId,
    branchName: input.branchName ?? "flowcordia/proposals/rollback-attempt",
    pullRequestNumber: input.pullRequestNumber ?? null,
    pullRequestUrl: input.pullRequestUrl ?? null,
    state: input.state,
    action: input.action,
  }),
  rollbackSourcePatches: mocks.rollbackSourcePatches,
}));

import { observeFlowcordiaRollbackProposal } from "../../app/features/flowcordia/workflows/rollback/status.server";
import { FlowcordiaRollbackError } from "../../app/features/flowcordia/workflows/rollback/errors";

const now = new Date("2026-07-20T23:30:00.000Z");
const scope = {
  tenantId: "org-1",
  projectId: "project-1",
  githubAppInstallationId: "github-installation-1",
  installationId: 100,
  repositoryId: "repository-1",
  repositoryGithubId: "200",
  repository: { owner: "acme", name: "workflow-repo", branch: "main" },
} satisfies WorkflowIndexScope;
const workflowId = "lead_intake";
const workflowPath = `.flowcordia/workflows/${workflowId}.json`;
const baseCommitSha = "a".repeat(40);
const baseBlobSha = "b".repeat(40);
const currentHeadSha = "c".repeat(40);
const currentMergeSha = "d".repeat(40);
const targetHeadSha = "e".repeat(40);
const targetMergeSha = "f".repeat(40);
const attemptHeadSha = "8".repeat(40);
const attemptProposalId = `rollback-${"9".repeat(64)}-a1`;

function workflow(name: string): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: workflowId,
    name,
    description: null,
    labels: [],
    nodes: [
      {
        id: "incoming",
        name: "Incoming",
        kind: "trigger",
        operation: "webhook.receive",
        position: { x: 0, y: 0 },
        configuration: {},
      },
    ],
    edges: [],
  };
}

const currentWorkflow = workflow("Current workflow");
const historicalWorkflow = workflow("Historical workflow");
const sourcePatches = [
  {
    path: "src/flowcordia/lead-intake.ts",
    sourceText: "export const leadIntake = async () => ({ ok: true });\n",
    expectedBlobSha: null,
  },
];

const intent = {
  id: "intent-1",
  status: "PENDING",
  resumed: true,
  rollbackKey: "9".repeat(64),
  attemptNumber: 1,
  targetProposalId: attemptProposalId,
  targetHeadSha: null,
  pullRequestNumber: null,
  sourcePatchCount: null,
  creatorReviewerId: "reviewer-1",
  workflowId,
  sourceProposalId: "proposal-target",
  sourceHeadSha: targetHeadSha,
  sourceMergeCommitSha: targetMergeSha,
  currentProposalId: "proposal-current",
  currentHeadSha,
  currentMergeCommitSha: currentMergeSha,
  baseCommitSha,
  baseBlobSha,
  mutationLeaseExpiresAt: new Date(now.getTime() - 1_000),
};

const attempt = {
  state: "DRAFT",
  headSha: attemptHeadSha,
  pullRequestNumber: 51,
  pullRequestUrl: "https://github.com/acme/workflow-repo/pull/51",
  pullRequestState: "open",
  merged: false,
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.readIntent.mockResolvedValue(intent);
  mocks.findAttempt.mockResolvedValue(attempt);
  mocks.findTarget.mockImplementation(async ({ proposalId }: { proposalId: string }) =>
    proposalId === intent.sourceProposalId
      ? {
          proposalId,
          workflowId,
          workflowPath,
          desiredWorkflowSha256: workflowSha256(historicalWorkflow),
          headSha: targetHeadSha,
          mergeCommitSha: targetMergeSha,
          pullRequestNumber: 41,
        }
      : {
          proposalId,
          workflowId,
          workflowPath,
          desiredWorkflowSha256: workflowSha256(currentWorkflow),
          headSha: currentHeadSha,
          mergeCommitSha: currentMergeSha,
          pullRequestNumber: 46,
        }
  );
  mocks.workflowRead.mockImplementation(async ({ revision }: { revision: string }) => {
    const historical = revision === targetMergeSha || revision === attemptHeadSha;
    return {
      success: true,
      value: {
        workflow: historical ? historicalWorkflow : currentWorkflow,
        source: {
          repository: scope.repository,
          path: workflowPath,
          requestedRevision: revision,
          commitSha: revision,
          blobSha: revision === baseCommitSha ? baseBlobSha : "7".repeat(40),
          sourceSchemaVersion: "0.1",
        },
        appliedMigrations: [],
      },
    };
  });
  mocks.rollbackSourcePatches.mockResolvedValue(sourcePatches);
  mocks.sourceRead.mockResolvedValue({
    success: true,
    value: {
      path: sourcePatches[0]!.path,
      sourceText: sourcePatches[0]!.sourceText,
      requestedRevision: attemptHeadSha,
      commitSha: attemptHeadSha,
      blobSha: "6".repeat(40),
    },
  });
  mocks.claimMutation.mockResolvedValue(true);
  mocks.renewMutation.mockResolvedValue(true);
  mocks.completeIntent.mockResolvedValue(undefined);
  mocks.assertContent.mockResolvedValue(undefined);
  mocks.assertTree.mockResolvedValue(undefined);
  mocks.recordFailure.mockResolvedValue(true);
  mocks.retireIntent.mockResolvedValue(true);
});

describe("Flowcordia rollback exact-attempt observation", () => {
  it("retires a proposal that changed after verification and requires explicit cleanup", async () => {
    mocks.readIntent.mockResolvedValue({
      ...intent,
      status: "PROPOSAL_CREATED",
      targetHeadSha: "7".repeat(40),
      pullRequestNumber: attempt.pullRequestNumber,
      sourcePatchCount: 1,
      mutationLeaseExpiresAt: null,
    });

    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).rejects.toMatchObject({
      code: "rollback_retry_required",
      recovery: {
        attemptProposalId,
        state: "OPEN",
        action: "CLOSE",
        pullRequestNumber: attempt.pullRequestNumber,
        pullRequestUrl: attempt.pullRequestUrl,
      },
    });
    expect(mocks.retireIntent).toHaveBeenCalledWith({
      intentId: intent.id,
      code: "verified_proposal_changed",
      message: expect.stringMatching(/changed after exact-head verification/),
      now,
      invalidateActiveLease: true,
    });
    expect(mocks.claimMutation).not.toHaveBeenCalled();
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });

  it("completes a reconciled DRAFT from immutable provenance after the live base moved", async () => {
    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).resolves.toMatchObject({
      proposalId: attemptProposalId,
      state: "DRAFT",
      headSha: attemptHeadSha,
      pullRequestNumber: 51,
      sourcePatchCount: 1,
      resumedIntent: true,
    });
    expect(mocks.workflowRead).toHaveBeenCalledWith({
      scope,
      workflowId,
      revision: baseCommitSha,
    });
    expect(mocks.completeIntent).toHaveBeenCalledWith({
      intentId: intent.id,
      targetHeadSha: attemptHeadSha,
      pullRequestNumber: 51,
      sourcePatchCount: 1,
      leaseToken: expect.any(String),
    });
    expect(mocks.assertContent).toHaveBeenCalledWith(
      expect.objectContaining({
        scope,
        workflow: historicalWorkflow,
        workflowPath,
        proposalHeadSha: attemptHeadSha,
      })
    );
    expect(mocks.assertTree).toHaveBeenCalledWith({
      repositoryComparison: { compareCommits: mocks.compareCommits },
      workflowId,
      workflowPath,
      baseCommitSha,
      proposalHeadSha: attemptHeadSha,
      sourcePatches,
    });
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("marks exact-head source mismatch terminal and returns bounded retry recovery", async () => {
    mocks.sourceRead.mockResolvedValue({
      success: true,
      value: {
        path: sourcePatches[0]!.path,
        sourceText: "export const stale = true;\n",
        requestedRevision: attemptHeadSha,
        commitSha: attemptHeadSha,
        blobSha: "6".repeat(40),
      },
    });

    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).rejects.toMatchObject({
      code: "rollback_retry_required",
      recovery: { attemptProposalId, state: "FAILED", action: "RETRY" },
    });
    expect(mocks.recordFailure).toHaveBeenCalledWith({
      intentId: intent.id,
      code: "source_snapshot_unavailable",
      message: expect.any(String),
      terminal: true,
      leaseToken: expect.any(String),
    });
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });

  it("never completes a recovered attempt after immutable diff attestation fails", async () => {
    mocks.assertTree.mockRejectedValue(
      new FlowcordiaRollbackError(
        "source_snapshot_unavailable",
        "The proposal contains an unrelated path.",
        409,
        false
      )
    );

    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).rejects.toMatchObject({
      code: "rollback_retry_required",
      recovery: { attemptProposalId, state: "FAILED", action: "RETRY" },
    });
    expect(mocks.recordFailure).toHaveBeenCalledWith({
      intentId: intent.id,
      code: "source_snapshot_unavailable",
      message: "The proposal contains an unrelated path.",
      terminal: true,
      leaseToken: expect.any(String),
    });
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });

  it("keeps retryable exact-head reads pending with refresh recovery", async () => {
    mocks.sourceRead.mockResolvedValue({
      success: false,
      error: {
        code: "unavailable",
        operation: "read_source",
        message: "GitHub is temporarily unavailable.",
        retryable: true,
      },
    });

    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).rejects.toMatchObject({
      code: "proposal_reconciling",
      recovery: { attemptProposalId, state: "RECONCILING", action: "WAIT" },
    });
    expect(mocks.recordFailure).toHaveBeenCalledWith({
      intentId: intent.id,
      code: "source_snapshot_unavailable",
      message: expect.any(String),
      terminal: false,
      leaseToken: expect.any(String),
    });
  });

  it("does not steal an active mutation lease from the original request", async () => {
    mocks.readIntent.mockResolvedValue({
      ...intent,
      mutationLeaseExpiresAt: new Date(now.getTime() + 60_000),
    });

    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).rejects.toMatchObject({
      code: "proposal_reconciling",
      recovery: { attemptProposalId, action: "WAIT" },
    });
    expect(mocks.claimMutation).not.toHaveBeenCalled();
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });

  it("retires a missing proposal only while the intent remains unclaimed", async () => {
    mocks.findAttempt.mockResolvedValue(null);

    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).rejects.toMatchObject({
      code: "rollback_retry_required",
      recovery: { attemptProposalId, state: "ABSENT", action: "RETRY" },
    });
    expect(mocks.retireIntent).toHaveBeenCalledWith({
      intentId: intent.id,
      code: "proposal_missing",
      message: expect.any(String),
      now,
      invalidateActiveLease: false,
    });
    expect(mocks.claimMutation).not.toHaveBeenCalled();
  });

  it("waits when a missing proposal intent is claimed during retirement", async () => {
    mocks.findAttempt.mockResolvedValue(null);
    mocks.retireIntent.mockResolvedValue(false);

    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).rejects.toMatchObject({
      code: "proposal_reconciling",
      recovery: { attemptProposalId, state: "PENDING", action: "WAIT" },
    });
    expect(mocks.claimMutation).not.toHaveBeenCalled();
  });

  it("converges when proposal completion wins the missing-attempt retirement race", async () => {
    const completedIntent = {
      ...intent,
      status: "PROPOSAL_CREATED",
      targetHeadSha: attemptHeadSha,
      pullRequestNumber: attempt.pullRequestNumber,
      sourcePatchCount: 1,
      mutationLeaseExpiresAt: null,
    };
    mocks.findAttempt.mockResolvedValueOnce(null).mockResolvedValueOnce(attempt);
    mocks.readIntent.mockResolvedValueOnce(intent).mockResolvedValueOnce(completedIntent);
    mocks.retireIntent.mockResolvedValue(false);

    await expect(
      observeFlowcordiaRollbackProposal({ scope, workflowId, attemptProposalId, now })
    ).resolves.toMatchObject({
      proposalId: attemptProposalId,
      state: "DRAFT",
      headSha: attemptHeadSha,
      pullRequestNumber: attempt.pullRequestNumber,
      sourcePatchCount: 1,
    });
    expect(mocks.claimMutation).not.toHaveBeenCalled();
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });
});
