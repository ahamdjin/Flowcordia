import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import type {
  GitHubGeneratedArtifactReadValue,
  GitHubWorkflowAccessScope,
  GitHubWorkflowReadValue,
  GitHubWorkflowSaveValue,
} from "@flowcordia/github-workflows";
import {
  GitHubProposalWorkflowClosureService,
  type FlowcordiaProposalClosureManifest,
  type GitHubProposalWorkflowClosureServiceOptions,
} from "../src/index.js";

const baseCommitSha = "a".repeat(40);
const branchHeadSha = "b".repeat(40);
const scope: GitHubWorkflowAccessScope = {
  tenantId: "tenant-1",
  projectId: "project-1",
  installationId: 42,
  repository: { owner: "acme", name: "automations", branch: "main" },
};
const inputSchema = {
  type: "object",
  required: ["orderId"],
  properties: { orderId: { type: "string" } },
  additionalProperties: false,
} as const;
const outputSchema = {
  type: "object",
  required: ["accepted"],
  properties: { accepted: { type: "boolean" } },
  additionalProperties: false,
} as const;

function workflow(id: string, children: readonly string[] = []): WorkflowDefinition {
  const nodes: WorkflowDefinition["nodes"] = [
    {
      id: "trigger",
      kind: "trigger",
      operation: "trigger.manual",
      position: { x: 0, y: 0 },
      configuration: {},
      outputSchema: inputSchema,
    },
    ...children.map((workflowId, index) => ({
      id: `child-${index}`,
      kind: "subflow" as const,
      operation: "subflow.invoke",
      position: { x: 100 + index * 100, y: 0 },
      configuration: { workflowId, mode: "single" },
      inputSchema,
      outputSchema,
    })),
    {
      id: "output",
      kind: "output",
      operation: "output.return",
      position: { x: 400, y: 0 },
      configuration: {},
      inputSchema: outputSchema,
    },
  ];
  return {
    schemaVersion: "0.1",
    id,
    name: id,
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      id: `edge-${index}`,
      source: node.id,
      target: nodes[index + 1]!.id,
    })),
  };
}

function workflowReadValue(
  workflowDefinition: WorkflowDefinition,
  commitSha: string,
  blobSha: string,
  branch = "main"
): GitHubWorkflowReadValue {
  return {
    workflow: workflowDefinition,
    source: {
      repository: { owner: "acme", name: "automations", branch },
      path: `.flowcordia/workflows/${workflowDefinition.id}.json`,
      requestedRevision: commitSha,
      commitSha,
      blobSha,
    },
    appliedMigrations: [],
  };
}

