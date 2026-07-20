import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { workflowSha256 } from "@flowcordia/control-plane";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";
import {
  buildFlowcordiaRollbackCommand,
  FLOWCORDIA_ROLLBACK_CONFIRMATION,
  resumeFlowcordiaRollbackCommand,
} from "../../app/features/flowcordia/workflows/rollback/command-contract";
import {
  flowcordiaRollbackKey,
  flowcordiaRollbackProposalId,
} from "../../app/features/flowcordia/workflows/rollback/contract";
import { assertFlowcordiaRollbackSnapshot } from "../../app/features/flowcordia/workflows/rollback/snapshot";
import {
  presentFlowcordiaRollback,
  unavailableFlowcordiaRollback,
} from "../../app/features/flowcordia/workflows/rollback/presentation";
import { isAbandonedFlowcordiaRollbackAttempt } from "../../app/features/flowcordia/workflows/rollback/retry";
import {
  canRetryFlowcordiaRollbackResponse,
  flowcordiaRollbackRecoveryButtonLabel,
  flowcordiaRollbackRecoveryGuidance,
} from "../../app/features/flowcordia/workflows/rollback/recovery-presentation";
import { classifyFlowcordiaRollbackProposalFailure } from "../../app/features/flowcordia/workflows/rollback/proposal-failure";
import { assertFlowcordiaRollbackSourcePatchesAtHead } from "../../app/features/flowcordia/workflows/rollback/source-verification";

const current = {
  proposalId: "proposal_current",
  headSha: "a".repeat(40),
  mergeCommitSha: "b".repeat(40),
  pullRequestNumber: 42,
};
const target = {
  proposalId: "proposal_target",
  headSha: "c".repeat(40),
  mergeCommitSha: "d".repeat(40),
  pullRequestNumber: 31,
};
const base = { commitSha: "e".repeat(40), blobSha: "f".repeat(40) };

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Flowcordia rollback projection", () => {
  it("shows only bounded public governed identities and the exact current base", () => {
    expect(presentFlowcordiaRollback({ current, candidates: [target], base })).toEqual({
      state: "READY",
      message:
        "Create a new governed proposal that restores one earlier reviewed workflow version. Nothing is merged or deployed automatically.",
      current,
      candidates: [target],
      base,
    });
    expect(presentFlowcordiaRollback({ current, candidates: [], base })).toMatchObject({
      state: "NOT_AVAILABLE",
      message: "No earlier distinct governed workflow version is available for rollback.",
      candidates: [],
      base,
    });
    expect(presentFlowcordiaRollback({ current: null, candidates: [], base })).toMatchObject({
      state: "NOT_AVAILABLE",
      message: "The current branch workflow does not match a merged governed proposal.",
      current: null,
      candidates: [],
      base,
    });
    expect(presentFlowcordiaRollback({ current, candidates: [target], base: null })).toMatchObject({
      state: "UNAVAILABLE",
      base: null,
    });
    expect(unavailableFlowcordiaRollback()).toMatchObject({
      state: "UNAVAILABLE",
      current: null,
      candidates: [],
      base: null,
    });
  });
});

