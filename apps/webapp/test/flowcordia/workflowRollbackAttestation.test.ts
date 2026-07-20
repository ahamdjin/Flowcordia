import {
  GitHubTransportError,
  type GitHubCommitComparisonResult,
} from "@flowcordia/github-workflows";
import { compileWorkflowToTriggerTask } from "@flowcordia/runtime";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowIndexScope } from "../../app/features/flowcordia/workflows/index/types";

import { assertFlowcordiaRollbackContentAtHead } from "../../app/features/flowcordia/workflows/rollback/content-verification";
import {
  assertFlowcordiaRollbackComparison,
  assertFlowcordiaRollbackDiffAtHead,
} from "../../app/features/flowcordia/workflows/rollback/diff-attestation.server";

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
const generatedPath = `trigger/flowcordia/${workflowId}.ts`;
const sourcePath = "src/flowcordia/enrich-lead.ts";
const baseCommitSha = "a".repeat(40);
const proposalHeadSha = "b".repeat(40);

const workflow = {
  schemaVersion: "0.1",
  id: workflowId,
  name: "Lead intake",
  labels: [],
  nodes: [
    {
      id: "incoming",
      name: "Incoming",
      kind: "trigger",
      operation: "trigger.manual",
      position: { x: 0, y: 0 },
      configuration: {},
    },
  ],
  edges: [],
} satisfies WorkflowDefinition;

function comparison(
  files: GitHubCommitComparisonResult["files"],
  overrides: Partial<GitHubCommitComparisonResult> = {}
): GitHubCommitComparisonResult {
  return {
    status: "ahead",
    aheadBy: 2,
    behindBy: 0,
    totalCommits: 2,
    baseCommitSha,
    mergeBaseCommitSha: baseCommitSha,
    headCommitSha: proposalHeadSha,
    files,
    ...overrides,
  };
}

function changed(path: string, status = "modified") {
  return { path, status, blobSha: "c".repeat(40) };
}

const allowedPaths = new Set([workflowPath, generatedPath, sourcePath]);

describe("Flowcordia rollback immutable-diff attestation", () => {
  it("accepts only workflow, generated artifact, and expected source-patch paths", async () => {
    const compareCommits = vi.fn(async () =>
      comparison([changed(workflowPath), changed(generatedPath), changed(sourcePath)])
    );
    await expect(
      assertFlowcordiaRollbackDiffAtHead({
        repositoryComparison: { compareCommits },
        workflowId,
        workflowPath,
        baseCommitSha,
        proposalHeadSha,
        sourcePatches: [
          {
            path: sourcePath,
            sourceText: "export const restored = true;\n",
            expectedBlobSha: "3".repeat(40),
          },
        ],
      })
    ).resolves.toBeUndefined();
    expect(compareCommits).toHaveBeenCalledWith({
      baseCommitSha,
      headCommitSha: proposalHeadSha,
    });
  });

  it("rejects an unrelated file on an otherwise valid rollback head", () => {
    expect(() =>
      assertFlowcordiaRollbackComparison({
        baseCommitSha,
        proposalHeadSha,
        comparison: comparison([changed(workflowPath), changed("README.md")]),
        allowedPaths,
      })
    ).toThrow(/README\.md/);
  });

  it.each(["removed", "renamed", "copied", "changed"])(
    "rejects an unsupported %s operation even on an allowed path",
    (status) => {
      expect(() =>
        assertFlowcordiaRollbackComparison({
          baseCommitSha,
          proposalHeadSha,
          comparison: comparison([changed(workflowPath, status)]),
          allowedPaths,
        })
      ).toThrow(/unsupported changed-file identity/);
    }
  );

  it("rejects a diverged proposal head even when every final path is allowed", () => {
    expect(() =>
      assertFlowcordiaRollbackComparison({
        baseCommitSha,
        proposalHeadSha,
        comparison: comparison([changed(workflowPath)], {
          status: "diverged",
          behindBy: 1,
          mergeBaseCommitSha: "d".repeat(40),
        }),
        allowedPaths,
      })
    ).toThrow(/not a proven descendant/);
  });

  it("fails closed above the 34-file governed comparison boundary", () => {
    expect(() =>
      assertFlowcordiaRollbackComparison({
        baseCommitSha,
        proposalHeadSha,
        comparison: comparison(
          Array.from({ length: 35 }, (_, index) => changed(`src/generated/${index}.ts`))
        ),
        allowedPaths,
      })
    ).toThrow(/more files than its governed path boundary/);
  });

  it("preserves retryability when the immutable GitHub comparison is unavailable", async () => {
    const compareCommits = vi.fn(async () => {
      throw new GitHubTransportError("GitHub is unavailable.", { code: "network_error" });
    });
    await expect(
      assertFlowcordiaRollbackDiffAtHead({
        repositoryComparison: { compareCommits },
        workflowId,
        workflowPath,
        baseCommitSha,
        proposalHeadSha,
        sourcePatches: [],
      })
    ).rejects.toMatchObject({
      code: "source_snapshot_unavailable",
      status: 503,
      retryable: true,
    });
  });
});

describe("Flowcordia rollback workflow and generated-artifact attestation", () => {
  it("accepts exact workflow and deterministic generated content at the final head", async () => {
    const compilation = compileWorkflowToTriggerTask(workflow);
    expect(compilation.success).toBe(true);
    if (!compilation.success) throw new Error("Expected workflow fixture to compile.");
    const workflowStore = {
      read: vi.fn(async () => ({
        success: true as const,
        value: {
          workflow,
          source: { commitSha: proposalHeadSha, path: workflowPath },
        },
      })),
      readGeneratedArtifact: vi.fn(async () => ({
        success: true as const,
        value: {
          sourceText: compilation.artifact.source,
          source: { commitSha: proposalHeadSha, path: generatedPath },
        },
      })),
    };

    await expect(
      assertFlowcordiaRollbackContentAtHead({
        scope,
        workflowStore: workflowStore as never,
        workflow,
        workflowPath,
        proposalHeadSha,
      })
    ).resolves.toBeUndefined();
  });

  it("rejects a generated artifact that does not match deterministic compilation", async () => {
    const workflowStore = {
      read: vi.fn(async () => ({
        success: true as const,
        value: { workflow, source: { commitSha: proposalHeadSha, path: workflowPath } },
      })),
      readGeneratedArtifact: vi.fn(async () => ({
        success: true as const,
        value: {
          sourceText: "export const tampered = true;\n",
          source: { commitSha: proposalHeadSha, path: generatedPath },
        },
      })),
    };

    await expect(
      assertFlowcordiaRollbackContentAtHead({
        scope,
        workflowStore: workflowStore as never,
        workflow,
        workflowPath,
        proposalHeadSha,
      })
    ).rejects.toMatchObject({
      code: "source_snapshot_unavailable",
      status: 409,
      retryable: false,
    });
  });
});
