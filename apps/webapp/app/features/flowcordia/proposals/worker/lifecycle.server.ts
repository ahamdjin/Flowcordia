import { env } from "~/env.server";
import { logger } from "~/services/logger.server";
import { signalsEmitter } from "~/services/signals.server";
import { getFlowcordiaWorkflowIndexWorker } from "../../workflows/index/worker.server";
import { createFlowcordiaOperationsHeartbeat } from "./heartbeat.server";
import { createFlowcordiaOperationsLocalHealth } from "./local-health.server";
import { getFlowcordiaProposalWorkerConfig } from "./config.server";
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
    const proposalWorker = getFlowcordiaProposalOperationsWorker();
    const workflowIndexWorker = getFlowcordiaWorkflowIndexWorker();
    const config = getFlowcordiaProposalWorkerConfig();
    if (
      !proposalWorker ||
      !workflowIndexWorker ||
      !config ||
      global.__flowcordiaProposalOperationsShutdownRegistered__
    ) {
      return;
    }

    const heartbeat = createFlowcordiaOperationsHeartbeat(config);
    const localHealth = createFlowcordiaOperationsLocalHealth({
      applicationCommitSha: env.FLOWCORDIA_APPLICATION_COMMIT_SHA ?? "",
    });
    const stop = () => {
      localHealth.stop();
      Promise.all([proposalWorker.stop(), workflowIndexWorker.stop(), heartbeat.stop()]).catch(
        (error) => {
          logger.error("Failed to stop Flowcordia operations workers", { error });
        }
      );
    };

    signalsEmitter.on("SIGTERM", stop);
    signalsEmitter.on("SIGINT", stop);
    global.__flowcordiaProposalOperationsShutdownRegistered__ = true;
    proposalWorker.start();
    workflowIndexWorker.start();
    heartbeat.start();
    localHealth.start();
    logger.info("Flowcordia proposal and workflow index operations workers started");
  } catch (error) {
    // An explicitly enabled worker with invalid security/lease configuration is
    // a deployment error. Fail boot so an orchestrator can roll back safely.
    logger.error("Flowcordia operations worker misconfiguration — failing loud", {
      error,
    });
    throw error;
  }
}
