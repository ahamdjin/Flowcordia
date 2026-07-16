import { describe, expect, it, vi } from "vitest";

import { OutboxDispatcher } from "../src/index.js";
import { NOW, InMemoryProposalStore } from "./fixtures.js";

async function seed(store: InMemoryProposalStore, dedupeKey = "proposal:event:1") {
  await store.enqueueOutbox({
    dedupeKey,
    eventType: "proposal.create.requested",
    aggregateType: "flowcordia.workflow_proposal",
    aggregateId: "stored_1",
    tenantId: "tenant_1",
    payload: { proposalId: "proposal_0001" },
    occurredAt: NOW,
    availableAt: NOW,
  });
}

function dispatcher(
  store: InMemoryProposalStore,
  publish: (
    event: Parameters<
      NonNullable<ConstructorParameters<typeof OutboxDispatcher>[0]["publisher"]>["publish"]
    >[0]
  ) => Promise<void>
) {
  return new OutboxDispatcher({
    store,
    publisher: { publish },
    workerId: "worker_1",
    createLockToken: () => "lock-token-0001",
    now: () => NOW,
    baseRetryMs: 1_000,
    maxRetryMs: 8_000,
    random: () => 1,
  });
}

describe("OutboxDispatcher", () => {
  it("publishes and acknowledges a claimed event", async () => {
    const store = new InMemoryProposalStore();
    await seed(store);
    const publish = vi.fn(async () => undefined);
    const report = await dispatcher(store, publish).dispatchOnce();
    expect(report).toEqual({ claimed: 1, published: 1, released: 0, leaseLost: 0 });
    expect(publish).toHaveBeenCalledTimes(1);
    expect([...store.outbox.values()][0]?.publishedAt).toEqual(NOW);
  });

  it("releases failed delivery with bounded exponential retry", async () => {
    const store = new InMemoryProposalStore();
    await seed(store);
    const report = await dispatcher(store, async () => {
      throw new Error("broker\nfailed");
    }).dispatchOnce();
    expect(report).toEqual({ claimed: 1, published: 0, released: 1, leaseLost: 0 });
    const event = [...store.outbox.values()][0];
    expect(event?.availableAt.toISOString()).toBe("2026-07-15T08:00:01.000Z");
    expect(event?.lastError).toBe("broker failed");
    expect(event?.attempts).toBe(1);
  });

  it("reports a lost lease instead of acknowledging another worker's claim", async () => {
    const store = new InMemoryProposalStore();
    await seed(store);
    vi.spyOn(store, "acknowledgeOutbox").mockResolvedValueOnce(false);
    const report = await dispatcher(store, async () => undefined).dispatchOnce();
    expect(report.leaseLost).toBe(1);
    expect(report.published).toBe(0);
  });

  it("claims only available, unlocked, unpublished events", async () => {
    const store = new InMemoryProposalStore();
    await seed(store, "available");
    await seed(store, "future");
    const future = store.outbox.get("future");
    if (future) future.availableAt = new Date(NOW.getTime() + 10_000);
    const publish = vi.fn(async () => undefined);
    const report = await dispatcher(store, publish).dispatchOnce();
    expect(report.claimed).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("is idle when there are no available events", async () => {
    const store = new InMemoryProposalStore();
    const publish = vi.fn(async () => undefined);
    await expect(dispatcher(store, publish).dispatchOnce()).resolves.toEqual({
      claimed: 0,
      published: 0,
      released: 0,
      leaseLost: 0,
    });
  });

  it("rejects unsafe worker and lock identities", async () => {
    const store = new InMemoryProposalStore();
    expect(
      () =>
        new OutboxDispatcher({
          store,
          publisher: { publish: async () => undefined },
          workerId: "bad worker",
          createLockToken: () => "lock-token-0001",
        })
    ).toThrow("worker ID");
    const invalidToken = new OutboxDispatcher({
      store,
      publisher: { publish: async () => undefined },
      workerId: "worker_1",
      createLockToken: () => "short",
    });
    await expect(invalidToken.dispatchOnce()).rejects.toThrow("lock token");
  });

  it("bounds operational tuning values", () => {
    const store = new InMemoryProposalStore();
    expect(
      () =>
        new OutboxDispatcher({
          store,
          publisher: { publish: async () => undefined },
          workerId: "worker_1",
          createLockToken: () => "lock-token-0001",
          batchSize: 0,
        })
    ).toThrow("batch size");
  });
});
