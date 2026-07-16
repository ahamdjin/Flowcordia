import { env } from "~/env.server";
import { logger } from "~/services/logger.server";
import { signalsEmitter } from "~/services/signals.server";
import { getFlowcordiaProposalOperationsWorker } from "./runtime.server";

declare global {
  // eslint-disable-next-line no-var
  var __flowcordiaProposalOperationsShutdownRegistered__: boolean | undefined;
}

/**
 * Additive web-process bootstrap for self-hosters. The feature flag is checked
 * before worker construction, so the default path performs no database, GitHub,
 * or event-endpoint work and cannot alter the existing worker fleets.
 */
export function initFlowcordiaProposalOperationsWorker(): void {
  if (env.FLOWCORDIA_PROPOSAL_WORKER_ENABLED !== "1") return;
  try {
    const worker = getFlowcordiaProposalOperationsWorker();
    if (!worker || global.__flowcordiaProposalOperationsShutdownRegistered__) return;
    const stop = () => {
      worker.stop().catch((error) => {
        logger.error("Failed to stop Flowcordia proposal operations worker", { error });
      });
    };
    signalsEmitter.on("SIGTERM", stop);
    signalsEmitter.on("SIGINT", stop);
    global.__flowcordiaProposalOperationsShutdownRegistered__ = true;
    worker.start();
    logger.info("Flowcordia proposal operations worker started");
  } catch (error) {
    // An explicitly enabled worker with invalid security/lease configuration is
    // a deployment error. Fail boot so an orchestrator can roll back safely.
    logger.error("Flowcordia proposal operations worker misconfiguration — failing loud", {
      error,
    });
    throw error;
  }
}
