export type FlowcordiaRollbackRecoveryState =
  | "ABSENT"
  | "BRANCH_ONLY"
  | "OPEN"
  | "DRAFT"
  | "READY"
  | "PROMOTING"
  | "CLOSED"
  | "MERGED"
  | "RECONCILING"
  | "PENDING"
  | "FAILED"
  | "AMBIGUOUS";

export type FlowcordiaRollbackRecoveryAction = "RETRY" | "CLOSE" | "REVIEW" | "WAIT";

export interface FlowcordiaRollbackRecoveryProjection {
  state: FlowcordiaRollbackRecoveryState;
  action: FlowcordiaRollbackRecoveryAction;
}

export function canRetryFlowcordiaRollbackResponse(input: {
  error?: string;
  retryable?: boolean;
  recovery?: FlowcordiaRollbackRecoveryProjection | null;
}): boolean {
  const retryOffered = input.error === "rollback_retry_required" || input.retryable === true;
  if (!retryOffered || !input.recovery) return retryOffered;
  return (
    input.recovery.action === "RETRY" ||
    input.recovery.action === "CLOSE" ||
    (input.recovery.action === "REVIEW" && input.recovery.state === "BRANCH_ONLY")
  );
}

export function flowcordiaRollbackRecoveryButtonLabel(input: {
  error?: string;
  recovery?: FlowcordiaRollbackRecoveryProjection | null;
}): string {
  if (
    input.recovery?.action === "CLOSE" ||
    (input.recovery?.action === "REVIEW" && input.recovery.state === "BRANCH_ONLY")
  ) {
    return "Check cleanup and retry";
  }
  return input.error === "rollback_retry_required" ? "Inspect and retry" : "Retry same attempt";
}

export function flowcordiaRollbackRecoveryGuidance(
  recovery: FlowcordiaRollbackRecoveryProjection | null | undefined
): string | null {
  if (!recovery) return null;
  if (recovery.action === "RETRY") {
    return "Flowcordia can safely inspect or resume this governed attempt.";
  }
  if (recovery.action === "WAIT") {
    return "Reconciliation is still resolving the GitHub outcome. Refresh this exact attempt before taking another action.";
  }
  if (recovery.action === "CLOSE") {
    return "Close the pull request without merging it, then refresh the workflow before trying again.";
  }
  if (recovery.state === "BRANCH_ONLY") {
    return "Delete the abandoned proposal branch in GitHub, then refresh the workflow before trying again.";
  }
  if (recovery.state === "MERGED") {
    return "This attempt was merged. Review governed history before creating any new rollback.";
  }
  if (recovery.state === "AMBIGUOUS") {
    return "GitHub contains multiple or ambiguous artifacts for this attempt. Resolve them before trying again.";
  }
  return "Review the existing governed attempt before trying again.";
}
