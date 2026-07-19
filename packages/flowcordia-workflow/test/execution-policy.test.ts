import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_MACHINE_PRESETS,
  isFlowcordiaMachinePreset,
  validateFlowcordiaExecutionPolicy,
} from "../src/index.js";

describe("Flowcordia execution policy contract", () => {
  it("publishes the exact supported machine presets", () => {
    expect(FLOWCORDIA_MACHINE_PRESETS).toEqual([
      "micro",
      "small-1x",
      "small-2x",
      "medium-1x",
      "medium-2x",
      "large-1x",
      "large-2x",
    ]);
    expect(isFlowcordiaMachinePreset("medium-1x")).toBe(true);
    expect(isFlowcordiaMachinePreset("future-8x")).toBe(false);
  });

  it("accepts the supported whole-workflow policy", () => {
    expect(
      validateFlowcordiaExecutionPolicy({
        queue: "orders/priority",
        machine: "large-1x",
        maxDurationSeconds: 900,
        retry: {
          maxAttempts: 5,
          minTimeoutMs: 1_000,
          maxTimeoutMs: 30_000,
          factor: 2.5,
        },
      })
    ).toEqual([]);
  });

  it("rejects every unsupported compiler binding", () => {
    expect(
      validateFlowcordiaExecutionPolicy({
        queue: "contains spaces",
        machine: "future-8x",
        maxDurationSeconds: 4,
        concurrencyKey: "customer.id",
        retry: {
          maxAttempts: 11,
          minTimeoutMs: 86_400_001,
          maxTimeoutMs: 1,
          factor: 10.1,
        },
      }).map((issue) => issue.code)
    ).toEqual([
      "invalid_queue",
      "unsupported_machine",
      "invalid_duration",
      "unsupported_concurrency",
      "invalid_attempts",
      "invalid_retry_timeout",
      "invalid_retry_factor",
      "invalid_retry_order",
    ]);
  });
});
