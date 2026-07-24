import type { FlowcordiaApprovalResult } from "@flowcordia/workflow";
import {
  normalizeFlowcordiaApprovalComment,
  parseStoredFlowcordiaApprovalResult,
  type FlowcordiaApprovalDecisionValue,
  type FlowcordiaApprovalIdentity,
} from "./contract";

export type FlowcordiaApprovalDecisionStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface FlowcordiaApprovalTarget extends FlowcordiaApprovalIdentity {
  internalWaitpointId: string;
  status: "PENDING" | "COMPLETED";
  createdAt: Date;
  output: string | null;
  outputType: string | null;
  outputIsError: boolean;
}

export interface FlowcordiaApprovalDecisionReservation extends FlowcordiaApprovalIdentity {
  internalWaitpointId: string;
  requestId: string;
  status: FlowcordiaApprovalDecisionStatus;
  decision: FlowcordiaApprovalDecisionValue;
  comment: string | null;
  decidedAt: string;
  decidedByUserId: string;
}

export interface FlowcordiaApprovalDecisionCommand {
  waitpointId: string;
  expectedWorkflowId: string;
  expectedRunId: string;
  expectedNodeId: string;
  requestId: string;
  decision: FlowcordiaApprovalDecisionValue;
  comment?: string | null;
  userId: string;
}

export interface FlowcordiaApprovalDecisionDependencies {
  now(): Date;
  loadTarget(command: FlowcordiaApprovalDecisionCommand): Promise<FlowcordiaApprovalTarget | null>;
  reserve(input: {
    target: FlowcordiaApprovalTarget;
    command: FlowcordiaApprovalDecisionCommand;
    result: FlowcordiaApprovalResult;
  }): Promise<FlowcordiaApprovalDecisionReservation>;
  complete(input: {
    target: FlowcordiaApprovalTarget;
    result: FlowcordiaApprovalResult;
  }): Promise<void>;
  reload(internalWaitpointId: string): Promise<{
    status: "PENDING" | "COMPLETED";
    output: string | null;
    outputType: string | null;
    outputIsError: boolean;
  } | null>;
  markCompleted(input: {
    reservation: FlowcordiaApprovalDecisionReservation;
    observed: FlowcordiaApprovalResult;
  }): Promise<void>;
  markFailed(input: {
    reservation: FlowcordiaApprovalDecisionReservation;
    code: string;
  }): Promise<void>;
}

export type FlowcordiaApprovalDecisionErrorCode =
  | "approval_not_found"
  | "approval_identity_changed"
  | "approval_comment_required"
  | "approval_expired"
  | "approval_conflict"
  | "approval_completion_failed"
  | "approval_completion_invalid";

export class FlowcordiaApprovalDecisionError extends Error {
  constructor(
    readonly code: FlowcordiaApprovalDecisionErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly observedDecision: FlowcordiaApprovalDecisionValue | null = null
  ) {
    super(message);
    this.name = "FlowcordiaApprovalDecisionError";
  }
}

function sameResult(
  expected: Pick<FlowcordiaApprovalResult, "decision" | "comment" | "decidedAt">,
  observed: Pick<FlowcordiaApprovalResult, "decision" | "comment" | "decidedAt">
): boolean {
  return (
    expected.decision === observed.decision &&
    expected.comment === observed.comment &&
    expected.decidedAt === observed.decidedAt
  );
}

export async function decideFlowcordiaApproval(
  command: FlowcordiaApprovalDecisionCommand,
  dependencies: FlowcordiaApprovalDecisionDependencies
): Promise<{ status: "completed"; result: FlowcordiaApprovalResult; idempotent: boolean }> {
  const target = await dependencies.loadTarget(command);
  if (!target) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_not_found",
      "The approval is unavailable in this project environment.",
      404,
      false
    );
  }
  if (
    target.workflowId !== command.expectedWorkflowId ||
    target.runId !== command.expectedRunId ||
    target.nodeId !== command.expectedNodeId
  ) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_identity_changed",
      "The approval identity changed. Refresh Studio before deciding.",
      409,
      false
    );
  }
  const comment = normalizeFlowcordiaApprovalComment(command.comment);
  if (target.requireComment && comment === null) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_comment_required",
      "This approval requires a reviewer comment.",
      400,
      false
    );
  }
  if (target.status === "PENDING" && Date.parse(target.timeoutAt) <= dependencies.now().getTime()) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_expired",
      "This approval reached its reviewed timeout.",
      409,
      false
    );
  }

  const proposed: FlowcordiaApprovalResult = {
    decision: command.decision,
    comment,
    decidedAt: dependencies.now().toISOString(),
  };
  const reservation = await dependencies.reserve({ target, command, result: proposed });
  if (reservation.requestId !== command.requestId) {
    throw new FlowcordiaApprovalDecisionError(
      "approval_conflict",
      "Another reviewer already claimed this approval.",
      409,
      false,
      reservation.status === "COMPLETED" ? reservation.decision : null
    );
  }
  const reservedResult: FlowcordiaApprovalResult = {
    decision: reservation.decision,
    comment: reservation.comment,
    decidedAt: reservation.decidedAt,
  };
  if (reservation.status === "COMPLETED") {
    return { status: "completed", result: reservedResult, idempotent: true };
  }

  try {
    if (target.status === "PENDING") {
      await dependencies.complete({ target, result: reservedResult });
    }
  } catch {
    await dependencies.markFailed({ reservation, code: "completion_failed" });
    throw new FlowcordiaApprovalDecisionError(
      "approval_completion_failed",
      "The approval could not be completed. Retry the same decision request.",
      503,
      true
    );
  }

  const authoritative = await dependencies.reload(target.internalWaitpointId);
  if (!authoritative) {
    await dependencies.markFailed({ reservation, code: "waitpoint_missing_after_completion" });
    throw new FlowcordiaApprovalDecisionError(
      "approval_completion_failed",
      "The approval completion could not be verified.",
      503,
      true
    );
  }
  const observed = parseStoredFlowcordiaApprovalResult(authoritative);
  if (!observed.success) {
    await dependencies.markFailed({ reservation, code: "invalid_authoritative_output" });
    throw new FlowcordiaApprovalDecisionError(
      "approval_completion_invalid",
      observed.message,
      409,
      false
    );
  }
  if (!sameResult(reservedResult, observed.result)) {
    await dependencies.markFailed({ reservation, code: "authoritative_decision_mismatch" });
    throw new FlowcordiaApprovalDecisionError(
      "approval_conflict",
      "The authoritative approval decision differs from this request.",
      409,
      false,
      observed.result.decision
    );
  }
  await dependencies.markCompleted({ reservation, observed: observed.result });
  return { status: "completed", result: observed.result, idempotent: false };
}
