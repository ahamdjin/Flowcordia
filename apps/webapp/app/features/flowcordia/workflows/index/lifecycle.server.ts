import { env } from "~/env.server";
import { logger } from "~/services/logger.server";
import { signalsEmitter } from "~/services/signals.server";
import { getFlowcordiaWorkflowIndexWorker } from "./worker.server";

declare global {
  // eslint-disable-next-line no-var
  var __flowcordiaWorkflowIndexShutdownRegistered__: boolean | undefined;
}

/**
 * Uses the existing Flowcordia proposal-operations deployment switch. When dark,
 * no worker, database claim, or GitHub client is constructed.
 */
export function initFlowcordiaWorkflowIndexWorker(): void {
  if (env.FLOWCORDIA_PROPOSAL_WORKER_ENABLED !== "1") return;
  try {
    const worker = getFlowcordiaWorkflowIndexWorker();
    if (!worker || global.__flowcordiaWorkflowIndexShutdownRegistered__) return;
    const stop = () => {
      worker.stop().catch((error) => {
        logger.error("Failed to stop Flowcordia workflow index worker", { error });
      });
    };
    signalsEmitter.on("SIGTERM", stop);
    signalsEmitter.on("SIGINT", stop);
    global.__flowcordiaWorkflowIndexShutdownRegistered__ = true;
    worker.start();
    logger.info("Flowcordia workflow index worker started");
  } catch (error) {
    logger.error("Flowcordia workflow index worker misconfiguration — failing loud", { error });
    throw error;
  }
}
