import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

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

  it("keeps scope, raw operations rows, and worker secrets behind the server boundary", () => {
    const query = source("../../app/features/flowcordia/operations/query.server.ts");
    const command = source("../../app/features/flowcordia/operations/commands.server.ts");
    const panel = source(
      "../../app/features/flowcordia/operations/FlowcordiaOperationsHealthPanel.tsx"
    );
    const resource = source(
      "../../app/routes/resources.orgs.$organizationSlug.projects.$projectParam.flowcordia.operations-health/route.ts"
    );
    const studio = source(
      "../../app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.workflows/route.tsx"
    );
    expect(query).toContain('event."organizationId" = ${input.scope.tenantId}');
    expect(query).toContain('proposal."projectId" = ${input.scope.projectId}');
    expect(query).toContain('proposal."repositoryId" = ${input.scope.repositoryId}');
    expect(command).toContain("requireFlowcordiaProjectContext");
    expect(resource).toContain('authorization: { action: "read", resource: { type: "github" } }');
    expect(resource).toContain("canAccessFlowcordiaStudio");
    expect(panel).not.toMatch(
      /eventSecret|eventUrl|tenantId|projectId|repositoryId|lockToken|workerId|lastError/
    );
    expect(studio.indexOf("<FlowcordiaOperationsHealthPanel")).toBeGreaterThan(
      studio.indexOf('hidden={selectedLifecycleStep !== "production"}')
    );
  });
});
