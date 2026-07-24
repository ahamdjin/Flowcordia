import type { JsonObject, JsonValue } from "./types.js";

export const FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS = 60;
export const FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS = 30 * 24 * 60 * 60;
export const FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH = 500;
export const FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH = 2_000;
export const FLOWCORDIA_APPROVAL_MAX_COMMENT_LENGTH = 2_000;

export interface FlowcordiaApprovalConfiguration extends JsonObject {
  prompt: string;
  instruction: string;
  timeoutSeconds: number;
  requireComment: boolean;
}

export interface FlowcordiaApprovalResult extends JsonObject {
  decision: "approved" | "rejected";
  comment: string | null;
  decidedAt: string;
}

export type FlowcordiaApprovalConfigurationResult =
  | { success: true; configuration: FlowcordiaApprovalConfiguration }
  | { success: false; issues: Array<{ path: string; message: string }> };

export type FlowcordiaApprovalResultParseResult =
  | { success: true; result: FlowcordiaApprovalResult }
  | { success: false; message: string };

function isObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value: Record<string, JsonValue>, allowed: readonly string[]): string[] {
  const known = new Set(allowed);
  return Object.keys(value).filter((key) => !known.has(key));
}

export function parseFlowcordiaApprovalConfiguration(
  value: JsonObject
): FlowcordiaApprovalConfigurationResult {
  const issues: Array<{ path: string; message: string }> = [];
  const unknown = unknownKeys(value, ["prompt", "instruction", "timeoutSeconds", "requireComment"]);
  if (unknown.length > 0) {
    issues.push({
      path: unknown[0]!,
      message: "Approval configuration contains an unsupported field.",
    });
  }
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt || prompt.length > FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH) {
    issues.push({
      path: "prompt",
      message: `Approval prompt must contain 1-${FLOWCORDIA_APPROVAL_MAX_PROMPT_LENGTH} characters.`,
    });
  }
  const instruction = typeof value.instruction === "string" ? value.instruction.trim() : "";
  if (instruction.length > FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH) {
    issues.push({
      path: "instruction",
      message: `Approval instruction must stay under ${FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH} characters.`,
    });
  }
  const timeoutSeconds = value.timeoutSeconds;
  if (
    typeof timeoutSeconds !== "number" ||
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS ||
    timeoutSeconds > FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS
  ) {
    issues.push({
      path: "timeoutSeconds",
      message: `Approval timeout must be an integer between ${FLOWCORDIA_APPROVAL_MIN_TIMEOUT_SECONDS} and ${FLOWCORDIA_APPROVAL_MAX_TIMEOUT_SECONDS} seconds.`,
    });
  }
  if (typeof value.requireComment !== "boolean") {
    issues.push({ path: "requireComment", message: "Approval requireComment must be a boolean." });
  }
  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    configuration: {
      prompt,
      instruction,
      timeoutSeconds: timeoutSeconds as number,
      requireComment: value.requireComment as boolean,
    },
  };
}

export function parseFlowcordiaApprovalResult(value: unknown): FlowcordiaApprovalResultParseResult {
  if (!isObject(value))
    return { success: false, message: "Approval result must be a JSON object." };
  const unknown = unknownKeys(value, ["decision", "comment", "decidedAt"]);
  if (unknown.length > 0) {
    return { success: false, message: "Approval result contains an unsupported field." };
  }
  if (value.decision !== "approved" && value.decision !== "rejected") {
    return { success: false, message: "Approval result decision must be approved or rejected." };
  }
  if (
    value.comment !== null &&
    (typeof value.comment !== "string" ||
      value.comment.length > FLOWCORDIA_APPROVAL_MAX_COMMENT_LENGTH)
  ) {
    return { success: false, message: "Approval result comment is invalid." };
  }
  if (typeof value.decidedAt !== "string" || !Number.isFinite(Date.parse(value.decidedAt))) {
    return { success: false, message: "Approval result decidedAt must be an ISO timestamp." };
  }
  return {
    success: true,
    result: {
      decision: value.decision,
      comment: value.comment,
      decidedAt: new Date(value.decidedAt).toISOString(),
    },
  };
}
