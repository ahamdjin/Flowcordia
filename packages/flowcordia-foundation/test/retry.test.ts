import { describe, expect, it, vi } from "vitest";
import { exponentialBackoff, halfToFullJitter, retryOperation } from "../src/index.js";

describe("Flowcordia retry foundation", () => {
  it("uses p-retry while preserving caller-owned policy and delay", async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const result = await retryOperation(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("transient");
        return "ok";
      },
      { maxAttempts: 3, delayFor: (_error, attempt) => attempt * 100, sleep }
    );
    expect(result).toBe("ok");
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("aborts immediately when policy rejects retry", async () => {
    const failure = new Error("permanent");
    await expect(
      retryOperation(async () => Promise.reject(failure), {
        maxAttempts: 3,
        delayFor: () => undefined,
        sleep: async () => undefined,
      })
    ).rejects.toBe(failure);
  });

  it("provides bounded backoff and jitter helpers", () => {
    expect(exponentialBackoff({ attempt: 4, baseDelayMs: 100, maxDelayMs: 500 })).toBe(500);
    expect(halfToFullJitter(1000, () => 0)).toBe(500);
    expect(halfToFullJitter(1000, () => 1)).toBe(1000);
  });
});
