import type { LeasedOutboxEvent, ProposalStore } from "../types.js";

export interface OutboxPublisher {
  publish(event: LeasedOutboxEvent): Promise<void>;
}

export interface OutboxDispatchReport {
  claimed: number;
  published: number;
  released: number;
  leaseLost: number;
}

interface OutboxDispatcherOptions {
  store: ProposalStore;
  publisher: OutboxPublisher;
  workerId: string;
  createLockToken: () => string;
  now?: () => Date;
  batchSize?: number;
  leaseMs?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
  random?: () => number;
}

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Outbox publisher failed.";
  const clean = message.replace(/[\r\n\t]+/g, " ").trim();
  return clean.length <= 500 ? clean : `${clean.slice(0, 497)}...`;
}

export class OutboxDispatcher {
  readonly #store: ProposalStore;
  readonly #publisher: OutboxPublisher;
  readonly #workerId: string;
  readonly #createLockToken: () => string;
  readonly #now: () => Date;
  readonly #batchSize: number;
  readonly #leaseMs: number;
  readonly #baseRetryMs: number;
  readonly #maxRetryMs: number;
  readonly #random: () => number;

  constructor(options: OutboxDispatcherOptions) {
    if (!options?.store || typeof options.store.claimOutbox !== "function") {
      throw new TypeError("Outbox dispatcher requires a store.");
    }
    if (!options.publisher || typeof options.publisher.publish !== "function") {
      throw new TypeError("Outbox dispatcher requires a publisher.");
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.workerId ?? "")) {
      throw new TypeError("Outbox worker ID has an invalid format.");
    }
    if (typeof options.createLockToken !== "function") {
      throw new TypeError("Outbox dispatcher requires a lock-token factory.");
    }
    this.#store = options.store;
    this.#publisher = options.publisher;
    this.#workerId = options.workerId;
    this.#createLockToken = options.createLockToken;
    this.#now = options.now ?? (() => new Date());
    this.#batchSize = boundedInteger(options.batchSize ?? 50, "Outbox batch size", 1, 500);
    this.#leaseMs = boundedInteger(options.leaseMs ?? 60_000, "Outbox lease", 1_000, 900_000);
    this.#baseRetryMs = boundedInteger(
      options.baseRetryMs ?? 1_000,
      "Outbox base retry",
      100,
      3_600_000
    );
    this.#maxRetryMs = boundedInteger(
      options.maxRetryMs ?? 300_000,
      "Outbox maximum retry",
      this.#baseRetryMs,
      86_400_000
    );
    this.#random = options.random ?? Math.random;
  }

  async dispatchOnce(): Promise<OutboxDispatchReport> {
    const now = this.#now();
    const lockToken = this.#createLockToken();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/.test(lockToken)) {
      throw new TypeError("Outbox lock token has an invalid format.");
    }
    const events = await this.#store.claimOutbox({
      workerId: this.#workerId,
      lockToken,
      limit: this.#batchSize,
      now,
      lockExpiresAt: new Date(now.getTime() + this.#leaseMs),
    });
    const report: OutboxDispatchReport = {
      claimed: events.length,
      published: 0,
      released: 0,
      leaseLost: 0,
    };

    for (const event of events) {
      try {
        await this.#publisher.publish(event);
        const acknowledged = await this.#store.acknowledgeOutbox({
          id: event.id,
          lockToken: event.lockToken,
          publishedAt: this.#now(),
        });
        if (acknowledged) report.published += 1;
        else report.leaseLost += 1;
      } catch (error) {
        const exponent = Math.min(Math.max(0, event.attempts - 1), 20);
        const ceiling = Math.min(this.#maxRetryMs, this.#baseRetryMs * 2 ** exponent);
        const jittered = Math.max(
          this.#baseRetryMs,
          Math.floor(ceiling * (0.5 + this.#random() * 0.5))
        );
        const released = await this.#store.releaseOutbox({
          id: event.id,
          lockToken: event.lockToken,
          availableAt: new Date(this.#now().getTime() + jittered),
          lastError: safeError(error),
        });
        if (released) report.released += 1;
        else report.leaseLost += 1;
      }
    }
    return report;
  }
}
