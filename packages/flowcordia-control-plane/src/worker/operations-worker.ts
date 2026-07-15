import type { OutboxDispatchReport } from "../outbox/dispatcher.js";
import type { ProposalReconciliationReport } from "../reconciliation/service.js";

export interface ProposalOperationsCycleReport {
  outbox: OutboxDispatchReport;
  reconciliation: ProposalReconciliationReport;
}

interface ProposalOperationsWorkerOptions {
  outbox: { dispatchOnce(signal?: AbortSignal): Promise<OutboxDispatchReport> };
  reconciliation: {
    reconcileOnce(signal?: AbortSignal): Promise<ProposalReconciliationReport>;
  };
  intervalMs?: number;
  shutdownGraceMs?: number;
  onCycle?: (report: ProposalOperationsCycleReport) => void;
  onError?: (error: unknown) => void;
}

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export class ProposalOperationsWorker {
  readonly #outbox: ProposalOperationsWorkerOptions["outbox"];
  readonly #reconciliation: ProposalOperationsWorkerOptions["reconciliation"];
  readonly #intervalMs: number;
  readonly #shutdownGraceMs: number;
  readonly #onCycle: (report: ProposalOperationsCycleReport) => void;
  readonly #onError: (error: unknown) => void;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #cycle: Promise<void> | undefined;
  #abortController: AbortController | undefined;
  #started = false;

  constructor(options: ProposalOperationsWorkerOptions) {
    if (!options?.outbox || typeof options.outbox.dispatchOnce !== "function") {
      throw new TypeError("Proposal operations worker requires an outbox dispatcher.");
    }
    if (!options.reconciliation || typeof options.reconciliation.reconcileOnce !== "function") {
      throw new TypeError("Proposal operations worker requires a reconciliation service.");
    }
    this.#outbox = options.outbox;
    this.#reconciliation = options.reconciliation;
    this.#intervalMs = boundedInteger(
      options.intervalMs ?? 5_000,
      "Worker interval",
      250,
      3_600_000
    );
    this.#shutdownGraceMs = boundedInteger(
      options.shutdownGraceMs ?? 30_000,
      "Worker shutdown grace",
      100,
      300_000
    );
    this.#onCycle = options.onCycle ?? (() => undefined);
    this.#onError = options.onError ?? (() => undefined);
  }

  get started(): boolean {
    return this.#started;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#abortController = new AbortController();
    this.#schedule(0);
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    this.#started = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#abortController?.abort(new Error("Proposal operations worker is stopping."));
    const cycle = this.#cycle;
    if (cycle) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          cycle.catch(() => undefined),
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, this.#shutdownGraceMs);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
    this.#abortController = undefined;
  }

  #schedule(delay: number): void {
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      const signal = this.#abortController?.signal;
      if (!this.#started || !signal) return;
      this.#cycle = this.#run(signal).finally(() => {
        this.#cycle = undefined;
        if (this.#started) this.#schedule(this.#intervalMs);
      });
    }, delay);
  }

  async #run(signal: AbortSignal): Promise<void> {
    try {
      const outbox = await this.#outbox.dispatchOnce(signal);
      signal.throwIfAborted();
      const reconciliation = await this.#reconciliation.reconcileOnce(signal);
      this.#onCycle({ outbox, reconciliation });
    } catch (error) {
      if (!signal.aborted) this.#onError(error);
    }
  }
}
