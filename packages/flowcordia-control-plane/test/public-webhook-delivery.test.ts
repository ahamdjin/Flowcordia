import { describe, expect, it } from "vitest";
import {
  PublicWebhookDeliveryConcurrencyError,
  PublicWebhookDeliveryService,
  PublicWebhookDeliveryValidationError,
  PublicWebhookReplayMismatchError,
  type PublicWebhookDeliveryRecord,
  type PublicWebhookDeliveryStore,
  type PublicWebhookDeliveryTransaction,
  type ReservePublicWebhookDeliveryInput,
} from "../src/webhook/public-delivery.js";

function copy(record: PublicWebhookDeliveryRecord): PublicWebhookDeliveryRecord {
  return {
    ...record,
    receivedAt: new Date(record.receivedAt),
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    leaseExpiresAt: record.leaseExpiresAt ? new Date(record.leaseExpiresAt) : null,
  };
}

class MemoryPublicWebhookStore implements PublicWebhookDeliveryStore {
  readonly records = new Map<string, PublicWebhookDeliveryRecord>();
  nextId = 1;

  private key(input: { environmentId: string; workflowId: string; deliveryId: string }): string {
    return `${input.environmentId}:${input.workflowId}:${input.deliveryId}`;
  }

  async transaction<T>(
    callback: (transaction: PublicWebhookDeliveryTransaction) => Promise<T>
  ): Promise<T> {
    const transaction: PublicWebhookDeliveryTransaction = {
      insertDelivery: async (input) => {
        const key = this.key(input);
        const existing = this.records.get(key);
        if (existing) return { status: "duplicate" as const, delivery: copy(existing) };
        const delivery: PublicWebhookDeliveryRecord = {
          storageId: `delivery_${this.nextId++}`,
          tenantId: input.tenantId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          workflowId: input.workflowId,
          deliveryId: input.deliveryId,
          payloadHash: input.payloadHash,
          status: "RECEIVED",
          attempts: 1,
          leaseToken: input.leaseToken,
          leaseExpiresAt: new Date(input.leaseExpiresAt),
          runFriendlyId: null,
          failureCode: null,
          receivedAt: new Date(input.receivedAt),
          completedAt: null,
        };
        this.records.set(key, delivery);
        return { status: "inserted" as const, delivery: copy(delivery) };
      },
      reacquireDelivery: async (input) => {
        const entry = Array.from(this.records.entries()).find(
          ([, record]) => record.storageId === input.storageId
        );
        if (!entry) return null;
        const [key, record] = entry;
        if (record.payloadHash !== input.payloadHash || record.status === "TRIGGERED") return null;
        if (
          record.status === "RECEIVED" &&
          record.leaseExpiresAt &&
          record.leaseExpiresAt.getTime() > input.now.getTime()
        ) {
          return null;
        }
        const updated: PublicWebhookDeliveryRecord = {
          ...record,
          status: "RECEIVED",
          attempts: record.attempts + 1,
          leaseToken: input.leaseToken,
          leaseExpiresAt: new Date(input.leaseExpiresAt),
          failureCode: null,
          completedAt: null,
        };
        this.records.set(key, updated);
        return copy(updated);
      },
      completeDelivery: async (input) => {
        const entry = Array.from(this.records.entries()).find(
          ([, record]) => record.storageId === input.storageId
        );
        if (!entry) return false;
        const [key, record] = entry;
        if (
          record.status !== "RECEIVED" ||
          record.leaseToken !== input.leaseToken ||
          !record.leaseExpiresAt ||
          record.leaseExpiresAt.getTime() <= input.completedAt.getTime()
        ) {
          return false;
        }
        this.records.set(key, {
          ...record,
          status: "TRIGGERED",
          leaseToken: null,
          leaseExpiresAt: null,
          runFriendlyId: input.runFriendlyId,
          failureCode: null,
          completedAt: new Date(input.completedAt),
        });
        return true;
      },
      failDelivery: async (input) => {
        const entry = Array.from(this.records.entries()).find(
          ([, record]) => record.storageId === input.storageId
        );
        if (!entry) return false;
        const [key, record] = entry;
        if (
          record.status !== "RECEIVED" ||
          record.leaseToken !== input.leaseToken ||
          !record.leaseExpiresAt ||
          record.leaseExpiresAt.getTime() <= input.completedAt.getTime()
        ) {
          return false;
        }
        this.records.set(key, {
          ...record,
          status: "FAILED",
          leaseToken: null,
          leaseExpiresAt: null,
          failureCode: input.failureCode,
          completedAt: new Date(input.completedAt),
        });
        return true;
      },
    };
    return callback(transaction);
  }
}

const now = new Date("2026-07-22T03:00:00.000Z");

function reservation(
  overrides: Partial<ReservePublicWebhookDeliveryInput> = {}
): ReservePublicWebhookDeliveryInput {
  return {
    tenantId: "org_123",
    projectId: "project_123",
    environmentId: "env_123",
    workflowId: "orders_intake",
    deliveryId: "delivery-001",
    payloadHash: "a".repeat(64),
    receivedAt: now,
    now,
    leaseToken: "lease_token_0001",
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    ...overrides,
  };
}