describe("Flowcordia rollback proposal identity", () => {
  const input = {
    tenantId: "org_123",
    projectId: "project_123",
    githubAppInstallationId: "github_installation_123",
    installationId: 42,
    repositoryId: "repository_123",
    repositoryGithubId: "987654321",
    repositoryOwner: "flowcordia",
    repositoryName: "reference-repository",
    baseBranch: "main",
    workflowId: "reference_workflow",
    currentProposalId: current.proposalId,
    currentHeadSha: current.headSha,
    currentMergeCommitSha: current.mergeCommitSha,
    targetProposalId: target.proposalId,
    targetHeadSha: target.headSha,
    targetMergeCommitSha: target.mergeCommitSha,
    baseCommitSha: base.commitSha,
    baseBlobSha: base.blobSha,
  };

  it("is deterministic and remains valid for the longest governed workflow identity", () => {
    const rollbackKey = flowcordiaRollbackKey(input);
    const proposalId = flowcordiaRollbackProposalId({ rollbackKey, attemptNumber: 1 });
    expect(rollbackKey).toMatch(/^[0-9a-f]{64}$/);
    expect(proposalId).toMatch(/^rollback-[0-9a-f]{64}-a1$/);
    expect(proposalId.length).toBeLessThanOrEqual(80);
    expect(flowcordiaRollbackProposalId({ rollbackKey, attemptNumber: 1 })).toBe(proposalId);
    expect(flowcordiaRollbackKey({ ...input, baseCommitSha: "1".repeat(40) })).not.toBe(
      rollbackKey
    );
    expect(flowcordiaRollbackKey({ ...input, projectId: "project_456" })).not.toBe(rollbackKey);
    expect(flowcordiaRollbackProposalId({ rollbackKey, attemptNumber: 2 })).not.toBe(proposalId);

    const longestWorkflowId = `w${"a".repeat(127)}`;
    const longestKey = flowcordiaRollbackKey({ ...input, workflowId: longestWorkflowId });
    const longestId = flowcordiaRollbackProposalId({
      rollbackKey: longestKey,
      attemptNumber: 99_999,
    });
    expect(longestId).toMatch(/^rollback-[0-9a-f]{64}-a99999$/);
    expect(longestId.length).toBeLessThanOrEqual(80);
  });

  it("fails closed on malformed or non-rollback identities", () => {
    expect(() => flowcordiaRollbackKey({ ...input, targetProposalId: current.proposalId })).toThrow(
      TypeError
    );
    expect(() =>
      flowcordiaRollbackKey({
        ...input,
        targetMergeCommitSha: current.mergeCommitSha,
      })
    ).toThrow(TypeError);
    expect(() => flowcordiaRollbackKey({ ...input, baseCommitSha: "not-a-sha" })).toThrow(
      TypeError
    );
    expect(() =>
      flowcordiaRollbackProposalId({ rollbackKey: "not-a-key", attemptNumber: 1 })
    ).toThrow(TypeError);
    expect(() =>
      flowcordiaRollbackProposalId({ rollbackKey: "0".repeat(64), attemptNumber: 0 })
    ).toThrow(TypeError);
  });
});

