import { hostname } from "node:os";
import { logger } from "~/services/logger.server";
import { getFlowcordiaProposalWorkerConfig } from "../../proposals/worker/config.server";
import { runOneWorkflowIndexSync } from "./service.server";

export class WorkflowIndexWorker {
  readonly #workerId: string;
  readonly #pollIntervalMs: number;
  readonly #leaseMs: number;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #cycle: Promise<void> | null = null;
  #stopping = false;

  constructor(input: { workerId: string; pollIntervalMs: number; leaseMs: number }) {
    this.#workerId = input.workerId;
    this.#pollIntervalMs = input.pollIntervalMs;
    this.#leaseMs = input.leaseMs;
  }

  start(): void {
    if (this.#timer || this.#cycle || this.#stopping) return;
    this.#schedule(0);
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    await this.#cycle;
  }

  #schedule(delay: number): void {
    if (this.#stopping) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#cycle = this.#run().finally(() => {
        this.#cycle = null;
        this.#schedule(this.#pollIntervalMs);
      });
    }, delay);
  }

  async #run(): Promise<void> {
    try {
      const result = await runOneWorkflowIndexSync({
        workerId: this.#workerId,
        leaseMs: this.#leaseMs,
      });
      if (result.status === "processed") {
        logger.info("Flowcordia workflow index sync completed", {
          syncId: result.syncId,
          ...result.result,
        });
      }
    } catch (error) {
      logger.error("Flowcordia workflow index cycle failed", { error });
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __flowcordiaWorkflowIndexWorker__: WorkflowIndexWorker | undefined;
}

function workerId(): string {
  const host = hostname()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 96);
  return `${host || "flowcordia"}:${process.pid}:workflow-index`;
}

export function getFlowcordiaWorkflowIndexWorker(): WorkflowIndexWorker | null {
  const config = getFlowcordiaProposalWorkerConfig();
  if (!config) return null;
  if (!global.__flowcordiaWorkflowIndexWorker__) {
    global.__flowcordiaWorkflowIndexWorker__ = new WorkflowIndexWorker({
      workerId: workerId(),
      pollIntervalMs: config.pollIntervalMs,
      leaseMs: config.reconciliationLeaseMs,
    });
  }
  return global.__flowcordiaWorkflowIndexWorker__;
}
