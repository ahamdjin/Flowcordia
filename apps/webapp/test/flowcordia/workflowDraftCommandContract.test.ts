import { describe, expect, it } from "vitest";
import {
  WorkflowRuntimePolicyCommand,
  WorkflowStudioTemplateIdCommand,
} from "../../app/features/flowcordia/workflows/drafts/command-contract";

describe("Flowcordia workflow draft command contract", () => {
  it("accepts every first-party Studio template including authenticated API triggers", () => {
    expect(
      [
        "manual_trigger",
        "api_trigger",
        "schedule_trigger",
        "webhook_trigger",
        "http_action",
        "condition",
        "wait",
        "code_task",
        "output",
      ].every((templateId) => WorkflowStudioTemplateIdCommand.safeParse(templateId).success)
    ).toBe(true);
  });

  it("accepts the exact supported execution policy", () => {
    expect(
      WorkflowRuntimePolicyCommand.parse({
        queue: "orders/priority",
        machine: "medium-1x",
        maxDurationSeconds: 900,
        retry: {
          maxAttempts: 5,
          minTimeoutMs: 1_000,
          maxTimeoutMs: 30_000,
          factor: 2,
        },
      })
    ).toEqual({
      queue: "orders/priority",
      machine: "medium-1x",
      maxDurationSeconds: 900,
      retry: {
        maxAttempts: 5,
        minTimeoutMs: 1_000,
        maxTimeoutMs: 30_000,
        factor: 2,
      },
    });
  });

  it("rejects concurrency keys, unsupported machines, invalid bounds, and unknown fields", () => {
    for (const candidate of [
      { concurrencyKey: "customer.id" },
      { machine: "future-8x" },
      { queue: "contains spaces" },
      { maxDurationSeconds: 4 },
      { retry: { maxAttempts: 11 } },
      { retry: { minTimeoutMs: 10_000, maxTimeoutMs: 1_000 } },
      { retry: { factor: 11 } },
      { unexpected: true },
    ]) {
      expect(WorkflowRuntimePolicyCommand.safeParse(candidate).success).toBe(false);
    }
  });
});
