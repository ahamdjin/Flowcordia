export type FlowcordiaRollbackErrorCode =
  | "invalid_input"
  | "rollback_not_available"
  | "rollback_conflict"
  | "rollback_retry_required"
  | "historical_snapshot_unavailable"
  | "function_catalog_conflict"
  | "source_snapshot_unavailable"
  | "no_changes"
  | "proposal_reconciling"
  | "proposal_failed";

export interface FlowcordiaRollbackRecovery {
  attemptProposalId: string;
  branchName: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  state:
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
  action: "RETRY" | "CLOSE" | "REVIEW" | "WAIT";
}

export class FlowcordiaRollbackError extends Error {
  constructor(
    readonly code: FlowcordiaRollbackErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly recovery: FlowcordiaRollbackRecovery | null = null
  ) {
    super(message);
    this.name = "FlowcordiaRollbackError";
  }
}
