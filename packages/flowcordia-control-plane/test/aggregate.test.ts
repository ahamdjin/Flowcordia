import { describe, expect, it } from "vitest";

import {
  canBeginOperation,
  newProposal,
  proposalIdentityMatches,
  safeFailureMessage,
  stateFromFailure,
  stateFromReceipt,
  validateCommandContext,
  validateControlPlaneScope,
} from "../src/index.js";
import {
  BASE_BLOB_SHA,
  BASE_SHA,
  PROPOSAL_ID,
  createReceipt,
  createScope,
  createWorkflow,
  githubError,
} from "./fixtures.js";

describe("proposal aggregate", () => {
  it("builds immutable repository and workflow identity", () => {
    const scope = createScope();
    const proposal = newProposal({
      scope,
      proposalId: PROPOSAL_ID,
      workflow: createWorkflow(),
      expectedBaseCommitSha: BASE_SHA,
      expectedBaseBlobSha: BASE_BLOB_SHA,
      creatorReviewerId: "300",
      actorId: "user_42",
      correlationId: "request_1",
    });
    expect(proposal.workflowPath).toBe(".flowcordia/workflows/order_intake.json");
    expect(proposal.proposalBranch).toBe("flowcordia/proposals/order_intake/proposal_0001");
    expect(proposal.state).toBe("CREATING");
    scope.repository.owner = "changed";
    expect(proposal.repository.owner).toBe("acme");
  });

  it("validates tenant scope and command identifiers", () => {
    expect(validateControlPlaneScope(createScope())).toEqual([]);
    expect(
      validateCommandContext({ proposalId: PROPOSAL_ID, actorId: "user_1", correlationId: "req:1" })
    ).toEqual([]);
    expect(validateControlPlaneScope(createScope({ repositoryGithubId: "0" }))).toContain(
      "GitHub repository ID must be a positive decimal string."
    );
    expect(
      validateControlPlaneScope(
        createScope({ repository: { owner: "acme", name: "automations", branch: "../unsafe" } })
      )
    ).toContain("Repository branch is not a valid Git ref name.");
    expect(
      validateCommandContext({ proposalId: "bad space", actorId: "", correlationId: "" })
    ).toHaveLength(3);
  });

  it("requires exact identity on retries", () => {
    const workflow = createWorkflow();
    const proposal = {
      ...newProposal({
        scope: createScope(),
        proposalId: PROPOSAL_ID,
        workflow,
        expectedBaseCommitSha: BASE_SHA,
        expectedBaseBlobSha: BASE_BLOB_SHA,
        creatorReviewerId: "300",
        actorId: "user_42",
        correlationId: "request_1",
      }),
      storageId: "stored_1",
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const identity = {
      scope: createScope(),
      workflow,
      expectedBaseCommitSha: BASE_SHA,
      expectedBaseBlobSha: BASE_BLOB_SHA,
      creatorReviewerId: "300",
    };
    expect(proposalIdentityMatches(proposal, identity)).toBe(true);
    expect(
      proposalIdentityMatches(proposal, {
        ...identity,
        workflow: { ...workflow, id: "different" },
      })
    ).toBe(false);
    expect(
      proposalIdentityMatches(proposal, {
        ...identity,
        workflow: { ...workflow, name: "Changed desired workflow" },
      })
    ).toBe(false);
    expect(
      proposalIdentityMatches(proposal, {
        ...identity,
        scope: {
          ...identity.scope,
          repository: { ...identity.scope.repository, branch: "release" },
        },
      })
    ).toBe(false);
  });

  it("enforces operation state transitions", () => {
    const draft = { state: "DRAFT" } as Parameters<typeof canBeginOperation>[0];
    const ready = { state: "READY" } as Parameters<typeof canBeginOperation>[0];
    expect(canBeginOperation(draft, "submit")).toBe(true);
    expect(canBeginOperation(draft, "promote")).toBe(false);
    expect(canBeginOperation(ready, "promote")).toBe(true);
    expect(stateFromReceipt(createReceipt("create"))).toBe("DRAFT");
    expect(stateFromReceipt(createReceipt("submit"))).toBe("READY");
    expect(stateFromReceipt(createReceipt("promote"))).toBe("MERGED");
  });

  it("routes uncertain failures to reconciliation and policy blocks back to ready", () => {
    expect(stateFromFailure("create", "CREATING", githubError())).toBe("RECONCILING");
    expect(
      stateFromFailure(
        "promote",
        "PROMOTING",
        githubError({ code: "policy_blocked", operation: "promote", retryable: false })
      )
    ).toBe("READY");
    expect(
      stateFromFailure("create", "CREATING", githubError({ code: "conflict", retryable: false }))
    ).toBe("FAILED");
  });

  it("bounds persisted GitHub error messages", () => {
    expect(safeFailureMessage(githubError({ message: " x\n" }))).toBe("x");
    expect(safeFailureMessage(githubError({ message: "a".repeat(600) }))).toHaveLength(500);
  });
});