function createHarness() {
  const baseWorkflows = new Map<string, GitHubWorkflowReadValue>([
    ["child", workflowReadValue(workflow("child"), baseCommitSha, "c".repeat(40))],
    ["other", workflowReadValue(workflow("other"), baseCommitSha, "d".repeat(40))],
  ]);
  const branchWorkflows = new Map<string, GitHubWorkflowReadValue>();
  const branchArtifacts = new Map<string, GitHubGeneratedArtifactReadValue>();
  let lockedManifest: FlowcordiaProposalClosureManifest | null = null;
  const calls: string[] = [];

  const proposals = {
    async prepare() {
      calls.push("proposal.prepare");
      return {
        success: true as const,
        value: {
          proposalBranch: "flowcordia/proposals/root/proposal-12345678",
          workflowSource: {
            repository: {
              owner: "acme",
              name: "automations",
              branch: "flowcordia/proposals/root/proposal-12345678",
            },
            path: ".flowcordia/workflows/root.json",
            requestedRevision: branchHeadSha,
            commitSha: branchHeadSha,
            blobSha: "e".repeat(40),
          },
          resumed: false,
          recovered: false,
        },
      };
    },
    async create() {
      throw new Error("create is not used by prepare tests");
    },
  };

  const workflowStore = {
    async read(input: { scope: GitHubWorkflowAccessScope; workflowId: string; revision?: string }) {
      if (input.revision === baseCommitSha) {
        const value = baseWorkflows.get(input.workflowId);
        return value
          ? { success: true as const, value }
          : {
              success: false as const,
              error: {
                code: "not_found" as const,
                operation: "read" as const,
                message: "not found",
                retryable: false,
              },
            };
      }
      const value = branchWorkflows.get(input.workflowId) ?? baseWorkflows.get(input.workflowId);
      return value
        ? { success: true as const, value }
        : {
            success: false as const,
            error: {
              code: "not_found" as const,
              operation: "read" as const,
              message: "not found",
              retryable: false,
            },
          };
    },
    async save(input: {
      scope: GitHubWorkflowAccessScope;
      workflow: WorkflowDefinition;
      expectedBlobSha: string | null;
    }) {
      calls.push(`workflow.save:${input.workflow.id}`);
      const value = workflowReadValue(
        input.workflow,
        branchHeadSha,
        input.expectedBlobSha ?? "f".repeat(40),
        input.scope.repository.branch
      );
      branchWorkflows.set(input.workflow.id, value);
      return {
        success: true as const,
        value: {
          ...value,
          previousBlobSha: input.expectedBlobSha,
          noChange: false,
          audit: null,
        } satisfies GitHubWorkflowSaveValue,
      };
    },
    async readGeneratedArtifact(input: { workflowId: string }) {
      const value = branchArtifacts.get(input.workflowId);
      return value
        ? { success: true as const, value }
        : {
            success: false as const,
            error: {
              code: "not_found" as const,
              operation: "read_artifact" as const,
              message: "not found",
              retryable: false,
            },
          };
    },
    async saveGeneratedArtifact(input: {
      scope: GitHubWorkflowAccessScope;
      workflowId: string;
      sourceText: string;
    }) {
      calls.push(`artifact.save:${input.workflowId}`);
      const value: GitHubGeneratedArtifactReadValue = {
        workflowId: input.workflowId,
        sourceText: input.sourceText,
        source: {
          repository: input.scope.repository,
          path: `trigger/flowcordia/${input.workflowId}.ts`,
          requestedRevision: input.scope.repository.branch,
          commitSha: branchHeadSha,
          blobSha: "1".repeat(40),
        },
      };
      branchArtifacts.set(input.workflowId, value);
      return {
        success: true as const,
        value: { ...value, previousBlobSha: null, noChange: false },
      };
    },
  };

  const closureStore = {
    async read() {
      return lockedManifest
        ? {
            success: true as const,
            value: {
              manifest: lockedManifest,
              path: ".flowcordia/proposals/proposal-12345678.json",
              requestedRevision: branchHeadSha,
              commitSha: branchHeadSha,
              blobSha: "2".repeat(40),
            },
          }
        : {
            success: false as const,
            error: {
              code: "not_found" as const,
              message: "not found",
              retryable: false,
            },
          };
    },
    async save(input: { manifest: FlowcordiaProposalClosureManifest }) {
      calls.push("closure.save");
      lockedManifest = input.manifest;
      return {
        success: true as const,
        value: {
          manifest: input.manifest,
          path: ".flowcordia/proposals/proposal-12345678.json",
          requestedRevision: branchHeadSha,
          commitSha: branchHeadSha,
          blobSha: "2".repeat(40),
          noChange: false,
        },
      };
    },
  };

  const service = new GitHubProposalWorkflowClosureService({
    proposals: proposals as unknown as GitHubProposalWorkflowClosureServiceOptions["proposals"],
    clientResolver: {
      async resolve() {
        throw new Error("snapshot client is not used by prepare tests");
      },
    },
    workflowStore:
      workflowStore as unknown as GitHubProposalWorkflowClosureServiceOptions["workflowStore"],
    closureStore:
      closureStore as unknown as GitHubProposalWorkflowClosureServiceOptions["closureStore"],
  });

  return {
    service,
    calls,
    getLockedManifest: () => lockedManifest,
  };
}

function proposalInput(rootWorkflow: WorkflowDefinition) {
  return {
    scope,
    proposalId: "proposal-12345678",
    creatorReviewerId: null,
    workflow: rootWorkflow,
    expectedBaseCommitSha: baseCommitSha,
    expectedBaseBlobSha: "3".repeat(40),
    mutation: { actorId: "actor-1", correlationId: "correlation-1" },
  };
}

describe("GitHub proposal workflow closure service", () => {
  it("discovers, locks, and stages reachable children before returning preparation", async () => {
    const harness = createHarness();
    const result = await harness.service.prepare(proposalInput(workflow("root", ["child"])));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.closure.entries.map((entry) => entry.workflowId)).toEqual([
      "child",
      "root",
    ]);
    expect(harness.calls).toEqual([
      "proposal.prepare",
      "closure.save",
      "workflow.save:child",
      "artifact.save:child",
    ]);
    expect(harness.getLockedManifest()?.closureDigest).toBe(result.value.closure.closureDigest);
  });

  it("rejects a retry that changes closure membership before root mutation", async () => {
    const harness = createHarness();
    const first = await harness.service.prepare(proposalInput(workflow("root", ["child"])));
    expect(first.success).toBe(true);

    const second = await harness.service.prepare(
      proposalInput(workflow("root", ["child", "other"]))
    );
    expect(second).toMatchObject({
      success: false,
      error: {
        code: "conflict",
        message: "Proposal branch is already locked to a different workflow closure.",
      },
    });
    expect(harness.calls.filter((call) => call === "proposal.prepare")).toHaveLength(1);
  });

  it("fails before branch preparation when an exact-base child is missing", async () => {
    const harness = createHarness();
    const result = await harness.service.prepare(proposalInput(workflow("root", ["missing"])));

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "invalid_input",
        inputIssues: [expect.stringContaining('child workflow "missing" is missing')],
      },
    });
    expect(harness.calls).toEqual([]);
  });
});
