export type FlowcordiaBootstrapErrorCode =
  | "invalid_input"
  | "repository_not_empty"
  | "workflow_conflict"
  | "repository_unavailable"
  | "proposal_failed";

export class FlowcordiaBootstrapError extends Error {
  constructor(
    readonly code: FlowcordiaBootstrapErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "FlowcordiaBootstrapError";
  }
}
