import type { WorkflowRuntimePolicy } from "./types.js";

export const FLOWCORDIA_MACHINE_PRESETS = [
  "micro",
  "small-1x",
  "small-2x",
  "medium-1x",
  "medium-2x",
  "large-1x",
  "large-2x",
] as const;
export const FLOWCORDIA_MAX_DURATION_SECONDS = 2_147_483_646;
export const FLOWCORDIA_MAX_RETRY_TIMEOUT_MS = 86_400_000;
export const FLOWCORDIA_MAX_RETRY_ATTEMPTS = 10;
export const FLOWCORDIA_MAX_RETRY_FACTOR = 10;
export const FLOWCORDIA_QUEUE_PATTERN = /^[A-Za-z0-9_\/-]{1,128}$/;

export type FlowcordiaExecutionPolicyIssueCode =
  | "invalid_queue"
  | "unsupported_machine"
  | "invalid_duration"
  | "unsupported_concurrency"
  | "invalid_attempts"
  | "invalid_retry_timeout"
  | "invalid_retry_factor"
  | "invalid_retry_order";

export interface FlowcordiaExecutionPolicyIssue {
  code: FlowcordiaExecutionPolicyIssueCode;
  message: string;
}

export function isFlowcordiaMachinePreset(
  value: string
): value is (typeof FLOWCORDIA_MACHINE_PRESETS)[number] {
  return FLOWCORDIA_MACHINE_PRESETS.some((candidate) => candidate === value);
}

export function validateFlowcordiaExecutionPolicy(
  runtime: WorkflowRuntimePolicy | undefined
): FlowcordiaExecutionPolicyIssue[] {
  if (!runtime) return [];
  const issues: FlowcordiaExecutionPolicyIssue[] = [];
  if (runtime.queue !== undefined && !FLOWCORDIA_QUEUE_PATTERN.test(runtime.queue)) {
    issues.push({
      code: "invalid_queue",
      message:
        "Workflow queue names must be 1-128 characters and use only letters, numbers, underscores, hyphens, or slashes.",
    });
  }
  if (runtime.machine !== undefined && !isFlowcordiaMachinePreset(runtime.machine)) {
    issues.push({
      code: "unsupported_machine",
      message: "Workflow machine must use a supported Trigger.dev machine preset.",
    });
  }
  if (
    runtime.maxDurationSeconds !== undefined &&
    (runtime.maxDurationSeconds < 5 ||
      runtime.maxDurationSeconds > FLOWCORDIA_MAX_DURATION_SECONDS ||
      !Number.isInteger(runtime.maxDurationSeconds))
  ) {
    issues.push({
      code: "invalid_duration",
      message: `Workflow maximum duration must be between 5 and ${FLOWCORDIA_MAX_DURATION_SECONDS} seconds.`,
    });
  }
  if (runtime.concurrencyKey !== undefined) {
    issues.push({
      code: "unsupported_concurrency",
      message:
        "Workflow concurrency keys require invocation-time binding and cannot be declared on a generated task.",
    });
  }
  const retry = runtime.retry;
  if (!retry) return issues;
  if (
    retry.maxAttempts !== undefined &&
    (!Number.isInteger(retry.maxAttempts) ||
      retry.maxAttempts < 1 ||
      retry.maxAttempts > FLOWCORDIA_MAX_RETRY_ATTEMPTS)
  ) {
    issues.push({
      code: "invalid_attempts",
      message: `Workflow retry attempts must be between 1 and ${FLOWCORDIA_MAX_RETRY_ATTEMPTS}.`,
    });
  }
  for (const value of [retry.minTimeoutMs, retry.maxTimeoutMs]) {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 0 || value > FLOWCORDIA_MAX_RETRY_TIMEOUT_MS)
    ) {
      issues.push({
        code: "invalid_retry_timeout",
        message: "Workflow retry timeouts must be whole milliseconds between 0 and 86,400,000.",
      });
      break;
    }
  }
  if (
    retry.factor !== undefined &&
    (!Number.isFinite(retry.factor) ||
      retry.factor < 1 ||
      retry.factor > FLOWCORDIA_MAX_RETRY_FACTOR)
  ) {
    issues.push({
      code: "invalid_retry_factor",
      message: `Workflow retry factor must be between 1 and ${FLOWCORDIA_MAX_RETRY_FACTOR}.`,
    });
  }
  if (
    retry.minTimeoutMs !== undefined &&
    retry.maxTimeoutMs !== undefined &&
    retry.maxTimeoutMs < retry.minTimeoutMs
  ) {
    issues.push({
      code: "invalid_retry_order",
      message: "Workflow maximum retry timeout must be greater than or equal to minimum timeout.",
    });
  }
  return issues;
}
