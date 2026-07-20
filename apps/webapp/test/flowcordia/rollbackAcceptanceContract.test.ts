import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_CONFIRMATION,
  parseFlowcordiaRollbackAcceptanceEnvironment,
  rollbackAcceptanceFailure,
  type FlowcordiaRollbackAcceptanceEvidence,
} from "../../app/features/flowcordia/acceptance/rollback-contract";
import { writeFlowcordiaRollbackAcceptanceEvidence } from "../../../../tests/flowcordia-connected/rollback-evidence";

const validEnvironment = {
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_CONFIRMATION,
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_URL: "https://flowcordia.example.com",
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_STUDIO_PATH:
    "/orgs/acme/projects/reference/env/prod/flowcordia/workflows",
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_WORKFLOW_ID: "reference_workflow",
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_APPLICATION_COMMIT_SHA: "1".repeat(40),
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_PROPOSAL_ID: "proposal_current",
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_HEAD_SHA: "a".repeat(40),
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_MERGE_COMMIT_SHA: "b".repeat(40),
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_COMMIT_SHA: "c".repeat(40),
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_BLOB_SHA: "d".repeat(40),
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_PROPOSAL_ID: "proposal_target",
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_HEAD_SHA: "e".repeat(40),
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_MERGE_COMMIT_SHA: "f".repeat(40),
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_REASON: "Restore the known-good reference workflow.",
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_STORAGE_STATE_PATH: "/tmp/storage.json",
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_EVIDENCE_PATH: "/tmp/evidence.json",
  FLOWCORDIA_ROLLBACK_ACCEPTANCE_TIMEOUT_SECONDS: "600",
};

describe("Flowcordia rollback proposal acceptance", () => {
  it("parses one exact current, base, and reviewed target identity", () => {
    expect(parseFlowcordiaRollbackAcceptanceEnvironment(validEnvironment)).toEqual({
      baseUrl: "https://flowcordia.example.com",
      studioUrl:
        "https://flowcordia.example.com/orgs/acme/projects/reference/env/prod/flowcordia/workflows?workflow=reference_workflow",
      workflowId: "reference_workflow",
      expectedApplicationCommitSha: "1".repeat(40),
      expectedCurrentProposalId: "proposal_current",
      expectedCurrentHeadSha: "a".repeat(40),
      expectedCurrentMergeCommitSha: "b".repeat(40),
      expectedBaseCommitSha: "c".repeat(40),
      expectedBaseBlobSha: "d".repeat(40),
      targetProposalId: "proposal_target",
      targetHeadSha: "e".repeat(40),
      targetMergeCommitSha: "f".repeat(40),
      reason: "Restore the known-good reference workflow.",
      storageStatePath: "/tmp/storage.json",
      evidencePath: "/tmp/evidence.json",
      timeoutMs: 600_000,
    });
  });

  it("rejects ambiguous identity, unsafe routes, unbounded reason, and weak confirmation", () => {
    for (const overrides of [
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_CONFIRMATION: "rollback" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_URL: "http://flowcordia.example.com" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_STUDIO_PATH: "//other.example.com/studio" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_WORKFLOW_ID: "Invalid workflow" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_APPLICATION_COMMIT_SHA: "ABC123" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_PROPOSAL_ID: "invalid proposal" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_PROPOSAL_ID: "proposal_current" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_CURRENT_HEAD_SHA: "ABC123" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_BASE_BLOB_SHA: "ABC123" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_HEAD_SHA: "ABC123" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_TARGET_MERGE_COMMIT_SHA: "b".repeat(40) },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_REASON: "x".repeat(2_001) },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_REASON: "unsafe\u0000reason" },
      { FLOWCORDIA_ROLLBACK_ACCEPTANCE_TIMEOUT_SECONDS: "59" },
    ]) {
      expect(() =>
        parseFlowcordiaRollbackAcceptanceEnvironment({ ...validEnvironment, ...overrides })
      ).toThrow();
    }
  });

  it("writes bounded rollback evidence without the operator reason or private state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flowcordia-rollback-evidence-"));
    const path = join(directory, "evidence.json");
    const evidence: FlowcordiaRollbackAcceptanceEvidence = {
      schemaVersion: "0.1",
      mode: "rollback_proposal",
      result: "PASSED",
      stage: "complete",
      workflowId: "reference_workflow",
      applicationCommitSha: "1".repeat(40),
      startedAt: "2026-07-20T16:00:00.000Z",
      completedAt: "2026-07-20T16:01:00.000Z",
      rollback: {
        currentProposalId: "proposal_current",
        currentHeadSha: "a".repeat(40),
        currentMergeCommitSha: "b".repeat(40),
        baseCommitSha: "c".repeat(40),
        baseBlobSha: "d".repeat(40),
        targetProposalId: "proposal_target",
        targetHeadSha: "e".repeat(40),
        targetMergeCommitSha: "f".repeat(40),
        rollbackProposalId: "rollback_reference_a1",
        rollbackProposalHeadSha: "2".repeat(40),
        pullRequestNumber: 42,
      },
    };

    try {
      await writeFlowcordiaRollbackAcceptanceEvidence(path, evidence);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(evidence);
      await expect(
        writeFlowcordiaRollbackAcceptanceEvidence(join(directory, "unsafe.json"), {
          ...evidence,
          reason: "do not preserve incident text",
        } as FlowcordiaRollbackAcceptanceEvidence)
      ).rejects.toThrow("forbidden field reason");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses fixed failure evidence", () => {
    expect(
      rollbackAcceptanceFailure({
        stage: "proposal",
        workflowId: "reference_workflow",
        startedAt: "2026-07-20T16:00:00.000Z",
        completedAt: "2026-07-20T16:01:00.000Z",
      }).failure
    ).toEqual({
      code: "PROPOSAL_FAILED",
      message: "The governed rollback proposal could not be created through Studio.",
    });
  });

  it("uses only the protected authenticated Studio rollback command", () => {
    const source = (relativePath: string) =>
      readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    const spec = source("../../../../tests/flowcordia-connected/rollback.connected.spec.ts");
    const workflow = source("../../../../.github/workflows/flowcordia-rollback-acceptance.yml");
    const panel = source(
      "../../app/features/flowcordia/workflows/rollback/WorkflowRollbackPanel.tsx"
    );

    expect(spec).toContain("FLOWCORDIA_ROLLBACK_CONFIRMATION");
    expect(spec).toContain("flowcordia-rollback-confirm");
    expect(spec).not.toMatch(/octokit|github\.rest|createPullRequest/);
    expect(panel).toContain("data-base-blob");
    expect(panel).toContain("data-merge-commit");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: flowcordia-rollback-acceptance");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("contents: write");
  });
});
