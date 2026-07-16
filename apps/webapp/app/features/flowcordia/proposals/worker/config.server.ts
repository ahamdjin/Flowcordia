import { env } from "~/env.server";

export interface FlowcordiaProposalWorkerConfig {
  eventUrl: string;
  eventSecret: string;
  pollIntervalMs: number;
  shutdownGraceMs: number;
  eventTimeoutMs: number;
  outboxBatchSize: number;
  outboxLeaseMs: number;
  reconciliationBatchSize: number;
  reconciliationLeaseMs: number;
  reconciliationStaleMs: number;
  reconciliationRefreshMs: number;
  githubTimeoutMs: number;
}

/**
 * Returns null before touching secrets when the independently deployed worker is dark.
 * Cross-field safety (required GitHub App, secrets, and lease budgets) is enforced by
 * env.server.ts during process boot.
 */
export function getFlowcordiaProposalWorkerConfig(): FlowcordiaProposalWorkerConfig | null {
  if (env.FLOWCORDIA_PROPOSAL_WORKER_ENABLED !== "1") return null;
  if (!env.FLOWCORDIA_PROPOSAL_EVENT_URL || !env.FLOWCORDIA_PROPOSAL_EVENT_SECRET) {
    throw new FlowcordiaProposalWorkerConfigurationError(
      "Flowcordia proposal worker event delivery is not configured."
    );
  }
  return {
    eventUrl: env.FLOWCORDIA_PROPOSAL_EVENT_URL,
    eventSecret: env.FLOWCORDIA_PROPOSAL_EVENT_SECRET,
    pollIntervalMs: env.FLOWCORDIA_PROPOSAL_WORKER_POLL_INTERVAL_MS,
    shutdownGraceMs: env.FLOWCORDIA_PROPOSAL_WORKER_SHUTDOWN_GRACE_MS,
    eventTimeoutMs: env.FLOWCORDIA_PROPOSAL_EVENT_TIMEOUT_MS,
    outboxBatchSize: env.FLOWCORDIA_PROPOSAL_OUTBOX_BATCH_SIZE,
    outboxLeaseMs: env.FLOWCORDIA_PROPOSAL_OUTBOX_LEASE_MS,
    reconciliationBatchSize: env.FLOWCORDIA_PROPOSAL_RECONCILIATION_BATCH_SIZE,
    reconciliationLeaseMs: env.FLOWCORDIA_PROPOSAL_RECONCILIATION_LEASE_MS,
    reconciliationStaleMs: env.FLOWCORDIA_PROPOSAL_RECONCILIATION_STALE_MS,
    reconciliationRefreshMs: env.FLOWCORDIA_PROPOSAL_RECONCILIATION_REFRESH_MS,
    githubTimeoutMs: env.FLOWCORDIA_PROPOSAL_GITHUB_TIMEOUT_MS,
  };
}

export class FlowcordiaProposalWorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowcordiaProposalWorkerConfigurationError";
  }
}
