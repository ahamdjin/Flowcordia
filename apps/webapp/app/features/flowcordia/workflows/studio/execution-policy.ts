import {
  FLOWCORDIA_MACHINE_PRESETS,
  FLOWCORDIA_MAX_DURATION_SECONDS,
  FLOWCORDIA_MAX_RETRY_ATTEMPTS,
  FLOWCORDIA_MAX_RETRY_FACTOR,
  FLOWCORDIA_MAX_RETRY_TIMEOUT_MS,
  FLOWCORDIA_QUEUE_PATTERN,
  isFlowcordiaMachinePreset,
  type WorkflowRuntimePolicy,
} from "@flowcordia/workflow";
import type { WorkflowStudioNode } from "./presentation";

export { FLOWCORDIA_MACHINE_PRESETS };

export type WorkflowStudioExecutionPolicyDraft =
  | {
      kind: "editable";
      queue: string;
      machine: "" | (typeof FLOWCORDIA_MACHINE_PRESETS)[number];
      maxDurationSeconds: string;
      retryEnabled: boolean;
      maxAttempts: string;
      minTimeoutMs: string;
      maxTimeoutMs: string;
      factor: string;
    }
  | { kind: "blocked"; message: string };

export type WorkflowStudioExecutionPolicyResult =
  | { success: true; runtime: WorkflowRuntimePolicy | null }
  | { success: false; message: string };

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function parseOptionalNumber(
  value: string,
  label: string,
  options: { integer?: boolean; minimum: number; maximum: number }
): { success: true; value: number | undefined } | { success: false; message: string } {
  if (value.trim() === "") return { success: true, value: undefined };
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    (options.integer && !Number.isInteger(parsed)) ||
    parsed < options.minimum ||
    parsed > options.maximum
  ) {
    const type = options.integer ? "whole number" : "number";
    return {
      success: false,
      message: `${label} must be a ${type} between ${options.minimum} and ${options.maximum}.`,
    };
  }
  return { success: true, value: parsed };
}

export function createWorkflowStudioExecutionPolicyDraft(
  node: WorkflowStudioNode
): WorkflowStudioExecutionPolicyDraft {
  if (node.kind !== "trigger") {
    return {
      kind: "blocked",
      message: "Execution policy belongs to the workflow trigger and applies to the whole run.",
    };
  }
  if (node.ownership !== "visual") {
    return {
      kind: "blocked",
      message: "Developer-owned trigger policy must be changed in the repository.",
    };
  }
  if (node.runtime?.concurrencyKey) {
    return {
      kind: "blocked",
      message:
        "This trigger declares a concurrency key that generated tasks cannot bind safely. Remove it in code before editing execution policy in Studio.",
    };
  }

  let machine: Extract<WorkflowStudioExecutionPolicyDraft, { kind: "editable" }>["machine"] = "";
  if (node.runtime?.machine) {
    if (!isFlowcordiaMachinePreset(node.runtime.machine)) {
      return {
        kind: "blocked",
        message: `Machine preset "${node.runtime.machine}" is not supported by the generated runtime contract.`,
      };
    }
    machine = node.runtime.machine;
  }

  return {
    kind: "editable",
    queue: node.runtime?.queue ?? "",
    machine,
    maxDurationSeconds: numberText(node.runtime?.maxDurationSeconds),
    retryEnabled: node.runtime?.retry !== null && node.runtime?.retry !== undefined,
    maxAttempts: numberText(node.runtime?.retry?.maxAttempts),
    minTimeoutMs: numberText(node.runtime?.retry?.minTimeoutMs),
    maxTimeoutMs: numberText(node.runtime?.retry?.maxTimeoutMs),
    factor: numberText(node.runtime?.retry?.factor),
  };
}

export function buildWorkflowStudioExecutionPolicy(
  draft: WorkflowStudioExecutionPolicyDraft
): WorkflowStudioExecutionPolicyResult {
  if (draft.kind === "blocked") return { success: false, message: draft.message };

  const queue = draft.queue.trim();
  if (queue && !FLOWCORDIA_QUEUE_PATTERN.test(queue)) {
    return {
      success: false,
      message:
        "Queue names must be 1–128 characters and use only letters, numbers, underscores, hyphens, or slashes.",
    };
  }

  const duration = parseOptionalNumber(draft.maxDurationSeconds, "Maximum duration", {
    integer: true,
    minimum: 5,
    maximum: FLOWCORDIA_MAX_DURATION_SECONDS,
  });
  if (!duration.success) return duration;

  let retry: WorkflowRuntimePolicy["retry"] | undefined;
  if (draft.retryEnabled) {
    const maxAttempts = parseOptionalNumber(draft.maxAttempts, "Maximum attempts", {
      integer: true,
      minimum: 1,
      maximum: FLOWCORDIA_MAX_RETRY_ATTEMPTS,
    });
    if (!maxAttempts.success) return maxAttempts;
    const minTimeoutMs = parseOptionalNumber(draft.minTimeoutMs, "Minimum retry delay", {
      integer: true,
      minimum: 0,
      maximum: FLOWCORDIA_MAX_RETRY_TIMEOUT_MS,
    });
    if (!minTimeoutMs.success) return minTimeoutMs;
    const maxTimeoutMs = parseOptionalNumber(draft.maxTimeoutMs, "Maximum retry delay", {
      integer: true,
      minimum: 0,
      maximum: FLOWCORDIA_MAX_RETRY_TIMEOUT_MS,
    });
    if (!maxTimeoutMs.success) return maxTimeoutMs;
    const factor = parseOptionalNumber(draft.factor, "Retry factor", {
      minimum: 1,
      maximum: FLOWCORDIA_MAX_RETRY_FACTOR,
    });
    if (!factor.success) return factor;
    if (
      minTimeoutMs.value !== undefined &&
      maxTimeoutMs.value !== undefined &&
      maxTimeoutMs.value < minTimeoutMs.value
    ) {
      return {
        success: false,
        message: "Maximum retry delay must be greater than or equal to minimum retry delay.",
      };
    }
    retry = {
      ...(maxAttempts.value !== undefined ? { maxAttempts: maxAttempts.value } : {}),
      ...(minTimeoutMs.value !== undefined ? { minTimeoutMs: minTimeoutMs.value } : {}),
      ...(maxTimeoutMs.value !== undefined ? { maxTimeoutMs: maxTimeoutMs.value } : {}),
      ...(factor.value !== undefined ? { factor: factor.value } : {}),
    };
  }

  const runtime: WorkflowRuntimePolicy = {
    ...(queue ? { queue } : {}),
    ...(draft.machine ? { machine: draft.machine } : {}),
    ...(duration.value !== undefined ? { maxDurationSeconds: duration.value } : {}),
    ...(retry ? { retry } : {}),
  };

  return Object.keys(runtime).length === 0
    ? { success: true, runtime: null }
    : { success: true, runtime };
}
