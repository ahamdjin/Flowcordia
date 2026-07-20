import { workflowSha256 } from "@flowcordia/control-plane";
import type { WorkflowDefinition, WorkflowFunctionDefinition } from "@flowcordia/workflow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";

const mocks = vi.hoisted(() => ({
  assertContent: vi.fn(),
  assertTree: vi.fn(),
  catalogDiscover: vi.fn(),
  completeIntent: vi.fn(),
  claimMutation: vi.fn(),
  compareCommits: vi.fn(),
  createAttemptInspector: vi.fn(),
  createProposal: vi.fn(),
  createProposalCommandService: vi.fn(),
  createSourceAwareProposal: vi.fn(),
  createSourceAwareProposalCommandService: vi.fn(),
  createWorkflowIndexGitHubGateway: vi.fn(),
  findAttempt: vi.fn(),
  findTarget: vi.fn(),
  functionCatalogRead: vi.fn(),
  inspectAttempt: vi.fn(),
  preparePreview: vi.fn(),
  queryHistory: vi.fn(),
  readLatestIntent: vi.fn(),
  recordIntentFailure: vi.fn(),
  renewMutation: vi.fn(),
  reserveIntent: vi.fn(),
  retireIntent: vi.fn(),
  sourcePatchRead: vi.fn(),
  workflowRead: vi.fn(),
}));

vi.mock("../../app/features/flowcordia/workflows/index/github.server", () => ({
  createWorkflowIndexGitHubGateway: mocks.createWorkflowIndexGitHubGateway,
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/repository.server", () => ({
  findFlowcordiaRollbackAttempt: mocks.findAttempt,
  findFlowcordiaRollbackTarget: mocks.findTarget,
  queryFlowcordiaRollbackHistory: mocks.queryHistory,
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/content-verification", () => ({
  assertFlowcordiaRollbackContentAtHead: mocks.assertContent,
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/diff-attestation.server", () => ({
  assertFlowcordiaRollbackDiffAtHead: mocks.assertTree,
}));

vi.mock("../../app/features/flowcordia/workflows/rollback/intent.server", () => ({
  completeFlowcordiaRollbackIntent: mocks.completeIntent,
  claimFlowcordiaRollbackMutation: mocks.claimMutation,
  readLatestFlowcordiaRollbackIntent: mocks.readLatestIntent,
  recordFlowcordiaRollbackIntentFailure: mocks.recordIntentFailure,
  renewFlowcordiaRollbackMutation: mocks.renewMutation,
  reserveFlowcordiaRollbackIntent: mocks.reserveIntent,
  retireFlowcordiaRollbackIntent: mocks.retireIntent,
}));

vi.mock("../../app/features/flowcordia/workflows/preview/environment.server", () => ({
  prepareFlowcordiaPreviewEnvironment: mocks.preparePreview,
}));

vi.mock("../../app/features/flowcordia/proposals/service.server", () => ({
  createProposalCommandService: mocks.createProposalCommandService,
}));

vi.mock("../../app/features/flowcordia/proposals/source-command.server", () => ({
  createSourceAwareProposalCommandService: mocks.createSourceAwareProposalCommandService,
}));

vi.mock("../../app/features/flowcordia/proposals/github.server", () => ({
  createGitHubProposalAttemptInspector: mocks.createAttemptInspector,
}));

import {
  createFlowcordiaRollbackProposal,
  rollbackSourcePatches,
} from "../../app/features/flowcordia/workflows/rollback/service.server";
import { FlowcordiaRollbackError } from "../../app/features/flowcordia/workflows/rollback/errors";

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
const targetBlobSha = "7".repeat(40);
const attemptProposalId = `rollback-${"9".repeat(64)}-a1`;
const attemptHeadSha = "8".repeat(40);

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
const repositoryFunction = {
  id: "enrich_lead",
  name: "Enrich lead",
  codeReference: {
    path: "src/flowcordia/enrich-lead.ts",
    exportName: "enrichLead",
  },
  inputSchema: { type: "object", properties: {} },
  outputSchema: { type: "object", properties: {} },
} satisfies WorkflowFunctionDefinition;
const codeOnlyWorkflow = {
  ...workflow("Code workflow"),
  nodes: [
    {
      id: "enrich",
      name: "Enrich lead",
      kind: "code",
      operation: "code.task",
      position: { x: 0, y: 0 },
      configuration: { functionId: repositoryFunction.id },
      inputSchema: repositoryFunction.inputSchema,
      outputSchema: repositoryFunction.outputSchema,
      codeReference: repositoryFunction.codeReference,
    },
  ],
} satisfies WorkflowDefinition;

