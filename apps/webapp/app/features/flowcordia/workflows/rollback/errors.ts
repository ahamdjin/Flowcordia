export type FlowcordiaRollbackErrorCode =
  | "invalid_input"
  | "rollback_not_available"
  | "rollback_conflict"
  | "historical_snapshot_unavailable"
  | "function_catalog_conflict"
  | "source_snapshot_unavailable"
  | "no_changes"
  | "proposal_failed";

export class FlowcordiaRollbackError extends Error {
  constructor(
    readonly code: FlowcordiaRollbackErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaRollbackError";
  }
}
