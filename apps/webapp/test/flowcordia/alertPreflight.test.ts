import { describe, expect, it, vi } from "vitest";
import {
  FLOWCORDIA_ALERT_CANARY_CONFIRMATION,
  presentFlowcordiaAlertChannelChecks,
  presentFlowcordiaAlertConfiguration,
  type FlowcordiaAlertChannelObservation,
} from "~/features/flowcordia/operations/alert-preflight";
import { runFlowcordiaAlertPreflight } from "~/features/flowcordia/operations/alert-preflight.server";
import { alertsWorkerRedisOptions } from "~/v3/alertsWorkerOptions.server";

const applicationCommitSha = "1234567890abcdef1234567890abcdef12345678";
const checkedAt = new Date("2026-07-22T00:00:00.000Z");

function readyEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    FLOWCORDIA_APPLICATION_COMMIT_SHA: applicationCommitSha,
    ALERTS_WORKER_ENABLED: "true",
    ALERTS_WORKER_REDIS_HOST: "redis.internal",
    ALERTS_WORKER_REDIS_PORT: "6379",
    ALERTS_WORKER_REDIS_TLS_DISABLED: "false",
    ALERTS_WORKER_CONCURRENCY_WORKERS: "1",
    ALERTS_WORKER_CONCURRENCY_TASKS_PER_WORKER: "10",
    ALERTS_WORKER_CONCURRENCY_LIMIT: "10",
    ALERTS_WORKER_POLL_INTERVAL: "1000",
    ALERTS_WORKER_SHUTDOWN_TIMEOUT_MS: "60000",
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    environment: readyEnvironment(),
    expectedApplicationCommitSha: applicationCommitSha,
    releaseId: "release-2026.07.22",
    projectRef: "proj_reference",
    channelRef: "alert_channel_reference",
    confirmation: FLOWCORDIA_ALERT_CANARY_CONFIRMATION,
    checkedAt,
    ...overrides,
  };
}

function readyObservation(
  overrides: Partial<FlowcordiaAlertChannelObservation> = {}
): FlowcordiaAlertChannelObservation {
  return {
    found: true,
    enabled: true,
    type: "WEBHOOK",
    productionCovered: true,
    failureCoverage: true,
    propertiesReady: true,
    integrationReady: true,
    pendingCount: 0,
    oldestPendingAgeMs: null,
    ...overrides,
  };
}