const current = {
  proposalId: "proposal-current",
  headSha: currentHeadSha,
  mergeCommitSha: currentMergeSha,
  pullRequestNumber: 46,
};

const target = {
  proposalId: "proposal-target",
  headSha: targetHeadSha,
  mergeCommitSha: targetMergeSha,
  pullRequestNumber: 41,
};

const intent = {
  id: "intent-1",
  status: "PENDING",
  resumed: false,
  rollbackKey: "9".repeat(64),
  attemptNumber: 1,
  targetProposalId: attemptProposalId,
  targetHeadSha: null,
  pullRequestNumber: null,
  sourcePatchCount: null,
  creatorReviewerId: "reviewer-1",
};

const command = {
  scope,
  workflowId,
  targetProposalId: target.proposalId,
  expectedTargetHeadSha: targetHeadSha,
  expectedTargetMergeCommitSha: targetMergeSha,
  expectedCurrentProposalId: current.proposalId,
  expectedCurrentHeadSha: currentHeadSha,
  expectedCurrentMergeCommitSha: currentMergeSha,
  expectedBaseCommitSha: baseCommitSha,
  expectedBaseBlobSha: baseBlobSha,
  reason: "Restore the reviewed version.",
  retryFailedIntent: false,
  actorId: "user-1",
  creatorReviewerId: "reviewer-1",
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.createWorkflowIndexGitHubGateway.mockResolvedValue({
    workflowStore: { read: mocks.workflowRead },
    functionCatalog: { read: mocks.functionCatalogRead },
    sourcePatchStore: { read: mocks.sourcePatchRead },
    repositoryComparison: { compareCommits: mocks.compareCommits },
    catalog: { discover: mocks.catalogDiscover },
  });
  mocks.catalogDiscover.mockResolvedValue({
    success: true,
    value: {
      commitSha: baseCommitSha,
      entries: [{ workflowId, path: workflowPath, blobSha: baseBlobSha, size: 100 }],
    },
  });
  mocks.workflowRead.mockImplementation(async ({ revision }: { revision?: string }) => {
    const historical = revision === targetMergeSha;
    return {
      success: true,
      value: {
        workflow: historical ? historicalWorkflow : currentWorkflow,
        source: {
          repository: scope.repository,
          path: workflowPath,
          requestedRevision: revision ?? scope.repository.branch,
          commitSha: historical ? targetMergeSha : baseCommitSha,
          blobSha: historical ? targetBlobSha : baseBlobSha,
          sourceSchemaVersion: "0.1",
        },
        appliedMigrations: [],
      },
    };
  });
  mocks.queryHistory.mockResolvedValue({ current, candidates: [target] });
  mocks.findTarget.mockResolvedValue({
    ...target,
    workflowId,
    workflowPath,
    desiredWorkflowSha256: workflowSha256(historicalWorkflow),
  });
  mocks.readLatestIntent.mockResolvedValue(null);
  mocks.reserveIntent.mockResolvedValue(intent);
  mocks.findAttempt.mockResolvedValue(null);
  mocks.preparePreview.mockResolvedValue({
    state: "READY",
    branchName: `flowcordia/proposals/${workflowId}/${attemptProposalId}`,
    alreadyExisted: false,
  });
  mocks.createProposalCommandService.mockResolvedValue({ create: mocks.createProposal });
  mocks.createSourceAwareProposalCommandService.mockResolvedValue({
    create: mocks.createSourceAwareProposal,
  });
  mocks.createAttemptInspector.mockResolvedValue({ inspect: mocks.inspectAttempt });
  mocks.completeIntent.mockResolvedValue(undefined);
  mocks.assertContent.mockResolvedValue(undefined);
  mocks.assertTree.mockResolvedValue(undefined);
  mocks.claimMutation.mockResolvedValue(true);
  mocks.recordIntentFailure.mockResolvedValue(true);
  mocks.renewMutation.mockResolvedValue(true);
  mocks.retireIntent.mockResolvedValue(true);
});

