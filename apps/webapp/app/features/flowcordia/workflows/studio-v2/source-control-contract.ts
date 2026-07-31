export interface StudioV2SourceControlProjection {
  proposalId: string;
  branch: string;
  headSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  state: "DRAFT" | "READY" | "MERGED";
}

export type StudioV2SourceControlErrorCode =
  | "source_control_not_configured"
  | "source_control_conflict"
  | "source_control_failed";

export class StudioV2SourceControlError extends Error {
  constructor(
    public readonly code: StudioV2SourceControlErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "StudioV2SourceControlError";
  }
}
