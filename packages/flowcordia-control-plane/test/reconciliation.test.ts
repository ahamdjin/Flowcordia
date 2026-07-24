import { describe, expect, it, vi } from "vitest";

import {
  ProposalCommandService,
  ProposalObservationError,
  ProposalReconciliationService,
  type ProposalReconciliationGateway,
  type RemoteProposalObservation,
  type ReconciliationFailureCode,
  type WorkflowProposalAggregate,
} from "../src/index.js";
import {
  HEAD_SHA,
  MERGE_SHA,
  NOW,
  InMemoryProposalStore,
  createCommand,
  createGateway,
} from "./fixtures.js";

const RECONCILE_AT = new Date("2026-07-15T09:00:00.000Z");
type ObservationOverride = {
  pullRequestCollision?: boolean;
  pullRequest?: Partial<NonNullable<RemoteProposalObservation["pullRequest"]>>;
  workflowSha256?: string;
};

const definitiveFailures: Array<[string, ObservationOverride, ReconciliationFailureCode]> = [
  ["proposal collision", { pullRequestCollision: true }, "proposal_collision"],
  ["identity mismatch", { pullRequest: { markerMatches: false } }, "identity_mismatch"],
  ["persisted PR mismatch", { pullRequest: { number: 18 } }, "identity_mismatch"],
  ["workflow mismatch", { workflowSha256: "f".repeat(64) }, "workflow_mismatch"],
];

async function seed(store: InMemoryProposalStore): Promise<WorkflowProposalAggregate> {
  const result = await new ProposalCommandService({
    store,
    github: createGateway(),
    now: () => NOW,
  }).create(createCommand());
  if (!result.success) throw new Error(result.error.message);
  return result.value.proposal;
}

function observation(
  proposal: WorkflowProposalAggregate,
  overrides: Partial<RemoteProposalObservation> = {}
): RemoteProposalObservation {
  return {
    branchSha: HEAD_SHA,
    pullRequest: {
      number: 17,
      url: "https://github.com/acme/automations/pull/17",
      state: "open",
      draft: true,
      merged: false,
      mergeCommitSha: null,
      baseBranch: proposal.baseBranch,
      headBranch: proposal.proposalBranch,
      headSha: HEAD_SHA,
      markerMatches: true,
    },
    pullRequestCollision: false,
    workflowSha256: proposal.desiredWorkflowSha256,
    ...overrides,
  };
}

function service(
  store: InMemoryProposalStore,
  gateway: ProposalReconciliationGateway,
  options: { now?: () => Date; maxMissingAttempts?: number } = {}
) {
  return new ProposalReconciliationService({
    store,
    gateway,
    workerId: "proposal-worker-1",
    createLockToken: () => "reconciliation-lock-0001",
    now: options.now ?? (() => RECONCILE_AT),
    staleAfterMs: 300_000,
    refreshIntervalMs: 900_000,
    baseRetryMs: 100,
    maxRetryMs: 1_000,
    maxMissingAttempts: options.maxMissingAttempts,
    random: () => 1,
  });
}