describe("Flowcordia rollback proposal service recovery", () => {
  it("completes durable provenance only after content and diff attestation", async () => {
    mocks.createProposal.mockResolvedValue({
      success: true,
      value: {
        proposal: {
          proposalId: attemptProposalId,
          state: "DRAFT",
          headSha: attemptHeadSha,
          pullRequestNumber: 51,
        },
        github: null,
        resumed: false,
      },
    });

    await expect(createFlowcordiaRollbackProposal(command)).resolves.toMatchObject({
      proposalId: attemptProposalId,
      state: "DRAFT",
      headSha: attemptHeadSha,
      pullRequestNumber: 51,
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
      sourcePatches: [],
    });
    expect(mocks.completeIntent).toHaveBeenCalledWith({
      intentId: intent.id,
      targetHeadSha: attemptHeadSha,
      pullRequestNumber: 51,
      sourcePatchCount: 0,
      leaseToken: expect.any(String),
    });
  });

  it("never completes provenance after immutable diff attestation fails", async () => {
    mocks.createProposal.mockResolvedValue({
      success: true,
      value: {
        proposal: {
          proposalId: attemptProposalId,
          state: "DRAFT",
          headSha: attemptHeadSha,
          pullRequestNumber: 51,
        },
        github: null,
        resumed: false,
      },
    });
    mocks.assertTree.mockRejectedValue(
      new FlowcordiaRollbackError(
        "source_snapshot_unavailable",
        "The proposal contains an unrelated path.",
        409,
        false
      )
    );

    await expect(createFlowcordiaRollbackProposal(command)).rejects.toMatchObject({
      code: "rollback_retry_required",
      recovery: { attemptProposalId, state: "FAILED", action: "RETRY" },
    });
    expect(mocks.recordIntentFailure).toHaveBeenCalledWith({
      intentId: intent.id,
      code: "source_snapshot_unavailable",
      message: "The proposal contains an unrelated path.",
      terminal: true,
      leaseToken: expect.any(String),
    });
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });

  it("creates a source-aware rollback when only repository function code changed", async () => {
    const historicalSource = "export const enrichLead = async () => ({ restored: true });\n";
    const currentSource = "export const enrichLead = async () => ({ restored: false });\n";
    mocks.workflowRead.mockImplementation(async ({ revision }: { revision?: string }) => {
      const historical = revision === targetMergeSha;
      return {
        success: true,
        value: {
          workflow: codeOnlyWorkflow,
          source: {
            repository: scope.repository,
            path: workflowPath,
            requestedRevision: revision ?? scope.repository.branch,
            commitSha: historical ? targetMergeSha : baseCommitSha,
            blobSha: historical ? targetBlobSha : baseBlobSha,
            sourceSchemaVersion: "0.1",
          },
          appliedMigrations: [],
        },
      };
    });
    mocks.findTarget.mockResolvedValue({
      ...target,
      workflowId,
      workflowPath,
      desiredWorkflowSha256: workflowSha256(codeOnlyWorkflow),
    });
    mocks.functionCatalogRead.mockImplementation(async ({ revision }: { revision: string }) => ({
      success: true,
      value: {
        catalog: { schemaVersion: "0.1", functions: [repositoryFunction] },
        source: { commitSha: revision },
      },
    }));
    mocks.sourcePatchRead.mockImplementation(
      async ({ path, revision }: { path: string; revision: string }) => ({
        success: true,
        value: {
          path,
          sourceText: revision === targetMergeSha ? historicalSource : currentSource,
          requestedRevision: revision,
          commitSha: revision,
          blobSha: revision === targetMergeSha ? "1".repeat(40) : "2".repeat(40),
        },
      })
    );
    mocks.createSourceAwareProposal.mockResolvedValue({
      success: false,
      error: {
        code: "github_operation_failed",
        operation: "create",
        proposalId: attemptProposalId,
        message: "GitHub is temporarily unavailable.",
        retryable: true,
      },
    });

    await expect(createFlowcordiaRollbackProposal(command)).rejects.toMatchObject({
      code: "proposal_failed",
      recovery: { attemptProposalId, state: "PENDING", action: "RETRY" },
    });
    expect(mocks.createSourceAwareProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: codeOnlyWorkflow,
        sourcePatches: [
          {
            path: repositoryFunction.codeReference.path,
            sourceText: historicalSource,
            expectedBlobSha: "2".repeat(40),
          },
        ],
        sourceDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("fails closed when another current workflow uses a source file that would be replaced", async () => {
    const historicalSource = "export const enrichLead = async () => ({ restored: true });\n";
    const currentSource = "export const enrichLead = async () => ({ restored: false });\n";
    const sharedWorkflowId = "customer_sync";
    const sharedWorkflowPath = `.flowcordia/workflows/${sharedWorkflowId}.json`;
    const sharedWorkflowBlobSha = "3".repeat(40);
    const sharedWorkflow = {
      ...codeOnlyWorkflow,
      id: sharedWorkflowId,
      nodes: codeOnlyWorkflow.nodes.map((node) => ({ ...node, id: "shared_enrich" })),
    } satisfies WorkflowDefinition;
    mocks.functionCatalogRead.mockImplementation(async ({ revision }: { revision: string }) => ({
      success: true,
      value: {
        catalog: { schemaVersion: "0.1", functions: [repositoryFunction] },
        source: { commitSha: revision },
      },
    }));
    mocks.sourcePatchRead.mockImplementation(
      async ({ path, revision }: { path: string; revision: string }) => ({
        success: true,
        value: {
          path,
          sourceText: revision === targetMergeSha ? historicalSource : currentSource,
          requestedRevision: revision,
          commitSha: revision,
          blobSha: revision === targetMergeSha ? "1".repeat(40) : "2".repeat(40),
        },
      })
    );
    mocks.catalogDiscover.mockResolvedValue({
      success: true,
      value: {
        commitSha: baseCommitSha,
        entries: [
          { workflowId, path: workflowPath, blobSha: baseBlobSha, size: 100 },
          {
            workflowId: sharedWorkflowId,
            path: sharedWorkflowPath,
            blobSha: sharedWorkflowBlobSha,
            size: 100,
          },
        ],
      },
    });
    mocks.workflowRead.mockResolvedValue({
      success: true,
      value: {
        workflow: sharedWorkflow,
        source: {
          repository: scope.repository,
          path: sharedWorkflowPath,
          requestedRevision: baseCommitSha,
          commitSha: baseCommitSha,
          blobSha: sharedWorkflowBlobSha,
          sourceSchemaVersion: "0.1",
        },
        appliedMigrations: [],
      },
    });

    await expect(
      rollbackSourcePatches({
        scope,
        workflow: codeOnlyWorkflow,
        targetRevision: targetMergeSha,
        currentRevision: baseCommitSha,
      })
    ).rejects.toMatchObject<Partial<FlowcordiaRollbackError>>({
      code: "function_catalog_conflict",
      status: 409,
      retryable: false,
      message: expect.stringMatching(/also used by workflow "customer_sync"/),
    });
    expect(mocks.catalogDiscover).toHaveBeenCalledWith({
      scope,
      revision: baseCommitSha,
    });
  });

  it("blocks source rollback when exact workflow ownership discovery is truncated", async () => {
    mocks.functionCatalogRead.mockImplementation(async ({ revision }: { revision: string }) => ({
      success: true,
      value: {
        catalog: { schemaVersion: "0.1", functions: [repositoryFunction] },
        source: { commitSha: revision },
      },
    }));
    mocks.sourcePatchRead.mockImplementation(
      async ({ path, revision }: { path: string; revision: string }) => ({
        success: true,
        value: {
          path,
          sourceText:
            revision === targetMergeSha
              ? "export const restored = true;\n"
              : "export const restored = false;\n",
          requestedRevision: revision,
          commitSha: revision,
          blobSha: revision === targetMergeSha ? "1".repeat(40) : "2".repeat(40),
        },
      })
    );
    mocks.catalogDiscover.mockResolvedValue({
      success: false,
      error: {
        code: "truncated_tree",
        message: "GitHub truncated the repository tree.",
        retryable: true,
      },
    });

    await expect(
      rollbackSourcePatches({
        scope,
        workflow: codeOnlyWorkflow,
        targetRevision: targetMergeSha,
        currentRevision: baseCommitSha,
      })
    ).rejects.toMatchObject<Partial<FlowcordiaRollbackError>>({
      code: "function_catalog_conflict",
      status: 503,
      retryable: true,
    });
  });

  it("does not mutate GitHub when another request owns the intent lease", async () => {
    mocks.claimMutation.mockResolvedValue(false);

    await expect(createFlowcordiaRollbackProposal(command)).rejects.toMatchObject({
      code: "proposal_reconciling",
      status: 409,
      retryable: false,
      recovery: {
        attemptProposalId,
        state: "PENDING",
        action: "WAIT",
      },
    });
    expect(mocks.preparePreview).not.toHaveBeenCalled();
    expect(mocks.createProposal).not.toHaveBeenCalled();
    expect(mocks.createSourceAwareProposal).not.toHaveBeenCalled();
    expect(mocks.recordIntentFailure).not.toHaveBeenCalled();
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });

  it("re-fences the lease after preview before starting a GitHub mutation", async () => {
    mocks.renewMutation.mockResolvedValueOnce(false);
    mocks.recordIntentFailure.mockResolvedValueOnce(false);

    await expect(createFlowcordiaRollbackProposal(command)).rejects.toMatchObject({
      code: "proposal_reconciling",
      status: 409,
      retryable: false,
      recovery: {
        attemptProposalId,
        state: "RECONCILING",
        action: "WAIT",
      },
    });
    expect(mocks.preparePreview).toHaveBeenCalledOnce();
    expect(mocks.renewMutation).toHaveBeenCalledOnce();
    expect(mocks.createProposal).not.toHaveBeenCalled();
    expect(mocks.createSourceAwareProposal).not.toHaveBeenCalled();
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });

  it("keeps a retryable GitHub mutation pending for reconciliation", async () => {
    const proposalBranch = `flowcordia/proposals/${workflowId}/${attemptProposalId}`;
    mocks.createProposal.mockResolvedValue({
      success: false,
      error: {
        code: "github_operation_failed",
        operation: "create",
        proposalId: attemptProposalId,
        message: "GitHub is temporarily unavailable.",
        retryable: true,
        github: {
          code: "unavailable",
          operation: "create",
          phase: "branch",
          message: "GitHub is temporarily unavailable.",
          retryable: true,
          proposalId: attemptProposalId,
          proposalBranch,
        },
      },
    });

    await expect(createFlowcordiaRollbackProposal(command)).rejects.toMatchObject({
      code: "proposal_reconciling",
      status: 409,
      retryable: true,
      recovery: {
        attemptProposalId,
        branchName: proposalBranch,
        pullRequestNumber: null,
        state: "RECONCILING",
        action: "WAIT",
      },
    });
    expect(mocks.recordIntentFailure).toHaveBeenCalledWith({
      intentId: intent.id,
      code: "proposal_reconciling",
      message: "GitHub is temporarily unavailable.",
      terminal: false,
      leaseToken: expect.any(String),
    });
    expect(mocks.completeIntent).not.toHaveBeenCalled();
    expect(mocks.retireIntent).not.toHaveBeenCalled();
  });

  it.each([
    { attemptState: "FAILED", retirementCode: "proposal_failed" },
    { attemptState: "CLOSED", retirementCode: "proposal_closed" },
  ] as const)(
    "retires a terminal $attemptState proposal before requiring a fresh attempt",
    async ({ attemptState, retirementCode }) => {
      const pullRequestUrl = "https://github.com/acme/workflow-repo/pull/41";
      mocks.findAttempt.mockResolvedValue({
        state: attemptState,
        headSha: null,
        pullRequestNumber: 41,
        pullRequestUrl,
        pullRequestState: attemptState === "CLOSED" ? "closed" : null,
        merged: false,
      });

      await expect(createFlowcordiaRollbackProposal(command)).rejects.toMatchObject({
        code: "rollback_retry_required",
        status: 409,
        retryable: false,
        recovery: {
          attemptProposalId,
          pullRequestNumber: 41,
          pullRequestUrl,
          state: attemptState,
          action: "RETRY",
        },
      });
      expect(mocks.retireIntent).toHaveBeenCalledWith({
        intentId: intent.id,
        code: retirementCode,
        message: expect.any(String),
        now: expect.any(Date),
        invalidateActiveLease: true,
      });
      expect(mocks.preparePreview).not.toHaveBeenCalled();
      expect(mocks.createProposal).not.toHaveBeenCalled();
      expect(mocks.createSourceAwareProposal).not.toHaveBeenCalled();
      expect(mocks.recordIntentFailure).not.toHaveBeenCalled();
      expect(mocks.completeIntent).not.toHaveBeenCalled();
    }
  );

  it("returns an existing reconciling attempt without repeating proposal mutation", async () => {
    const pullRequestUrl = "https://github.com/acme/workflow-repo/pull/41";
    mocks.findAttempt.mockResolvedValue({
      state: "RECONCILING",
      headSha: null,
      pullRequestNumber: 41,
      pullRequestUrl,
      pullRequestState: "open",
      merged: false,
    });

    await expect(createFlowcordiaRollbackProposal(command)).rejects.toMatchObject({
      code: "proposal_reconciling",
      status: 409,
      retryable: false,
      recovery: {
        attemptProposalId,
        pullRequestNumber: 41,
        pullRequestUrl,
        state: "RECONCILING",
        action: "WAIT",
      },
    });
    expect(mocks.preparePreview).not.toHaveBeenCalled();
    expect(mocks.createProposal).not.toHaveBeenCalled();
    expect(mocks.createSourceAwareProposal).not.toHaveBeenCalled();
    expect(mocks.recordIntentFailure).not.toHaveBeenCalled();
    expect(mocks.retireIntent).not.toHaveBeenCalled();
    expect(mocks.completeIntent).not.toHaveBeenCalled();
  });
});
