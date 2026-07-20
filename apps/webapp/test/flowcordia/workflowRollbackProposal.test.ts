import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFlowcordiaRollbackCommand,
  FLOWCORDIA_ROLLBACK_CONFIRMATION,
} from "../../app/features/flowcordia/workflows/rollback/command-contract";
import { flowcordiaRollbackProposalId } from "../../app/features/flowcordia/workflows/rollback/contract";
import {
  presentFlowcordiaRollback,
  unavailableFlowcordiaRollback,
} from "../../app/features/flowcordia/workflows/rollback/presentation";

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
    workflowId: "reference_workflow",
    currentProposalId: current.proposalId,
    currentMergeCommitSha: current.mergeCommitSha,
    targetProposalId: target.proposalId,
    targetMergeCommitSha: target.mergeCommitSha,
    baseCommitSha: base.commitSha,
  };

  it("is deterministic and keeps visible target/current commit lineage", () => {
    const proposalId = flowcordiaRollbackProposalId(input);
    expect(proposalId).toMatch(
      /^rollback-reference_workflow-to-dddddddd-from-bbbbbbbb-[0-9a-f]{16}$/
    );
    expect(flowcordiaRollbackProposalId(input)).toBe(proposalId);
    expect(flowcordiaRollbackProposalId({ ...input, baseCommitSha: "1".repeat(40) })).not.toBe(
      proposalId
    );
  });

  it("fails closed on malformed or non-rollback identities", () => {
    expect(() =>
      flowcordiaRollbackProposalId({ ...input, targetProposalId: current.proposalId })
    ).toThrow(TypeError);
    expect(() =>
      flowcordiaRollbackProposalId({
        ...input,
        targetMergeCommitSha: current.mergeCommitSha,
      })
    ).toThrow(TypeError);
    expect(() => flowcordiaRollbackProposalId({ ...input, baseCommitSha: "not-a-sha" })).toThrow(
      TypeError
    );
  });
});

describe("Flowcordia rollback command", () => {
  it("builds one explicit proposal-only command from displayed exact identities and reason", () => {
    expect(
      buildFlowcordiaRollbackCommand({
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
      })
    ).toEqual({
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
    });
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
    expect(repository).toContain("desiredWorkflowSha256: { not: input.currentWorkflowSha256 }");
    expect(repository).toContain('orderBy: [{ pullRequestNumber: "desc" }, { id: "desc" }]');
    expect(repository).not.toContain("updatedAt");
    expect(service).toContain("workflowSha256(currentWorkflow.value.workflow)");
    expect(service).toContain("target.desiredWorkflowSha256 === currentWorkflowSha256");
    expect(service).toContain("findFlowcordiaRollbackTarget");
    expect(service).toContain("workflowStore.read");
    expect(service).toContain("functionCatalog.read");
    expect(service).toContain("sourcePatchStore.read");
    expect(service).toContain("createSourceAwareProposalCommandService");
    expect(service).toContain("createProposalCommandService");
    expect(service).toContain("prepareFlowcordiaPreviewEnvironment");
    expect(service).toContain("flowcordiaRollbackProposalId");
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

    expect(intent).toContain("prisma.flowcordiaRollbackIntent.create");
    expect(intent).toContain("repositoryId_targetProposalId");
    expect(intent).toContain("exactIdentityMatches");
    expect(intent).toContain('error.code === "P2002"');
    expect(intent).toContain('status: "PROPOSAL_CREATED"');
    expect(intent).toContain('status: input.retryable ? "PENDING" : "FAILED"');
    expect(schema).toContain("model FlowcordiaRollbackIntent");
    expect(schema).toContain("sourceMergeCommitSha");
    expect(schema).toContain("currentMergeCommitSha");
    expect(schema).toContain("targetProposalId");
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
