export type StudioV2RepositoryStatus = "SYNCHRONIZED" | "MODIFIED";

export interface StudioV2RepositoryProjection {
  repository: string;
  branch: string;
  workflowId: string;
  workflowPath: string;
  sourceCommitSha: string;
  sourceBlobSha: string;
  canonicalSha256: string;
  status: StudioV2RepositoryStatus;
}

export interface StudioV2RepositoryProposalProjection {
  proposalId: string;
  state: string;
  pullRequestNumber: number | null;
  headSha: string | null;
  url: string | null;
  resumed: boolean;
}
