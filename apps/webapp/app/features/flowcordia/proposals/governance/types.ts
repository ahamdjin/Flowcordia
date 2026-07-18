import type { FlowcordiaProposalGovernanceProfile } from "@flowcordia/github-proposals";

export interface FlowcordiaProposalGovernancePolicyRecord {
  id: string;
  publicId: string;
  profile: FlowcordiaProposalGovernanceProfile;
  policyDigest: string;
  version: bigint;
  createdByActorId: string;
  updatedByActorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FlowcordiaProposalGovernanceErrorCode =
  | "invalid_policy"
  | "policy_weakening"
  | "policy_conflict"
  | "policy_corrupt"
  | "policy_unavailable";

export class FlowcordiaProposalGovernanceError extends Error {
  constructor(
    readonly code: FlowcordiaProposalGovernanceErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "FlowcordiaProposalGovernanceError";
  }
}
