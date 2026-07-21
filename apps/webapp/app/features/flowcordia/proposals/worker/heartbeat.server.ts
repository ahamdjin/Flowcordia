import type { PrismaClientOrTransaction } from "~/db.server";
import { prisma } from "~/db.server";
import { logger } from "~/services/logger.server";
import type { FlowcordiaProposalWorkerConfig } from "./config.server";
import { flowcordiaOperationsHeartbeatTiming } from "./heartbeat";

export const FLOWCORDIA_OPERATIONS_WORKER_NAME = "proposal-operations";

export async function recordFlowcordiaOperationsWorkerHeartbeat(
  input: {
    now: Date;
    healthyWindowMs: number;
    config: Pick<
      FlowcordiaProposalWorkerConfig,
      "pollIntervalMs" | "reconciliationRefreshMs" | "reconciliationStaleMs"
    >;
  },
  database: PrismaClientOrTransaction = prisma
): Promise<void> {
  if (Number.isNaN(input.now.getTime())) {
    throw new TypeError("Flowcordia worker heartbeat time is invalid.");
  }
  if (!Number.isSafeInteger(input.healthyWindowMs) || input.healthyWindowMs < 1_000) {
    throw new TypeError("Flowcordia worker heartbeat health window is invalid.");
  }
  await database.flowcordiaOperationsWorkerHeartbeat.upsert({
    where: { workerName: FLOWCORDIA_OPERATIONS_WORKER_NAME },
    update: {
      observedAt: input.now,
      healthyUntil: new Date(input.now.getTime() + input.healthyWindowMs),
      pollIntervalMs: input.config.pollIntervalMs,
      reconciliationRefreshMs: input.config.reconciliationRefreshMs,
      reconciliationStaleMs: input.config.reconciliationStaleMs,
    },
    create: {
      workerName: FLOWCORDIA_OPERATIONS_WORKER_NAME,
      observedAt: input.now,
      healthyUntil: new Date(input.now.getTime() + input.healthyWindowMs),
      pollIntervalMs: input.config.pollIntervalMs,
      reconciliationRefreshMs: input.config.reconciliationRefreshMs,
      reconciliationStaleMs: input.config.reconciliationStaleMs,
    },
  });
}

export interface FlowcordiaOperationsHeartbeat {
  start(): void;
  stop(): Promise<void>;
}

export function createFlowcordiaOperationsHeartbeat(
  config: FlowcordiaProposalWorkerConfig
): FlowcordiaOperationsHeartbeat {
  const timing = flowcordiaOperationsHeartbeatTiming(config.pollIntervalMs);
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeWrite: Promise<void> | undefined;

  const schedule = (delayMs: number) => {
    timer = setTimeout(() => {
      timer = undefined;
      if (!started) return;
      const now = new Date();
      activeWrite = recordFlowcordiaOperationsWorkerHeartbeat({
        now,
        healthyWindowMs: timing.healthyWindowMs,
        config,
      })
        .catch((error) => {
          logger.error("Failed to persist Flowcordia operations worker heartbeat", { error });
        })
        .finally(() => {
          activeWrite = undefined;
          if (started) schedule(timing.heartbeatIntervalMs);
        });
    }, delayMs);
  };

  return {
    start() {
      if (started) return;
      started = true;
      schedule(0);
    },
    async stop() {
      if (!started) return;
      started = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await activeWrite;
    },
  };
}