describe("Flowcordia alert readiness", () => {
  it("preserves disabled worker Redis defaults while live readiness still requires a host", () => {
    const workerOptions = alertsWorkerRedisOptions({});
    expect(workerOptions.host).toBeUndefined();
    expect(workerOptions.port).toBe(6379);
    expect(workerOptions.keyPrefix).toBe("alerts:worker:");
    expect(
      presentFlowcordiaAlertConfiguration(
        baseInput({
          environment: readyEnvironment({ ALERTS_WORKER_REDIS_HOST: undefined }),
        })
      ).state
    ).toBe("BLOCKED");
  });

  it("blocks before dependencies when configuration is incomplete", async () => {
    const verifyWorkerRedis = vi.fn();
    const observeChannel = vi.fn();
    const deliverCanary = vi.fn();
    const result = await runFlowcordiaAlertPreflight({
      ...baseInput({ environment: readyEnvironment({ ALERTS_WORKER_ENABLED: "false" }) }),
      dependencies: { verifyWorkerRedis, observeChannel, deliverCanary },
    });
    expect(result.state).toBe("BLOCKED");
    expect(result.phase).toBe("configuration");
    expect(verifyWorkerRedis).not.toHaveBeenCalled();
    expect(observeChannel).not.toHaveBeenCalled();
    expect(deliverCanary).not.toHaveBeenCalled();
  });

  it("stops before database and delivery when worker Redis is unavailable", async () => {
    const observeChannel = vi.fn();
    const deliverCanary = vi.fn();
    const result = await runFlowcordiaAlertPreflight({
      ...baseInput(),
      dependencies: {
        verifyWorkerRedis: vi.fn().mockRejectedValue(new Error("redis://secret")),
        observeChannel,
        deliverCanary,
      },
    });
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.phase).toBe("worker");
    expect(observeChannel).not.toHaveBeenCalled();
    expect(deliverCanary).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("redis://secret");
  });

  it("blocks delivery for stale or excessive pending alerts", async () => {
    const deliverCanary = vi.fn();
    const result = await runFlowcordiaAlertPreflight({
      ...baseInput({ maxPendingAlerts: 2, maxOldestPendingAgeMs: 60_000 }),
      dependencies: {
        verifyWorkerRedis: vi.fn().mockResolvedValue(undefined),
        observeChannel: vi.fn().mockResolvedValue({
          observation: readyObservation({ pendingCount: 3, oldestPendingAgeMs: 120_000 }),
          target: { type: "EMAIL", email: "private@example.com" },
        }),
        deliverCanary,
      },
    });
    expect(result.state).toBe("BLOCKED");
    expect(result.phase).toBe("channel");
    expect(deliverCanary).not.toHaveBeenCalled();
    expect(result.checks.find((entry) => entry.key === "backlog_health")?.state).toBe("BLOCKED");
  });

  it("reports a fixed unavailable delivery result without raw provider details", async () => {
    const result = await runFlowcordiaAlertPreflight({
      ...baseInput(),
      dependencies: {
        verifyWorkerRedis: vi.fn().mockResolvedValue(undefined),
        observeChannel: vi.fn().mockResolvedValue({
          observation: readyObservation({ type: "SLACK" }),
          target: {
            type: "SLACK",
            channelId: "C_PRIVATE",
            integration: { secret: "token" },
          } as never,
        }),
        deliverCanary: vi.fn().mockRejectedValue(new Error("xoxb-private-provider-token")),
      },
    });
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.phase).toBe("delivery");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("C_PRIVATE");
    expect(serialized).not.toContain("xoxb-private-provider-token");
  });

  it("returns bounded READY evidence and preserves call order", async () => {
    const order: string[] = [];
    const result = await runFlowcordiaAlertPreflight({
      ...baseInput(),
      dependencies: {
        verifyWorkerRedis: vi.fn(async () => {
          order.push("redis");
        }),
        observeChannel: vi.fn(async () => {
          order.push("channel");
          return {
            observation: readyObservation({ type: "WEBHOOK" }),
            target: {
              type: "WEBHOOK",
              webhook: {
                url: "https://private.example.com/hooks/secret",
                secret: { encrypted: "secret" },
                version: "v2",
              },
            } as never,
          };
        }),
        deliverCanary: vi.fn(async () => {
          order.push("delivery");
        }),
      },
    });
    expect(order).toEqual(["redis", "channel", "delivery"]);
    expect(result.state).toBe("READY");
    expect(result.phase).toBe("complete");
    expect(result.channelType).toBe("WEBHOOK");
    expect(result.backlog).toEqual({ pendingCount: 0, oldestPendingAgeMs: null });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("private.example.com");
    expect(serialized).not.toContain("alert_channel_reference");
    expect(serialized).not.toContain("proj_reference");
  });

  it("requires exact deployed identity, confirmation, targets, and bounded policy", () => {
    expect(presentFlowcordiaAlertConfiguration(baseInput()).state).toBe("READY");
    expect(
      presentFlowcordiaAlertConfiguration(
        baseInput({ expectedApplicationCommitSha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" })
      ).state
    ).toBe("BLOCKED");
    expect(presentFlowcordiaAlertConfiguration(baseInput({ confirmation: "WRONG" })).state).toBe(
      "BLOCKED"
    );
    expect(
      presentFlowcordiaAlertConfiguration(baseInput({ channelRef: "../../unsafe" })).state
    ).toBe("BLOCKED");
    expect(presentFlowcordiaAlertConfiguration(baseInput({ maxOldestPendingAgeMs: 1 })).state).toBe(
      "BLOCKED"
    );
  });

  it("requires production, failure, property, integration, and backlog readiness", () => {
    const checks = presentFlowcordiaAlertChannelChecks({
      observation: readyObservation({
        productionCovered: false,
        failureCoverage: false,
        propertiesReady: false,
        integrationReady: false,
        pendingCount: 101,
        oldestPendingAgeMs: 600_000,
      }),
      maxPendingAlerts: 100,
      maxOldestPendingAgeMs: 300_000,
    });
    expect(checks.find((entry) => entry.key === "channel_selection")?.state).toBe("READY");
    for (const key of [
      "production_coverage",
      "failure_coverage",
      "channel_configuration",
      "backlog_health",
    ] as const) {
      expect(checks.find((entry) => entry.key === key)?.state).toBe("BLOCKED");
    }
  });
});
