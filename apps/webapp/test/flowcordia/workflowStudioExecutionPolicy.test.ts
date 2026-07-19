import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioExecutionPolicy,
  createWorkflowStudioExecutionPolicyDraft,
  type WorkflowStudioExecutionPolicyDraft,
} from "../../app/features/flowcordia/workflows/studio/execution-policy";
import type { WorkflowStudioNode } from "../../app/features/flowcordia/workflows/studio/presentation";

function trigger(overrides: Partial<WorkflowStudioNode> = {}): WorkflowStudioNode {
  return {
    id: "manual_trigger",
    name: "Start",
    kind: "trigger",
    operation: "trigger.manual",
    ownership: "visual",
    position: { x: 0, y: 0 },
    configurationKeys: [],
    editableConfiguration: {},
    functionId: null,
    inputSchema: null,
    outputSchema: null,
    credentialReferences: [],
    runtime: null,
    codeReference: null,
    ...overrides,
  };
}

function build(
  overrides: Partial<Extract<WorkflowStudioExecutionPolicyDraft, { kind: "editable" }>> = {}
) {
  return buildWorkflowStudioExecutionPolicy({
    kind: "editable",
    queue: "",
    machine: "",
    maxDurationSeconds: "",
    retryEnabled: false,
    maxAttempts: "",
    minTimeoutMs: "",
    maxTimeoutMs: "",
    factor: "",
    ...overrides,
  });
}

describe("Flowcordia Studio execution policy", () => {
  it("hydrates supported whole-workflow policy without inventing defaults", () => {
    expect(
      createWorkflowStudioExecutionPolicyDraft(
        trigger({
          runtime: {
            queue: "orders/priority",
            concurrencyKey: null,
            machine: "medium-1x",
            maxDurationSeconds: 600,
            retry: {
              maxAttempts: 4,
              minTimeoutMs: 1_000,
              maxTimeoutMs: 10_000,
              factor: 2,
            },
          },
        })
      )
    ).toEqual({
      kind: "editable",
      queue: "orders/priority",
      machine: "medium-1x",
      maxDurationSeconds: "600",
      retryEnabled: true,
      maxAttempts: "4",
      minTimeoutMs: "1000",
      maxTimeoutMs: "10000",
      factor: "2",
    });
  });

  it("removes runtime policy when every field is empty", () => {
    expect(build()).toEqual({ success: true, runtime: null });
  });

  it("builds the exact supported runtime contract", () => {
    expect(
      build({
        queue: "orders/priority",
        machine: "large-1x",
        maxDurationSeconds: "900",
        retryEnabled: true,
        maxAttempts: "5",
        minTimeoutMs: "1000",
        maxTimeoutMs: "30000",
        factor: "2.5",
      })
    ).toEqual({
      success: true,
      runtime: {
        queue: "orders/priority",
        machine: "large-1x",
        maxDurationSeconds: 900,
        retry: {
          maxAttempts: 5,
          minTimeoutMs: 1000,
          maxTimeoutMs: 30000,
          factor: 2.5,
        },
      },
    });
  });

  it("enforces compiler queue, duration, attempt, timeout, and factor bounds", () => {
    expect(build({ queue: "contains spaces" })).toEqual({
      success: false,
      message:
        "Queue names must be 1–128 characters and use only letters, numbers, underscores, hyphens, or slashes.",
    });
    expect(build({ maxDurationSeconds: "4" })).toEqual({
      success: false,
      message: "Maximum duration must be a whole number between 5 and 2147483646.",
    });
    expect(build({ retryEnabled: true, maxAttempts: "11" })).toEqual({
      success: false,
      message: "Maximum attempts must be a whole number between 1 and 10.",
    });
    expect(build({ retryEnabled: true, minTimeoutMs: "86400001" })).toEqual({
      success: false,
      message: "Minimum retry delay must be a whole number between 0 and 86400000.",
    });
    expect(build({ retryEnabled: true, factor: "10.1" })).toEqual({
      success: false,
      message: "Retry factor must be a number between 1 and 10.",
    });
  });

  it("requires retry maximum delay to be no smaller than minimum delay", () => {
    expect(build({ retryEnabled: true, minTimeoutMs: "10000", maxTimeoutMs: "1000" })).toEqual({
      success: false,
      message: "Maximum retry delay must be greater than or equal to minimum retry delay.",
    });
  });

  it("fails closed for non-trigger, developer-owned, concurrency-key, and unknown-machine policy", () => {
    expect(createWorkflowStudioExecutionPolicyDraft(trigger({ kind: "action" }))).toMatchObject({
      kind: "blocked",
    });
    expect(
      createWorkflowStudioExecutionPolicyDraft(trigger({ ownership: "developer" }))
    ).toMatchObject({ kind: "blocked" });
    expect(
      createWorkflowStudioExecutionPolicyDraft(
        trigger({
          runtime: {
            queue: null,
            concurrencyKey: "customer.id",
            machine: null,
            maxDurationSeconds: null,
            retry: null,
          },
        })
      )
    ).toMatchObject({ kind: "blocked" });
    expect(
      createWorkflowStudioExecutionPolicyDraft(
        trigger({
          runtime: {
            queue: null,
            concurrencyKey: null,
            machine: "future-8x",
            maxDurationSeconds: null,
            retry: null,
          },
        })
      )
    ).toMatchObject({ kind: "blocked" });
  });

  it("keeps the execution policy editor trigger-scoped in Studio", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );

    expect(source).toContain("WorkflowStudioExecutionPolicyEditor");
    expect(source).toContain('node.kind === "trigger"');
    expect(source).toContain('type: "set_node_runtime"');
  });
});