describe("Flowcordia rollback historical snapshot", () => {
  const workflow: WorkflowDefinition = {
    schemaVersion: "0.1",
    id: "reference_workflow",
    name: "Reference workflow",
    description: "A governed historical workflow.",
    labels: ["rollback"],
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

  it("accepts only the exact governed workflow ID and canonical digest", () => {
    const exact = {
      workflow,
      expectedWorkflowId: workflow.id,
      expectedWorkflowSha256: workflowSha256(workflow),
    };
    expect(() => assertFlowcordiaRollbackSnapshot(exact)).not.toThrow();
    expect(() =>
      assertFlowcordiaRollbackSnapshot({ ...exact, expectedWorkflowId: "another_workflow" })
    ).toThrowError(/exact governed rollback target/);
    expect(() =>
      assertFlowcordiaRollbackSnapshot({ ...exact, expectedWorkflowSha256: "0".repeat(64) })
    ).toThrowError(/exact governed rollback target/);
  });
});

describe("Flowcordia rollback failed-attempt retry gate", () => {
  it("permits only a proven-absent attempt or one closed without merge", () => {
    expect(isAbandonedFlowcordiaRollbackAttempt({ branchExists: false, pullRequests: [] })).toBe(
      true
    );
    expect(
      isAbandonedFlowcordiaRollbackAttempt({
        branchExists: true,
        pullRequests: [{ state: "closed", merged: false }],
      })
    ).toBe(true);
    expect(isAbandonedFlowcordiaRollbackAttempt({ branchExists: true, pullRequests: [] })).toBe(
      false
    );
    expect(
      isAbandonedFlowcordiaRollbackAttempt({
        branchExists: true,
        pullRequests: [{ state: "open", merged: false }],
      })
    ).toBe(false);
    expect(
      isAbandonedFlowcordiaRollbackAttempt({
        branchExists: false,
        pullRequests: [{ state: "closed", merged: true }],
      })
    ).toBe(false);
    expect(
      isAbandonedFlowcordiaRollbackAttempt({
        branchExists: false,
        pullRequests: [
          { state: "closed", merged: false },
          { state: "closed", merged: false },
        ],
      })
    ).toBe(false);
    expect(
      isAbandonedFlowcordiaRollbackAttempt({
        branchExists: true,
        pullRequests: [
          { state: "closed", merged: false },
          { state: "open", merged: false },
        ],
      })
    ).toBe(false);
  });
});

describe("Flowcordia rollback final source verification", () => {
  const proposalHeadSha = "8".repeat(40);
  const scope = {
    tenantId: "org_123",
    projectId: "project_123",
    githubAppInstallationId: "github_installation_123",
    installationId: 42,
    repositoryId: "repository_123",
    repositoryGithubId: "987654321",
    repository: { owner: "acme", name: "workflows", branch: "main" },
  } satisfies WorkflowIndexScope;
  const sourcePatches = [
    {
      path: "src/flowcordia/lead-intake.ts",
      sourceText: "export const leadIntake = async () => ({ ok: true });\n",
      expectedBlobSha: null,
    },
  ];

  it("accepts only exact source content resolved at the final proposal head", async () => {
    const read = vi.fn(async () => ({
      success: true as const,
      value: {
        path: sourcePatches[0]!.path,
        sourceText: sourcePatches[0]!.sourceText,
        requestedRevision: proposalHeadSha,
        commitSha: proposalHeadSha,
        blobSha: "7".repeat(40),
      },
    }));

    await expect(
      assertFlowcordiaRollbackSourcePatchesAtHead({
        scope,
        sourcePatchStore: { read } as never,
        sourcePatches,
        proposalHeadSha,
      })
    ).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledWith({
      scope,
      path: sourcePatches[0]!.path,
      revision: proposalHeadSha,
    });
  });

  it("preserves retryability when the exact-head source read is unavailable", async () => {
    const read = vi.fn(async () => ({
      success: false as const,
      error: {
        code: "unavailable" as const,
        operation: "read_source" as const,
        message: "GitHub is unavailable.",
        retryable: true,
      },
    }));

    await expect(
      assertFlowcordiaRollbackSourcePatchesAtHead({
        scope,
        sourcePatchStore: { read } as never,
        sourcePatches,
        proposalHeadSha,
      })
    ).rejects.toMatchObject({
      code: "source_snapshot_unavailable",
      status: 503,
      retryable: true,
    });
  });

  it.each([
    { commitSha: "6".repeat(40), sourceText: sourcePatches[0]!.sourceText },
    { commitSha: proposalHeadSha, sourceText: "export const stale = true;\n" },
  ])("rejects a source content or resolved-commit mismatch", async ({ commitSha, sourceText }) => {
    const read = vi.fn(async () => ({
      success: true as const,
      value: {
        path: sourcePatches[0]!.path,
        sourceText,
        requestedRevision: proposalHeadSha,
        commitSha,
        blobSha: "7".repeat(40),
      },
    }));

    await expect(
      assertFlowcordiaRollbackSourcePatchesAtHead({
        scope,
        sourcePatchStore: { read } as never,
        sourcePatches,
        proposalHeadSha,
      })
    ).rejects.toMatchObject({
      code: "source_snapshot_unavailable",
      status: 409,
      retryable: false,
    });
  });
});

describe("Flowcordia rollback command", () => {
  it("waits for retryable or ambiguous proposal outcomes instead of declaring them terminal", () => {
    expect(
      classifyFlowcordiaRollbackProposalFailure({
        code: "github_operation_failed",
        operation: "create",
        message: "GitHub is temporarily unavailable.",
        retryable: true,
        github: {
          code: "unavailable",
          operation: "create",
          phase: "branch",
          message: "GitHub is temporarily unavailable.",
          retryable: true,
        },
      })
    ).toEqual({
      code: "proposal_reconciling",
      status: 409,
      retryable: true,
      state: "RECONCILING",
      action: "WAIT",
    });
    expect(
      classifyFlowcordiaRollbackProposalFailure({
        code: "persistence_failed",
        operation: "create",
        message: "Proposal persistence is temporarily unavailable.",
        retryable: true,
      })
    ).toMatchObject({
      code: "proposal_failed",
      status: 503,
      state: "PENDING",
      action: "RETRY",
    });
    expect(
      classifyFlowcordiaRollbackProposalFailure({
        code: "github_operation_failed",
        operation: "create",
        message: "The proposal conflicts with an existing branch.",
        retryable: false,
        github: {
          code: "conflict",
          operation: "create",
          phase: "branch",
          message: "The proposal conflicts with an existing branch.",
          retryable: false,
        },
      })
    ).toMatchObject({ code: "proposal_failed", state: "FAILED", action: "RETRY" });
  });

  it("builds one explicit proposal-only command from displayed exact identities and reason", () => {
    const commandInput = {
      workflowId: "reference_workflow",
      targetProposalId: target.proposalId,
      expectedTargetHeadSha: target.headSha,
      expectedTargetMergeCommitSha: target.mergeCommitSha,
      expectedCurrentProposalId: current.proposalId,
      expectedCurrentHeadSha: current.headSha,
      expectedCurrentMergeCommitSha: current.mergeCommitSha,
      expectedBaseCommitSha: base.commitSha,
      expectedBaseBlobSha: base.blobSha,
      reason: "Restore the last reviewed version after a production regression.",
      retryFailedIntent: false,
    };
    expect(buildFlowcordiaRollbackCommand(commandInput)).toEqual({
      operation: "create_rollback",
      confirmation: FLOWCORDIA_ROLLBACK_CONFIRMATION,
      workflowId: "reference_workflow",
      targetProposalId: target.proposalId,
      expectedTargetHeadSha: target.headSha,
      expectedTargetMergeCommitSha: target.mergeCommitSha,
      expectedCurrentProposalId: current.proposalId,
      expectedCurrentHeadSha: current.headSha,
      expectedCurrentMergeCommitSha: current.mergeCommitSha,
      expectedBaseCommitSha: base.commitSha,
      expectedBaseBlobSha: base.blobSha,
      reason: "Restore the last reviewed version after a production regression.",
      retryFailedIntent: "false",
    });
    expect(
      buildFlowcordiaRollbackCommand({ ...commandInput, retryFailedIntent: true }).retryFailedIntent
    ).toBe("true");

    const pinned = buildFlowcordiaRollbackCommand(commandInput);
    expect(resumeFlowcordiaRollbackCommand(pinned, false)).toEqual(pinned);
    expect(resumeFlowcordiaRollbackCommand(pinned, true)).toEqual({
      ...pinned,
      retryFailedIntent: "true",
    });
  });

  it("offers retry only for retry actions and gives terminal artifacts explicit guidance", () => {
    expect(
      canRetryFlowcordiaRollbackResponse({
        error: "rollback_retry_required",
        recovery: { state: "FAILED", action: "RETRY" },
      })
    ).toBe(true);
    expect(
      canRetryFlowcordiaRollbackResponse({
        error: "rollback_retry_required",
        recovery: { state: "OPEN", action: "CLOSE" },
      })
    ).toBe(true);
    expect(
      canRetryFlowcordiaRollbackResponse({
        error: "rollback_retry_required",
        recovery: { state: "BRANCH_ONLY", action: "REVIEW" },
      })
    ).toBe(true);
    expect(
      canRetryFlowcordiaRollbackResponse({
        error: "rollback_retry_required",
        recovery: { state: "AMBIGUOUS", action: "REVIEW" },
      })
    ).toBe(false);
    expect(
      canRetryFlowcordiaRollbackResponse({
        error: "proposal_reconciling",
        retryable: true,
        recovery: { state: "RECONCILING", action: "WAIT" },
      })
    ).toBe(false);
    expect(flowcordiaRollbackRecoveryGuidance({ state: "BRANCH_ONLY", action: "REVIEW" })).toMatch(
      /Delete the abandoned proposal branch/
    );
    expect(flowcordiaRollbackRecoveryGuidance({ state: "MERGED", action: "REVIEW" })).toMatch(
      /was merged/
    );
    expect(
      flowcordiaRollbackRecoveryButtonLabel({
        error: "rollback_retry_required",
        recovery: { state: "OPEN", action: "CLOSE" },
      })
    ).toBe("Check cleanup and retry");
  });

  it("keeps reconstruction, persistence, and mutation authority on the server", () => {
    const service = source("../../app/features/flowcordia/workflows/rollback/service.server.ts");
    const query = source("../../app/features/flowcordia/workflows/rollback/query.server.ts");
    const repository = source(
      "../../app/features/flowcordia/workflows/rollback/repository.server.ts"
    );
    const intent = source("../../app/features/flowcordia/workflows/rollback/intent.server.ts");
    const commands = source("../../app/features/flowcordia/workflows/rollback/commands.server.ts");
    const panel = source(
      "../../app/features/flowcordia/workflows/rollback/WorkflowRollbackPanel.tsx"
    );
    const schema = source("../../../../internal-packages/database/prisma/schema.prisma");
    const migration = source(
      "../../../../internal-packages/database/prisma/migrations/20260720141000_flowcordia_rollback_intent/migration.sql"
    );

    expect(query).toContain("workflowSha256(current.value.workflow)");
    expect(repository).toContain("desiredWorkflowSha256: input.currentWorkflowSha256");
    expect(repository).not.toContain("desiredWorkflowSha256: { not: input.currentWorkflowSha256 }");
    expect(repository).toContain("proposalId: { not: currentRow.proposalId }");
    expect(repository).toContain('orderBy: [{ pullRequestNumber: "desc" }, { id: "desc" }]');
    expect(repository).not.toContain("updatedAt");
    expect(service).toContain("workflowSha256(currentWorkflow.value.workflow)");
    expect(service).toContain("assertFlowcordiaRollbackSnapshot");
    expect(service).not.toContain("target.desiredWorkflowSha256 === currentWorkflowSha256");
    expect(service).toContain("sourcePatches.length === 0");
    expect(service).toContain("findFlowcordiaRollbackTarget");
    expect(service).toContain("workflowStore.read");
    expect(service).toContain("functionCatalog.read");
    expect(service).toContain("sourcePatchStore.read");
    expect(service).toContain("assertFlowcordiaRollbackContentAtHead");
    expect(service).toContain("assertFlowcordiaRollbackDiffAtHead");
    expect(service).toContain("createSourceAwareProposalCommandService");
    expect(service).toContain("createProposalCommandService");
    expect(service).toContain("prepareFlowcordiaPreviewEnvironment");
    expect(service).toContain("flowcordiaRollbackKey");
    expect(service).toContain("reserveFlowcordiaRollbackIntent");
    expect(service).toContain("completeFlowcordiaRollbackIntent");
    expect(service.lastIndexOf("reserveFlowcordiaRollbackIntent")).toBeLessThan(
      service.lastIndexOf("prepareFlowcordiaPreviewEnvironment")
    );
    expect(service).toContain("expectedTargetHeadSha");
    expect(service).toContain("expectedTargetMergeCommitSha");
    expect(service).toContain("expectedCurrentHeadSha");
    expect(service).toContain("expectedBaseCommitSha");
    expect(service).toContain("expectedBaseBlobSha");
    expect(service).not.toContain("mergePullRequest");
    expect(service).not.toContain("TriggerTaskService");
    expect(service).not.toContain("workerDeployment.create");
    expect(service).not.toContain("git reset");

    expect(intent).toContain("database.flowcordiaRollbackIntent.create");
    expect(intent).toContain("flowcordiaRollbackProposalId");
    expect(intent).toContain("repositoryId_rollbackKey_attemptNumber");
    expect(intent).toContain("exactIdentityMatches");
    expect(intent).toContain('error.code === "P2002"');
    expect(intent).toContain('status: "PROPOSAL_CREATED"');
    expect(intent).toContain('status: input.terminal ? "FAILED" : "PENDING"');
    expect(schema).toContain("model FlowcordiaRollbackIntent");
    expect(schema).toContain("sourceMergeCommitSha");
    expect(schema).toContain("currentMergeCommitSha");
    expect(schema).toContain("targetProposalId");
    expect(schema).toContain("rollbackKey");
    expect(schema).toContain("attemptNumber");
    expect(schema).toContain("reason");
    expect(migration).toContain('CREATE TABLE "FlowcordiaRollbackIntent"');

    expect(commands).toContain("resolveCreatorReviewerId");
    expect(commands).toContain("reason: Reason");
    expect(commands).toContain("expectedTargetHeadSha");
    expect(commands).toContain("expectedBaseBlobSha");
    expect(panel).toContain("flowcordia-rollback-reason");
    expect(panel).toContain('encType: "application/json"');
    expect(panel).not.toContain("repositoryId");
    expect(panel).not.toContain("installationId");
    expect(panel).not.toContain("sourcePath");
    expect(panel).not.toContain("process.env");
  });
});
