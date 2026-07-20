import type { ControlPlaneError } from "@flowcordia/control-plane";
import type { FlowcordiaRollbackErrorCode, FlowcordiaRollbackRecovery } from "./errors";

export interface FlowcordiaRollbackProposalFailure {
  code: Extract<FlowcordiaRollbackErrorCode, "proposal_reconciling" | "proposal_failed">;
  status: 409 | 503;
  retryable: boolean;
  state: Extract<FlowcordiaRollbackRecovery["state"], "RECONCILING" | "PENDING" | "FAILED">;
  action: Extract<FlowcordiaRollbackRecovery["action"], "WAIT" | "RETRY">;
}

export function classifyFlowcordiaRollbackProposalFailure(
  error: ControlPlaneError
): FlowcordiaRollbackProposalFailure {
  const uncertainGitHubMutation =
    error.github !== undefined &&
    (error.github.code === "ambiguous_mutation" || error.github.retryable);
  if (uncertainGitHubMutation) {
    return {
      code: "proposal_reconciling",
      status: 409,
      retryable: error.retryable,
      state: "RECONCILING",
      action: "WAIT",
    };
  }
  if (error.retryable) {
    return {
      code: "proposal_failed",
      status: 503,
      retryable: true,
      state: "PENDING",
      action: "RETRY",
    };
  }
  return {
    code: "proposal_failed",
    status: 409,
    retryable: false,
    state: "FAILED",
    action: "RETRY",
  };
}
