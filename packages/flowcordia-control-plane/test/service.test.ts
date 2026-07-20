import { beforeEach, describe, expect, it } from "vitest";

import { ProposalCommandService } from "../src/index.js";
import {
  HEAD_SHA,
  MERGE_SHA,
  NOW,
  PROPOSAL_ID,
  InMemoryProposalStore,
  createCommand,
  createGateway,
  createReceipt,
  createReference,
  githubError,
} from "./fixtures.js";

describe("ProposalCommandService", () => {
  let store: InMemoryProposalStore;
  let gateway: ReturnType<typeof createGateway>;
  let service: ProposalCommandService;

  beforeEach(() => {
    store = new InMemoryProposalStore();
    gateway = createGateway();
    service = new ProposalCommandService({ store, github: gateway, now: () => NOW });
  });

  it("reserves durable identity before mutating GitHub", async () => {
    gateway.create.mockImplementationOnce(async () => {
      expect(store.proposals.size).toBe(1);
      expect([...store.proposals.values()][0]?.state).toBe("CREATING");
      return {
        success: true,
        value: {
          proposal: createReference(),
          workflowSource: {
            repository: {
              owner: "acme",
              name: "automations",
              branch: "flowcordia/proposals/order_intake/proposal_0001",
            },
            path: ".flowcordia/workflows/order_intake.json",
            requestedRevision: "flowcordia/proposals/order_intake/proposal_0001",
            commitSha: HEAD_SHA,
            blobSha: "e".repeat(40),
            sourceSchemaVersion: "0.1",
          },
          resumed: false,
          audit: createReceipt("create"),
        },
      };
    });

    const result = await service.create(createCommand());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.proposal.state).toBe("DRAFT");
    expect(result.value.proposal.pullRequestNumber).toBe(17);
    expect(store.audits.size).toBe(2);
    expect(store.outbox.size).toBe(2);
  });

  it("resumes an exact retry without creating a second pull request", async () => {
    expect((await service.create(createCommand())).success).toBe(true);
    const retry = await service.create({ ...createCommand(), correlationId: "request_retry" });
    expect(retry.success).toBe(true);
    if (!retry.success) return;
    expect(retry.value.resumed).toBe(true);
    expect(retry.value.github).toBeNull();
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(store.proposals.size).toBe(1);
    expect(
      [...store.audits.values()].some((event) => event.eventType === "proposal.create.resumed")
    ).toBe(true);
  });

  it("rejects reuse of a proposal ID with different immutable identity", async () => {
    await service.create(createCommand());
    const conflicting = createCommand();
    conflicting.workflow = { ...conflicting.workflow, name: "Different desired content" };
    const result = await service.create(conflicting);
    expect(result).toMatchObject({ success: false, error: { code: "conflict", retryable: false } });
    expect(gateway.create).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input before persistence or GitHub", async () => {
    const command = createCommand();
    command.expectedBaseCommitSha = "unsafe";
    const result = await service.create(command);
    expect(result).toMatchObject({ success: false, error: { code: "invalid_input" } });
    expect(store.proposals.size).toBe(0);
    expect(gateway.create).not.toHaveBeenCalled();
  });

  it("rejects a gateway receipt that disagrees with the requested actor", async () => {
    const implementation = gateway.create.getMockImplementation();
    if (!implementation) throw new Error("Missing gateway implementation.");
    gateway.create.mockImplementationOnce(async (input) => {
      const result = await implementation(input);
      if (result.success) result.value.audit.actorId = "different_actor";
      return result;
    });
    const result = await service.create(createCommand());
    expect(result).toMatchObject({ success: false, error: { code: "conflict" } });
    expect([...store.proposals.values()][0]?.state).toBe("CREATING");
  });

  it("marks uncertain GitHub mutations for reconciliation", async () => {
    gateway.create.mockResolvedValueOnce({
      success: false,
      error: githubError({ code: "ambiguous_mutation" }),
    });
    const result = await service.create(createCommand());
    expect(result).toMatchObject({
      success: false,
      error: { code: "github_operation_failed", retryable: true },
    });
    expect([...store.proposals.values()][0]?.state).toBe("RECONCILING");
    expect(
      [...store.audits.values()].some(
        (event) => event.eventType === "proposal.reconciliation.required"
      )
    ).toBe(true);
  });

  it("makes definitive creation failures terminal", async () => {
    gateway.create.mockResolvedValueOnce({
      success: false,
      error: githubError({ code: "conflict", retryable: false }),
    });
    await service.create(createCommand());
    expect([...store.proposals.values()][0]?.state).toBe("FAILED");
    const retry = await service.create({ ...createCommand(), correlationId: "request_retry" });
    expect(retry).toMatchObject({ success: false, error: { code: "conflict" } });
    expect(gateway.create).toHaveBeenCalledTimes(1);
  });

  it("submits and promotes through explicit persisted states", async () => {
    await service.create(createCommand());
    const submit = await service.submit({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_submit",
    });
    expect(submit.success && submit.value.proposal.state).toBe("READY");

    const promote = await service.promote({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_promote",
      policy: { minimumApprovals: 2, requiredCheckNames: ["PR Checks"] },
      mergeMethod: "squash",
    });
    expect(promote.success).toBe(true);
    if (!promote.success) return;
    expect(promote.value.proposal.state).toBe("MERGED");
    expect(promote.value.proposal.mergeCommitSha).toBe(MERGE_SHA);
    expect(gateway.submit).toHaveBeenCalledTimes(1);
    expect(gateway.promote).toHaveBeenCalledTimes(1);
  });

  it("rejects stale heads before invoking GitHub", async () => {
    await service.create(createCommand());
    const result = await service.submit({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: "f".repeat(40),
      actorId: "user_42",
      correlationId: "request_submit",
    });
    expect(result).toMatchObject({ success: false, error: { code: "conflict" } });
    expect(gateway.submit).not.toHaveBeenCalled();
  });

  it("returns a terminal merge as an idempotent no-op", async () => {
    await service.create(createCommand());
    await service.submit({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_submit",
    });
    const command = {
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_promote",
      policy: {},
      mergeMethod: "merge" as const,
    };
    await service.promote(command);
    const repeated = await service.promote({ ...command, correlationId: "request_again" });
    expect(repeated.success && repeated.value.resumed).toBe(true);
    expect(gateway.promote).toHaveBeenCalledTimes(1);
  });

  it("rejects stale heads before idempotent submit or promote no-ops", async () => {
    await service.create(createCommand());
    await service.submit({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_submit",
    });
    const staleHeadSha = "f".repeat(40);
    const staleSubmit = await service.submit({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: staleHeadSha,
      actorId: "user_42",
      correlationId: "request_stale_submit",
    });
    expect(staleSubmit).toMatchObject({
      success: false,
      error: { code: "conflict", retryable: false },
    });

    await service.promote({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_promote",
      policy: {},
      mergeMethod: "merge",
    });
    const stalePromote = await service.promote({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: staleHeadSha,
      actorId: "user_42",
      correlationId: "request_stale_promote",
      policy: {},
      mergeMethod: "merge",
    });
    expect(stalePromote).toMatchObject({
      success: false,
      error: { code: "conflict", retryable: false },
    });
    expect(gateway.submit).toHaveBeenCalledTimes(1);
    expect(gateway.promote).toHaveBeenCalledTimes(1);
  });

  it("restores ready state when promotion policy blocks", async () => {
    await service.create(createCommand());
    await service.submit({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_submit",
    });
    gateway.promote.mockResolvedValueOnce({
      success: false,
      error: githubError({
        code: "policy_blocked",
        operation: "promote",
        phase: "policy",
        retryable: false,
        policyBlockers: [{ code: "approval_count", message: "Two approvals are required." }],
      }),
    });
    const result = await service.promote({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_promote",
      policy: { minimumApprovals: 2 },
      mergeMethod: "squash",
    });
    expect(result).toMatchObject({ success: false, error: { code: "github_operation_failed" } });
    expect([...store.proposals.values()][0]?.state).toBe("READY");
    expect(
      [...store.audits.values()].some((event) => event.eventType === "proposal.operation.blocked")
    ).toBe(true);
  });

  it("scopes not-found results without leaking repository existence", async () => {
    const result = await service.submit({
      scope: createCommand().scope,
      proposalId: PROPOSAL_ID,
      expectedHeadSha: HEAD_SHA,
      actorId: "user_42",
      correlationId: "request_submit",
    });
    expect(result).toMatchObject({
      success: false,
      error: { code: "not_found", retryable: false },
    });
  });
});
