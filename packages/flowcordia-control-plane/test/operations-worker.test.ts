import { afterEach, describe, expect, it, vi } from "vitest";

import { ProposalOperationsWorker } from "../src/index.js";

const emptyOutbox = { claimed: 0, published: 0, released: 0, leaseLost: 0 };
const emptyReconciliation = { claimed: 0, completed: 0, failed: 0, deferred: 0, leaseLost: 0 };

afterEach(() => vi.useRealTimers());

describe("ProposalOperationsWorker", () => {
  it("runs immediately, never overlaps cycles, and can be started idempotently", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const dispatchOnce = vi.fn(
      () => new Promise<typeof emptyOutbox>((resolve) => (release = () => resolve(emptyOutbox)))
    );
    const reconcileOnce = vi.fn(async () => emptyReconciliation);
    const worker = new ProposalOperationsWorker({
      outbox: { dispatchOnce },
      reconciliation: { reconcileOnce },
      intervalMs: 250,
    });

    worker.start();
    worker.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(dispatchOnce).toHaveBeenCalledTimes(1);
    expect(reconcileOnce).not.toHaveBeenCalled();
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(reconcileOnce).toHaveBeenCalledTimes(1);
    await worker.stop();
  });

  it("reports a cycle failure and continues on the next isolated interval", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const dispatchOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValue(emptyOutbox);
    const reconcileOnce = vi.fn(async () => emptyReconciliation);
    const worker = new ProposalOperationsWorker({
      outbox: { dispatchOnce },
      reconciliation: { reconcileOnce },
      intervalMs: 250,
      onError,
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(dispatchOnce).toHaveBeenCalledTimes(2);
    expect(reconcileOnce).toHaveBeenCalledTimes(1);
    await worker.stop();
  });

  it("aborts in-flight work during graceful shutdown", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const worker = new ProposalOperationsWorker({
      outbox: {
        dispatchOnce: async (signal) => {
          capturedSignal = signal;
          await new Promise<void>((_resolve, reject) =>
            signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
          );
          return emptyOutbox;
        },
      },
      reconciliation: { reconcileOnce: async () => emptyReconciliation },
      intervalMs: 250,
      shutdownGraceMs: 100,
    });
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    const stopped = worker.stop();
    await vi.advanceTimersByTimeAsync(0);
    await stopped;
    expect(capturedSignal?.aborted).toBe(true);
    expect(worker.started).toBe(false);
  });
});
