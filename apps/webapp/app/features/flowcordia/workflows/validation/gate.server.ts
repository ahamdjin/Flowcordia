import { flowcordiaProposalStore } from "../../proposals/prisma.server";
import type { WorkflowIndexScope } from "../index/types";
import type { FlowcordiaFunctionValidationProjection } from "./presentation";
import { queryFlowcordiaFunctionValidation } from "./query.server";

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
  proposalId: string;
  expectedHeadSha: string;
}): Promise<FlowcordiaFunctionValidationProjection> {
  const proposals = await flowcordiaProposalStore.listProposals({
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    repositoryId: input.scope.repositoryId,
    limit: 100,
  });
  const proposal = proposals.find(
    (candidate) =>
      candidate.proposalId === input.proposalId && candidate.headSha === input.expectedHeadSha
  );
  if (!proposal) {
    throw new FlowcordiaFunctionValidationGateError(
      "The exact proposal head is no longer available for repository function validation.",
      "BLOCKED",
      409,
      false
    );
  }

  const validation = await queryFlowcordiaFunctionValidation({
    scope: input.scope,
    workflowId: proposal.workflowId,
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
