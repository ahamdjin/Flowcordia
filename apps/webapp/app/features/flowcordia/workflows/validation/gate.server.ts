import type { WorkflowIndexScope } from "../index/types";
import {
  queryFlowcordiaFunctionValidation,
} from "./query.server";
import type { FlowcordiaFunctionValidationProjection } from "./presentation";

export class FlowcordiaFunctionValidationGateError extends Error {
  readonly code = "function_validation_required" as const;

  constructor(
    message: string,
    readonly state: FlowcordiaFunctionValidationProjection["state"],
    readonly status: 409 | 503,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaFunctionValidationGateError";
  }
}

export function flowcordiaFunctionValidationAllowsPromotion(
  validation: FlowcordiaFunctionValidationProjection
): boolean {
  return validation.state === "PASSED" || validation.state === "NOT_REQUIRED";
}

export async function requireFlowcordiaFunctionValidationForPromotion(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
  proposalId: string;
  expectedHeadSha: string;
}): Promise<FlowcordiaFunctionValidationProjection> {
  const validation = await queryFlowcordiaFunctionValidation({
    scope: input.scope,
    workflowId: input.workflowId,
    expectedProposalId: input.proposalId,
    expectedHeadSha: input.expectedHeadSha,
  });
  if (flowcordiaFunctionValidationAllowsPromotion(validation)) return validation;

  const unavailable = validation.state === "UNAVAILABLE";
  const retryable = [
    "NOT_REQUESTED",
    "WAITING_FOR_DEPLOYMENT",
    "READY_TO_RUN",
    "QUEUED",
    "RUNNING",
    "FAILED",
    "UNAVAILABLE",
  ].includes(validation.state);
  throw new FlowcordiaFunctionValidationGateError(
    validation.message,
    validation.state,
    unavailable ? 503 : 409,
    retryable
  );
}