describe("PublicWebhookDeliveryService", () => {
  it("acquires a new delivery once and exposes no payload", async () => {
    const store = new MemoryPublicWebhookStore();
    const service = new PublicWebhookDeliveryService(store);
    await expect(service.reserve(reservation())).resolves.toMatchObject({
      status: "acquired",
      attempts: 1,
      resumed: false,
      leaseToken: "lease_token_0001",
    });
    const stored = Array.from(store.records.values())[0]!;
    expect(stored.payloadHash).toBe("a".repeat(64));
    expect(stored).not.toHaveProperty("payload");
  });

  it("returns in-progress for a same-digest concurrent retry", async () => {
    const service = new PublicWebhookDeliveryService(new MemoryPublicWebhookStore());
    await service.reserve(reservation());
    await expect(
      service.reserve(
        reservation({ leaseToken: "lease_token_0002", now: new Date(now.getTime() + 10_000) })
      )
    ).resolves.toMatchObject({ status: "in_progress", attempts: 1 });
  });

  it("rejects delivery identity reuse with a different digest", async () => {
    const service = new PublicWebhookDeliveryService(new MemoryPublicWebhookStore());
    await service.reserve(reservation());
    await expect(
      service.reserve(reservation({ payloadHash: "b".repeat(64) }))
    ).rejects.toBeInstanceOf(PublicWebhookReplayMismatchError);
  });

  it("reacquires an expired lease without creating another delivery", async () => {
    const store = new MemoryPublicWebhookStore();
    const service = new PublicWebhookDeliveryService(store);
    await service.reserve(reservation());
    const resumed = await service.reserve(
      reservation({
        now: new Date(now.getTime() + 61_000),
        leaseToken: "lease_token_0002",
        leaseExpiresAt: new Date(now.getTime() + 121_000),
      })
    );
    expect(resumed).toMatchObject({ status: "acquired", attempts: 2, resumed: true });
    expect(store.records.size).toBe(1);
  });

  it("records immutable run evidence and returns it for retries", async () => {
    const store = new MemoryPublicWebhookStore();
    const service = new PublicWebhookDeliveryService(store);
    const acquired = await service.reserve(reservation());
    if (acquired.status !== "acquired") throw new Error("Expected acquired delivery");
    const completedAt = new Date(now.getTime() + 500);
    await service.complete({
      storageId: acquired.storageId,
      leaseToken: acquired.leaseToken,
      runFriendlyId: "run_123",
      completedAt,
    });
    await expect(
      service.reserve(
        reservation({ now: new Date(now.getTime() + 1_000), leaseToken: "lease_token_0002" })
      )
    ).resolves.toEqual({
      status: "completed",
      storageId: acquired.storageId,
      attempts: 1,
      runFriendlyId: "run_123",
      completedAt,
    });
  });

  it("allows a later retry to resume a failed trigger attempt", async () => {
    const store = new MemoryPublicWebhookStore();
    const service = new PublicWebhookDeliveryService(store);
    const acquired = await service.reserve(reservation());
    if (acquired.status !== "acquired") throw new Error("Expected acquired delivery");
    await service.fail({
      storageId: acquired.storageId,
      leaseToken: acquired.leaseToken,
      failureCode: "trigger_unavailable",
      completedAt: new Date(now.getTime() + 500),
    });
    await expect(
      service.reserve(
        reservation({
          now: new Date(now.getTime() + 1_000),
          leaseToken: "lease_token_0002",
          leaseExpiresAt: new Date(now.getTime() + 61_000),
        })
      )
    ).resolves.toMatchObject({ status: "acquired", attempts: 2, resumed: true });
  });

  it("rejects stale and expired completion ownership", async () => {
    const service = new PublicWebhookDeliveryService(new MemoryPublicWebhookStore());
    const acquired = await service.reserve(reservation());
    if (acquired.status !== "acquired") throw new Error("Expected acquired delivery");
    await expect(
      service.complete({
        storageId: acquired.storageId,
        leaseToken: "lease_token_wrong",
        runFriendlyId: "run_123",
        completedAt: new Date(now.getTime() + 500),
      })
    ).rejects.toBeInstanceOf(PublicWebhookDeliveryConcurrencyError);
    await expect(
      service.complete({
        storageId: acquired.storageId,
        leaseToken: acquired.leaseToken,
        runFriendlyId: "run_123",
        completedAt: new Date(now.getTime() + 60_000),
      })
    ).rejects.toBeInstanceOf(PublicWebhookDeliveryConcurrencyError);
  });

  it("rejects malformed identities, digests, dates, and oversized leases", async () => {
    const service = new PublicWebhookDeliveryService(new MemoryPublicWebhookStore());
    await expect(service.reserve(reservation({ workflowId: "../bad" }))).rejects.toBeInstanceOf(
      PublicWebhookDeliveryValidationError
    );
    await expect(service.reserve(reservation({ payloadHash: "ABC" }))).rejects.toBeInstanceOf(
      PublicWebhookDeliveryValidationError
    );
    await expect(
      service.reserve(reservation({ leaseExpiresAt: new Date(now.getTime() + 300_001) }))
    ).rejects.toBeInstanceOf(PublicWebhookDeliveryValidationError);
  });
});
