import { cloneWorkflow } from "@flowcordia/workflow";
import { GitHubTransportError } from "@flowcordia/github-workflows";
import { describe, expect, it } from "vitest";

import { buildProposalBody } from "../src/index.js";
import {
  BASE_BLOB_SHA,
  BASE_SHA,
  HEAD_SHA,
  PROPOSAL_ID,
  createEnvironment,
  createPullRequest,
  mutation,
} from "./fixtures.js";

function createInput(environment: ReturnType<typeof createEnvironment>) {
  return {
    scope: environment.scope,
    proposalId: PROPOSAL_ID,
    workflow: environment.workflow,
    expectedBaseCommitSha: BASE_SHA,
    expectedBaseBlobSha: BASE_BLOB_SHA,
    creatorReviewerId: environment.identity.creatorReviewerId,
    mutation,
  };
}

describe("GitHubProposalService.create", () => {
  it("creates a branch from the exact base, stores the workflow, and opens a draft PR", async () => {
    const environment = createEnvironment();

    const result = await environment.service.create(createInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(environment.client.createBranch).toHaveBeenCalledWith(
      expect.objectContaining({ fromCommitSha: BASE_SHA, branch: environment.proposalBranch })
    );
    expect(environment.workflowStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ expectedBlobSha: BASE_BLOB_SHA })
    );
    expect(environment.workflowStore.saveGeneratedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "order_intake",
        sourceText: expect.stringContaining("executeFlowcordiaWorkflow"),
      })
    );
    expect(environment.client.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        baseBranch: "main",
        headBranch: environment.proposalBranch,
        draft: true,
      })
    );
    expect(result.value.proposal).toEqual(
      expect.objectContaining({ headSha: HEAD_SHA, draft: true, pullRequestNumber: 17 })
    );
    expect(result.value.resumed).toBe(false);
    expect(result.value.audit.outcome).toBe("created");
  });

  it("rejects a stale base commit before creating a proposal branch", async () => {
    const environment = createEnvironment();
    const input = createInput(environment);
    input.expectedBaseCommitSha = "f".repeat(40);

    const result = await environment.service.create(input);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "conflict", actualHeadSha: BASE_SHA }),
      })
    );
    expect(environment.client.createBranch).not.toHaveBeenCalled();
  });

  it("validates proposal identity before resolving installation credentials", async () => {
    const environment = createEnvironment();
    const input = createInput(environment);
    input.proposalId = "../bad";

    const result = await environment.service.create(input);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "invalid_input", phase: "validation" }),
      })
    );
    expect(environment.resolver.resolve).not.toHaveBeenCalled();
  });

  it("requires an explicit creator reviewer identity or null", async () => {
    const environment = createEnvironment();
    const input = createInput(environment);
    delete (input as { creatorReviewerId?: string | null }).creatorReviewerId;

    const result = await environment.service.create(input as never);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "invalid_input",
          inputIssues: expect.arrayContaining([
            "Creator reviewer ID must be null or a valid GitHub reviewer identity.",
          ]),
        }),
      })
    );
    expect(environment.resolver.resolve).not.toHaveBeenCalled();
  });

  it("rejects an invalid workflow before making GitHub calls", async () => {
    const environment = createEnvironment();
    const input = createInput(environment);
    input.workflow = { ...environment.workflow, nodes: "invalid" } as never;

    const result = await environment.service.create(input);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "workflow_error", phase: "validation" }),
      })
    );
    expect(environment.resolver.resolve).not.toHaveBeenCalled();
  });

  it("rejects code references owned by another repository", async () => {
    const environment = createEnvironment();
    const input = createInput(environment);
    const workflow = cloneWorkflow(environment.workflow);
    workflow.nodes[1] = {
      id: "route_order",
      kind: "code",
      operation: "code.task",
      position: { x: 300, y: 0 },
      configuration: {},
      codeReference: {
        repository: "other/automation-code",
        path: "src/route-order.ts",
        exportName: "routeOrder",
      },
    };
    input.workflow = workflow;

    const result = await environment.service.create(input);

    expect(result).toMatchObject({
      success: false,
      error: { code: "workflow_error", phase: "validation" },
    });
    expect(environment.resolver.resolve).not.toHaveBeenCalled();
  });

  it("resumes an advanced branch when it contains the exact desired workflow", async () => {
    const environment = createEnvironment({ branchExists: true, branchSha: HEAD_SHA });

    const result = await environment.service.create(createInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.resumed).toBe(true);
    expect(result.value.audit.outcome).toBe("resumed");
    expect(environment.workflowStore.save).not.toHaveBeenCalled();
    expect(environment.workflowStore.read).toHaveBeenCalledTimes(1);
    expect(environment.workflowStore.readGeneratedArtifact).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a resumed proposal contains different generated code", async () => {
    const environment = createEnvironment({ branchExists: true, branchSha: HEAD_SHA });
    environment.workflowStore.readGeneratedArtifact.mockResolvedValueOnce({
      success: true,
      value: {
        workflowId: "order_intake",
        sourceText: "export const tampered = true;",
        source: {
          repository: { ...environment.scope.repository, branch: environment.proposalBranch },
          path: "trigger/flowcordia/order_intake.ts",
          requestedRevision: environment.proposalBranch,
          commitSha: HEAD_SHA,
          blobSha: "e".repeat(40),
        },
      },
    });

    const result = await environment.service.create(createInput(environment));

    expect(result).toMatchObject({
      success: false,
      error: { code: "proposal_collision", phase: "workflow" },
    });
    expect(environment.client.createPullRequest).not.toHaveBeenCalled();
  });

  it("fails closed when an existing proposal branch contains different workflow content", async () => {
    const environment = createEnvironment({ branchExists: true, branchSha: HEAD_SHA });
    const other = cloneWorkflow(environment.workflow);
    other.name = "Different workflow";
    environment.workflowStore.read.mockResolvedValueOnce({
      success: true,
      value: {
        workflow: other,
        source: {
          repository: { ...environment.scope.repository, branch: environment.proposalBranch },
          path: ".flowcordia/workflows/order_intake.json",
          requestedRevision: environment.proposalBranch,
          commitSha: HEAD_SHA,
          blobSha: "e".repeat(40),
        },
        appliedMigrations: [],
      },
    });

    const result = await environment.service.create(createInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "proposal_collision", phase: "workflow" }),
      })
    );
    expect(environment.client.createPullRequest).not.toHaveBeenCalled();
  });

  it("reconciles an ambiguous branch creation without retrying the mutation", async () => {
    const environment = createEnvironment();
    environment.client.createBranch.mockImplementationOnce(async () => {
      environment.state.branchExists = true;
      environment.state.branchSha = BASE_SHA;
      throw new GitHubTransportError("socket closed", {
        code: "network_error",
        mutationMayHaveSucceeded: true,
        requestId: "request-branch",
      });
    });

    const result = await environment.service.create(createInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.audit.outcome).toBe("recovered");
    expect(environment.client.createBranch).toHaveBeenCalledTimes(1);
  });

  it("reconciles an ambiguous workflow write by comparing canonical content", async () => {
    const environment = createEnvironment();
    environment.workflowStore.save.mockImplementationOnce(async () => {
      environment.state.branchSha = HEAD_SHA;
      return {
        success: false,
        error: {
          code: "ambiguous_write",
          operation: "save",
          message: "unknown",
          retryable: false,
          requestId: "request-workflow",
        },
      };
    });

    const result = await environment.service.create(createInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.audit.outcome).toBe("recovered");
    expect(environment.workflowStore.save).toHaveBeenCalledTimes(1);
    expect(environment.workflowStore.read).toHaveBeenCalledTimes(1);
  });

  it("reconciles an ambiguous pull request creation by deterministic branch mapping", async () => {
    const environment = createEnvironment();
    environment.client.createPullRequest.mockImplementationOnce(async () => {
      const pullRequest = createPullRequest({
        draft: true,
        body: buildProposalBody(environment.identity, environment.workflow),
      });
      environment.state.pullRequests = [pullRequest];
      throw new GitHubTransportError("connection reset", {
        code: "network_error",
        mutationMayHaveSucceeded: true,
      });
    });

    const result = await environment.service.create(createInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.audit.outcome).toBe("recovered");
    expect(environment.client.createPullRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects an existing pull request with a different machine marker", async () => {
    const environment = createEnvironment({
      branchExists: true,
      branchSha: HEAD_SHA,
      pullRequests: [createPullRequest({ body: "unmanaged" })],
    });

    const result = await environment.service.create(createInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "proposal_collision", phase: "pull_request" }),
      })
    );
  });

  it("rejects multiple pull requests mapped to the same proposal branch", async () => {
    const pullRequest = createPullRequest();
    const environment = createEnvironment({
      branchExists: true,
      branchSha: HEAD_SHA,
      pullRequests: [pullRequest, { ...pullRequest, number: 18 }],
    });

    const result = await environment.service.create(createInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "proposal_collision" }),
      })
    );
  });

  it("does not reuse a proposal ID whose pull request was already closed", async () => {
    const environment = createEnvironment({
      branchExists: true,
      branchSha: HEAD_SHA,
      pullRequests: [createPullRequest({ state: "closed" })],
    });

    const result = await environment.service.create(createInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "proposal_collision" }),
      })
    );
  });
});
