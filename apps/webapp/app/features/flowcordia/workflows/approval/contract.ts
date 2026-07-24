import {
  FLOWCORDIA_APPROVAL_MAX_COMMENT_LENGTH,
  parseFlowcordiaApprovalResult,
  type FlowcordiaApprovalResult,
} from "@flowcordia/workflow";

export const FLOWCORDIA_APPROVAL_TAG = "flowcordia:approval" as const;
export const FLOWCORDIA_APPROVAL_INBOX_LIMIT = 50;

export type FlowcordiaApprovalDecisionValue = "approved" | "rejected";
export type FlowcordiaApprovalInboxItemState =
  | "WAITING"
  | "DECIDING"
  | "DECIDED"
  | "FAILED"
  | "TIMED_OUT";

export interface FlowcordiaApprovalIdentity {
  waitpointId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  prompt: string;
  instruction: string;
  requireComment: boolean;
  timeoutAt: string;
}

export interface FlowcordiaApprovalInboxItem extends FlowcordiaApprovalIdentity {
  state: FlowcordiaApprovalInboxItemState;
  createdAt: string;
  decision: FlowcordiaApprovalDecisionValue | null;
  comment: string | null;
  decidedAt: string | null;
  failureCode: string | null;
}

export interface FlowcordiaApprovalInboxProjection {
  environment: { id: string; slug: string; type: string } | null;
  waitingCount: number;
  decidingCount: number;
  items: FlowcordiaApprovalInboxItem[];
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const NODE_ID = /^[a-z][a-z0-9_-]{1,127}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseFlowcordiaApprovalRunMetadata(input: {
  metadata: string | null;
  waitpointId: string;
  runId: string;
}): FlowcordiaApprovalIdentity | null {
  if (!input.metadata) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.metadata);
  } catch {
    return null;
  }
  const root = record(parsed);
  const approval = record(root?.flowcordiaApproval);
  if (!approval || approval.schemaVersion !== "0.1" || approval.state !== "WAITING") return null;
  const allowedKeys = new Set([
    "schemaVersion",
    "state",
    "waitpointId",
    "workflowId",
    "runId",
    "nodeId",
    "prompt",
    "instruction",
    "requireComment",
    "timeoutAt",
  ]);
  if (Object.keys(approval).some((key) => !allowedKeys.has(key))) return null;
  if (approval.waitpointId !== input.waitpointId || approval.runId !== input.runId) return null;
  if (typeof approval.workflowId !== "string" || !WORKFLOW_ID.test(approval.workflowId))
    return null;
  if (typeof approval.nodeId !== "string" || !NODE_ID.test(approval.nodeId)) return null;
  if (
    typeof approval.prompt !== "string" ||
    approval.prompt.length < 1 ||
    approval.prompt.length > 500 ||
    typeof approval.instruction !== "string" ||
    approval.instruction.length > 2_000 ||
    typeof approval.requireComment !== "boolean" ||
    typeof approval.timeoutAt !== "string" ||
    !Number.isFinite(Date.parse(approval.timeoutAt))
  ) {
    return null;
  }
  return {
    waitpointId: input.waitpointId,
    workflowId: approval.workflowId,
    runId: input.runId,
    nodeId: approval.nodeId,
    prompt: approval.prompt,
    instruction: approval.instruction,
    requireComment: approval.requireComment,
    timeoutAt: new Date(approval.timeoutAt).toISOString(),
  };
}

export function parseStoredFlowcordiaApprovalResult(input: {
  status: "PENDING" | "COMPLETED";
  output: string | null;
  outputType: string | null;
  outputIsError: boolean;
}): { success: true; result: FlowcordiaApprovalResult } | { success: false; message: string } {
  if (input.status !== "COMPLETED") {
    return { success: false, message: "The approval waitpoint is not completed." };
  }
  if (input.outputIsError) {
    return { success: false, message: "The approval waitpoint completed with an error." };
  }
  if (input.outputType !== "application/json" || input.output === null) {
    return { success: false, message: "The approval waitpoint output is not inline JSON." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.output);
  } catch {
    return { success: false, message: "The approval waitpoint output is malformed JSON." };
  }
  return parseFlowcordiaApprovalResult(parsed);
}

export function normalizeFlowcordiaApprovalComment(
  value: string | null | undefined
): string | null {
  const comment = value?.trim() ?? "";
  if (!comment) return null;
  return comment.slice(0, FLOWCORDIA_APPROVAL_MAX_COMMENT_LENGTH);
}