describe("ProposalReconciliationService", () => {
  it("reconstructs a durable draft projection from exact GitHub proof", async () => {
    const store = new InMemoryProposalStore();
    const proposal = await seed(store);
    const report = await service(store, {
      observe: async () => observation(proposal),
    }).reconcileOnce();

    expect(report).toEqual({ claimed: 1, completed: 1, failed: 0, deferred: 0, leaseLost: 0 });
    const updated = store.proposals.get(proposal.storageId);
    expect(updated).toMatchObject({
      state: "DRAFT",
      headSha: HEAD_SHA,
      pullRequestNumber: 17,
      lastErrorCode: null,
    });
    expect(updated?.lastReconciledAt).toEqual(RECONCILE_AT);
    expect(
      store.audits.has(`${proposal.storageId}:v${proposal.version}:reconciliation:completed:DRAFT`)
    ).toBe(true);
    expect(store.reconciliations.get(proposal.storageId)?.availableAt.toISOString()).toBe(
      "2026-07-15T09:15:00.000Z"
    );
  });

  it("keeps a recovered create retryable until closure identity is durable", async () => {
    const store = new InMemoryProposalStore();
    const proposal = await seed(store);
    store.proposals.set(proposal.storageId, {
      ...proposal,
      state: "CREATING",
      closureSchemaVersion: null,
      closureDigest: null,
      closureWorkflowIds: [],
    });

    const report = await service(store, {
      observe: async () => observation(proposal),
    }).reconcileOnce();

    expect(report).toEqual({
      claimed: 1,
      completed: 0,
      failed: 0,
      deferred: 1,
      leaseLost: 0,
    });
    expect(store.proposals.get(proposal.storageId)).toMatchObject({
      state: "CREATING",
      closureSchemaVersion: null,
      closureDigest: null,
      closureWorkflowIds: [],
    });
  });

  it("settles a merged proposal and stops periodic reconciliation", async () => {
    const store = new InMemoryProposalStore();
    const proposal = await seed(store);
    const report = await service(store, {
      observe: async () =>
        observation(proposal, {
          branchSha: null,
          pullRequest: {
            ...observation(proposal).pullRequest!,
            state: "closed",
            draft: false,
            merged: true,
            mergeCommitSha: MERGE_SHA,
          },
        }),
    }).reconcileOnce();

    expect(report).toEqual({ claimed: 1, completed: 1, failed: 0, deferred: 0, leaseLost: 0 });

    expect(store.proposals.get(proposal.storageId)).toMatchObject({
      state: "MERGED",
      merged: true,
      mergeCommitSha: MERGE_SHA,
    });
    expect(store.reconciliations.has(proposal.storageId)).toBe(false);
  });

  it.each(definitiveFailures)("fails closed on %s", async (_label, partial, expectedCode) => {
    const store = new InMemoryProposalStore();
    const proposal = await seed(store);
    const base = observation(proposal);
    const remote = {
      ...base,
      ...partial,
      ...(partial.pullRequest
        ? { pullRequest: { ...base.pullRequest!, ...partial.pullRequest } }
        : {}),
    } as RemoteProposalObservation;
    const report = await service(store, { observe: async () => remote }).reconcileOnce();

    expect(report.failed).toBe(1);
    expect(store.proposals.get(proposal.storageId)).toMatchObject({
      state: "FAILED",
      lastErrorCode: expectedCode,
    });
  });

  it("bounds eventually-consistent missing resources before failing closed", async () => {
    const store = new InMemoryProposalStore();
    await seed(store);
    let now = RECONCILE_AT;
    const reconciler = service(
      store,
      {
        observe: async () => ({
          branchSha: HEAD_SHA,
          pullRequest: null,
          pullRequestCollision: false,
          workflowSha256: null,
        }),
      },
      { now: () => now, maxMissingAttempts: 2 }
    );

    await expect(reconciler.reconcileOnce()).resolves.toMatchObject({ deferred: 1, failed: 0 });
    now = new Date(now.getTime() + 1_001);
    await expect(reconciler.reconcileOnce()).resolves.toMatchObject({ deferred: 0, failed: 1 });
  });

  it("defers retryable GitHub failures without mutating proposal state", async () => {
    const store = new InMemoryProposalStore();
    const proposal = await seed(store);
    const report = await service(store, {
      observe: async () => {
        throw new ProposalObservationError(
          "github_unavailable",
          "GitHub is temporarily unavailable.",
          {
            retryable: true,
            retryAfterMs: 750,
          }
        );
      },
    }).reconcileOnce();

    expect(report.deferred).toBe(1);
    expect(store.proposals.get(proposal.storageId)?.state).toBe("DRAFT");
    expect(store.reconciliations.get(proposal.storageId)?.availableAt.toISOString()).toBe(
      "2026-07-15T09:00:00.750Z"
    );
  });

  it("reports optimistic lease loss without overwriting concurrent state", async () => {
    const store = new InMemoryProposalStore();
    const proposal = await seed(store);
    vi.spyOn(store, "completeReconciliation").mockResolvedValueOnce(false);
    const report = await service(store, {
      observe: async () => observation(proposal),
    }).reconcileOnce();
    expect(report.leaseLost).toBe(1);
    expect(store.proposals.get(proposal.storageId)?.version).toBe(proposal.version);
  });

  it("propagates persistence outages without misclassifying them as remote corruption", async () => {
    const store = new InMemoryProposalStore();
    const proposal = await seed(store);
    vi.spyOn(store, "completeReconciliation").mockRejectedValueOnce(
      new Error("database is temporarily unavailable")
    );
    await expect(
      service(store, { observe: async () => observation(proposal) }).reconcileOnce()
    ).rejects.toThrow("database is temporarily unavailable");
    expect(store.proposals.get(proposal.storageId)?.state).toBe("DRAFT");
    expect(
      [...store.audits.values()].some(
        (event) => event.eventType === "proposal.reconciliation.failed"
      )
    ).toBe(false);
  });
});
