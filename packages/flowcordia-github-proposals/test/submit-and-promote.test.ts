import { GitHubTransportError } from "@flowcordia/github-workflows";
import { describe, expect, it } from "vitest";

import { HEAD_SHA, MERGE_SHA, createEnvironment, createSnapshot, mutation } from "./fixtures.js";

function submitInput(environment: ReturnType<typeof createEnvironment>) {
  return {
    scope: environment.scope,
    ...environment.identity,
    pullRequestNumber: 17,
    expectedHeadSha: HEAD_SHA,
    mutation,
  };
}

function promoteInput(environment: ReturnType<typeof createEnvironment>) {
  return {
    ...submitInput(environment),
    policy: { minimumApprovals: 1, requiredCheckNames: ["PR Checks"] },
    mergeMethod: "squash" as const,
  };
}

describe("GitHubProposalService.submit", () => {
  it("marks only the exact draft head ready for review", async () => {
    const environment = createEnvironment({
      snapshot: createSnapshot({ pullRequest: { draft: true } }),
    });

    const result = await environment.service.submit(submitInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(environment.client.markReadyForReview).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHeadSha: HEAD_SHA, pullRequestNumber: 17 })
    );
    expect(result.value.noChange).toBe(false);
    expect(result.value.audit.outcome).toBe("submitted");
  });

  it("returns an auditable no-op when the pull request is already ready", async () => {
    const environment = createEnvironment({
      snapshot: createSnapshot({ pullRequest: { draft: false } }),
    });

    const result = await environment.service.submit(submitInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.noChange).toBe(true);
    expect(result.value.audit.outcome).toBe("already_ready");
    expect(environment.client.markReadyForReview).not.toHaveBeenCalled();
  });

  it("rejects head drift before changing review state", async () => {
    const environment = createEnvironment({
      snapshot: createSnapshot({ pullRequest: { draft: true, headSha: "f".repeat(40) } }),
    });

    const result = await environment.service.submit(submitInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "conflict", expectedHeadSha: HEAD_SHA }),
      })
    );
    expect(environment.client.markReadyForReview).not.toHaveBeenCalled();
  });

  it("reconciles an ambiguous ready-for-review mutation", async () => {
    const environment = createEnvironment();
    environment.client.getProposalSnapshot
      .mockResolvedValueOnce(createSnapshot({ pullRequest: { draft: true } }))
      .mockResolvedValueOnce(createSnapshot({ pullRequest: { draft: false } }));
    environment.client.markReadyForReview.mockRejectedValueOnce(
      new GitHubTransportError("timeout", {
        code: "network_error",
        mutationMayHaveSucceeded: true,
      })
    );

    const result = await environment.service.submit(submitInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.audit.outcome).toBe("recovered");
    expect(environment.client.markReadyForReview).toHaveBeenCalledTimes(1);
  });

  it("returns a retryable outage when ready-for-review fails before mutation", async () => {
    const environment = createEnvironment({
      snapshot: createSnapshot({ pullRequest: { draft: true } }),
    });
    environment.client.markReadyForReview.mockRejectedValueOnce(
      new GitHubTransportError("preflight unavailable", {
        code: "network_error",
        mutationMayHaveSucceeded: false,
      })
    );

    const result = await environment.service.submit(submitInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "unavailable", retryable: true }),
      })
    );
    expect(environment.client.getProposalSnapshot).toHaveBeenCalledTimes(1);
  });

  it("rejects a pull request whose proposal marker does not match", async () => {
    const environment = createEnvironment({
      snapshot: createSnapshot({ pullRequest: { draft: true, body: "unmanaged" } }),
    });

    const result = await environment.service.submit(submitInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "proposal_collision" }),
      })
    );
  });
});

