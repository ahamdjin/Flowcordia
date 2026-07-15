import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  HttpOutboxPublisher,
  OutboxDispatcher,
  ProposalOperationsWorker,
  ProposalReconciliationService,
} from "@flowcordia/control-plane";
import { logger } from "~/services/logger.server";
import { flowcordiaProposalStore } from "../prisma.server";
import { getFlowcordiaProposalWorkerConfig } from "./config.server";
import { AppGitHubProposalReconciliationGateway } from "./github-reconciliation.server";

declare global {
  // eslint-disable-next-line no-var
  var __flowcordiaProposalOperationsWorker__: ProposalOperationsWorker | undefined;
}

function workerId(): string {
  const host = hostname()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 96);
  return `${host || "flowcordia"}:${process.pid}`;
}

export function getFlowcordiaProposalOperationsWorker(): ProposalOperationsWorker | null {
  const config = getFlowcordiaProposalWorkerConfig();
  if (!config) return null;
  if (global.__flowcordiaProposalOperationsWorker__) {
    return global.__flowcordiaProposalOperationsWorker__;
  }
  const identity = workerId();
  const createLockToken = () => randomUUID();
  const worker = new ProposalOperationsWorker({
    outbox: new OutboxDispatcher({
      store: flowcordiaProposalStore,
      publisher: new HttpOutboxPublisher({
        url: config.eventUrl,
        secret: config.eventSecret,
        timeoutMs: config.eventTimeoutMs,
      }),
      workerId: identity,
      createLockToken,
      batchSize: config.outboxBatchSize,
      leaseMs: config.outboxLeaseMs,
    }),
    reconciliation: new ProposalReconciliationService({
      store: flowcordiaProposalStore,
      gateway: new AppGitHubProposalReconciliationGateway(config.githubTimeoutMs),
      workerId: identity,
      createLockToken,
      batchSize: config.reconciliationBatchSize,
      leaseMs: config.reconciliationLeaseMs,
      staleAfterMs: config.reconciliationStaleMs,
      refreshIntervalMs: config.reconciliationRefreshMs,
    }),
    intervalMs: config.pollIntervalMs,
    shutdownGraceMs: config.shutdownGraceMs,
    onCycle: (report) => {
      if (report.outbox.claimed > 0 || report.reconciliation.claimed > 0) {
        logger.info("Flowcordia proposal operations cycle completed", { report });
      }
    },
    onError: (error) => {
      logger.error("Flowcordia proposal operations cycle failed", { error });
    },
  });
  global.__flowcordiaProposalOperationsWorker__ = worker;
  return worker;
}
