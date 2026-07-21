import { postgresTest } from "@internal/testcontainers";
import { describe, expect, vi } from "vitest";
import {
  FLOWCORDIA_OPERATIONS_WORKER_NAME,
  recordFlowcordiaOperationsWorkerHeartbeat,
} from "../../app/features/flowcordia/proposals/worker/heartbeat.server";

vi.setConfig({ testTimeout: 120_000 });

describe("Flowcordia operations worker heartbeat persistence", () => {
  postgresTest(
    "refreshes one shared heartbeat without persisting worker identity",
    async ({ prisma }) => {
      const first = new Date("2026-07-21T00:00:00.000Z");
      const second = new Date("2026-07-21T00:00:15.000Z");
      await recordFlowcordiaOperationsWorkerHeartbeat(
        {
          now: first,
          healthyWindowMs: 30_000,
          config: {
            pollIntervalMs: 5_000,
            reconciliationRefreshMs: 900_000,
            reconciliationStaleMs: 300_000,
          },
        },
        prisma
      );
      await recordFlowcordiaOperationsWorkerHeartbeat(
        {
          now: second,
          healthyWindowMs: 45_000,
          config: {
            pollIntervalMs: 10_000,
            reconciliationRefreshMs: 600_000,
            reconciliationStaleMs: 240_000,
          },
        },
        prisma
      );

      await expect(prisma.flowcordiaOperationsWorkerHeartbeat.count()).resolves.toBe(1);
      await expect(
        prisma.flowcordiaOperationsWorkerHeartbeat.findUniqueOrThrow({
          where: { workerName: FLOWCORDIA_OPERATIONS_WORKER_NAME },
          select: {
            workerName: true,
            observedAt: true,
            healthyUntil: true,
            pollIntervalMs: true,
            reconciliationRefreshMs: true,
            reconciliationStaleMs: true,
          },
        })
      ).resolves.toEqual({
        workerName: FLOWCORDIA_OPERATIONS_WORKER_NAME,
        observedAt: second,
        healthyUntil: new Date("2026-07-21T00:01:00.000Z"),
        pollIntervalMs: 10_000,
        reconciliationRefreshMs: 600_000,
        reconciliationStaleMs: 240_000,
      });
    }
  );
});