describe("GitHubProposalService.promote", () => {
  it("merges the exact reviewed head with the configured method", async () => {
    const environment = createEnvironment();

    const result = await environment.service.promote(promoteInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(environment.client.mergePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHeadSha: HEAD_SHA, method: "squash" })
    );
    expect(result.value.mergeCommitSha).toBe(MERGE_SHA);
    expect(result.value.proposal.merged).toBe(true);
    expect(result.value.audit.outcome).toBe("promoted");
    expect(environment.workflowStore.read).toHaveBeenCalledWith(
      expect.objectContaining({ revision: HEAD_SHA })
    );
    expect(environment.workflowStore.readGeneratedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ revision: HEAD_SHA })
    );
  });

  it("rejects a generated artifact that no longer matches the reviewed workflow", async () => {
    const environment = createEnvironment();
    environment.workflowStore.readGeneratedArtifact.mockResolvedValueOnce({
      success: true,
      value: {
        workflowId: environment.workflow.id,
        sourceText: "export const tampered = true;\n",
        source: {
          repository: { ...environment.scope.repository, branch: environment.proposalBranch },
          path: ".flowcordia/generated/order_intake.ts",
          requestedRevision: HEAD_SHA,
          commitSha: HEAD_SHA,
          blobSha: "e".repeat(40),
        },
      },
    });

    const result = await environment.service.promote(promoteInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "workflow_error", phase: "workflow" }),
      })
    );
    expect(environment.client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("returns structured blockers without attempting a merge", async () => {
    const environment = createEnvironment({
      snapshot: createSnapshot({ reviews: [], checks: [] }),
    });

    const result = await environment.service.promote(promoteInput(environment));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("policy_blocked");
    expect(result.error.policyBlockers?.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["approval_count", "required_check_missing"])
    );
    expect(environment.client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("returns an idempotent success for the exact already-merged proposal", async () => {
    const environment = createEnvironment({
      snapshot: createSnapshot({
        pullRequest: { state: "closed", merged: true, mergeCommitSha: MERGE_SHA },
      }),
    });

    const result = await environment.service.promote(promoteInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.alreadyMerged).toBe(true);
    expect(result.value.audit.outcome).toBe("already_merged");
    expect(environment.client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("reconciles an ambiguous merge without issuing a second merge", async () => {
    const environment = createEnvironment();
    environment.client.getProposalSnapshot
      .mockResolvedValueOnce(createSnapshot())
      .mockResolvedValueOnce(
        createSnapshot({
          pullRequest: { state: "closed", merged: true, mergeCommitSha: MERGE_SHA },
        })
      );
    environment.client.mergePullRequest.mockRejectedValueOnce(
      new GitHubTransportError("socket closed", {
        code: "network_error",
        mutationMayHaveSucceeded: true,
      })
    );

    const result = await environment.service.promote(promoteInput(environment));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.mergeCommitSha).toBe(MERGE_SHA);
    expect(result.value.audit.outcome).toBe("recovered");
    expect(environment.client.mergePullRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps GitHub repository rules authoritative when GitHub declines merge", async () => {
    const environment = createEnvironment();
    environment.client.mergePullRequest.mockRejectedValueOnce(
      new GitHubTransportError("not mergeable", { code: "http_error", status: 405 })
    );

    const result = await environment.service.promote(promoteInput(environment));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("policy_blocked");
    expect(result.error.policyBlockers).toContainEqual(
      expect.objectContaining({ code: "github_rules_blocked" })
    );
  });

  it("rejects a new head before evaluating or merging", async () => {
    const environment = createEnvironment({
      snapshot: createSnapshot({ pullRequest: { headSha: "f".repeat(40) } }),
    });

    const result = await environment.service.promote(promoteInput(environment));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "conflict", actualHeadSha: "f".repeat(40) }),
      })
    );
    expect(environment.client.mergePullRequest).not.toHaveBeenCalled();
  });

  it("reports a definitive GitHub non-merge response as a repository-rule blocker", async () => {
    const environment = createEnvironment();
    environment.client.mergePullRequest.mockResolvedValueOnce({
      merged: false,
      mergeCommitSha: null,
    });

    const result = await environment.service.promote(promoteInput(environment));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.policyBlockers).toContainEqual(
      expect.objectContaining({ code: "github_rules_blocked" })
    );
  });

  it("rejects invalid merge and policy configuration before resolving credentials", async () => {
    const environment = createEnvironment();
    const input = {
      ...promoteInput(environment),
      mergeMethod: "force",
      policy: { minimumApprovals: -1 },
    };

    const result = await environment.service.promote(input as never);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "invalid_input", phase: "validation" }),
      })
    );
    expect(environment.resolver.resolve).not.toHaveBeenCalled();
  });
});
