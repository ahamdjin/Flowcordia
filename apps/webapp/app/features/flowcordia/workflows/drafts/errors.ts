export type WorkflowDraftErrorCode =
  | "invalid_input"
  | "draft_not_found"
  | "draft_conflict"
  | "stale_source"
  | "corrupt_draft"
  | "unsupported_edit"
  | "draft_unavailable";

export class WorkflowDraftError extends Error {
  constructor(
    public readonly code: WorkflowDraftErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "WorkflowDraftError";
  }
}
