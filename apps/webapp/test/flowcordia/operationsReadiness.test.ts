import { describe, expect, it } from "vitest";
import {
  presentFlowcordiaOperationsHealth,
  type FlowcordiaOperationsMetrics,
} from "../../app/features/flowcordia/operations/contract";

const ready = {
  workerActive: true,
  workerHeartbeatAgeMs: 1_000,
  unpublishedOutboxCount: 0,
  oldestUnpublishedOutboxAgeMs: null,
  maximumOutboxAttempts: 0,
  expiredOutboxLocks: 0,
  pendingReconciliationCount: 0,
  oldestReconciliationDelayMs: null,
  maximumReconciliationAttempts: 0,
  expiredReconciliationLocks: 0,
  staleReconcilingProposalCount: 0,
  recentFailedProposalCount: 0,
  thresholds: {
    outboxAttentionAgeMs: 60_000,
    outboxBlockedAgeMs: 300_000,
    reconciliationAttentionAgeMs: 60_000,
    reconciliationBlockedAgeMs: 300_000,
  },
} satisfies FlowcordiaOperationsMetrics;

describe("Flowcordia operations readiness", () => {
  it("reports a bounded ready snapshot", () => {
    expect(
      presentFlowcordiaOperationsHealth({
        metrics: ready,
        checkedAt: new Date("2026-07-21T00:00:00.000Z"),
      })
    ).toEqual({
      state: "READY",
      message: "Flowcordia proposal operations are within the release objectives.",
      checkedAt: "2026-07-21T00:00:00.000Z",
      checks: [
        expect.objectContaining({ key: "worker", state: "READY", ageSeconds: 1 }),
        expect.objectContaining({ key: "outbox", state: "READY", count: 0, attempts: 0 }),
        expect.objectContaining({
          key: "reconciliation",
          state: "READY",
          count: 0,
          attempts: 0,
        }),
        expect.objectContaining({ key: "leases", state: "READY", count: 0 }),
        expect.objectContaining({ key: "proposals", state: "READY", count: 0 }),
      ],
    });
  });

  it("reports retries and recent terminal failures as attention", () => {
    const health = presentFlowcordiaOperationsHealth({
      metrics: {
        ...ready,
        unpublishedOutboxCount: 1,
        oldestUnpublishedOutboxAgeMs: 10_000,
        maximumOutboxAttempts: 2,
        recentFailedProposalCount: 1,
      },
      checkedAt: new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(health.state).toBe("ATTENTION");
    expect(health.checks.find((check) => check.key === "outbox")).toMatchObject({
      state: "ATTENTION",
      attempts: 2,
    });
    expect(health.checks.find((check) => check.key === "proposals")).toMatchObject({
      state: "ATTENTION",
      count: 1,
    });
  });

  it("blocks expired workers, overdue queues, expired leases, and stale reconciliation", () => {
    const health = presentFlowcordiaOperationsHealth({
      metrics: {
        ...ready,
        workerActive: false,
        workerHeartbeatAgeMs: 301_000,
        unpublishedOutboxCount: 3,
        oldestUnpublishedOutboxAgeMs: 301_000,
        expiredOutboxLocks: 1,
        pendingReconciliationCount: 2,
        oldestReconciliationDelayMs: 400_000,
        staleReconcilingProposalCount: 1,
      },
      checkedAt: new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(health.state).toBe("BLOCKED");
    expect(
      health.checks.filter((check) => check.state === "BLOCKED").map((check) => check.key)
    ).toEqual(["worker", "outbox", "reconciliation", "leases", "proposals"]);
  });

  it("rejects values that cannot be projected safely to the browser", () => {
    expect(() =>
      presentFlowcordiaOperationsHealth({
        metrics: { ...ready, unpublishedOutboxCount: Number.MAX_SAFE_INTEGER + 1 },
        checkedAt: new Date("2026-07-21T00:00:00.000Z"),
      })
    ).toThrow("Unpublished outbox count must be a non-negative safe integer.");
  });
});
