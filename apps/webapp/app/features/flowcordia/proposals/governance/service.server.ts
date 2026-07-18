import {
  defaultFlowcordiaProposalGovernanceProfile,
  effectiveFlowcordiaProposalPolicy,
  flowcordiaProposalGovernanceProfileDigest,
  parseFlowcordiaProposalGovernanceProfile,
  type FlowcordiaProposalGovernanceProfile,
  type GitHubProposalPolicy,
} from "@flowcordia/github-proposals";
import type { WorkflowIndexScope } from "../../workflows/index/types";
import {
  getFlowcordiaProposalGovernancePolicy,
  saveFlowcordiaProposalGovernancePolicy,
} from "./repository.server";
import { FlowcordiaProposalGovernanceError } from "./types";

export interface ResolvedFlowcordiaProposalGovernance {
  source: "default" | "stored";
  publicId: string | null;
  version: bigint | null;
  profile: FlowcordiaProposalGovernanceProfile;
  policyDigest: string;
  effectivePolicy: GitHubProposalPolicy;
  updatedAt: Date | null;
}

function resolved(input: {
  source: ResolvedFlowcordiaProposalGovernance["source"];
  publicId: string | null;
  version: bigint | null;
  profile: FlowcordiaProposalGovernanceProfile;
  policyDigest: string;
  updatedAt: Date | null;
}): ResolvedFlowcordiaProposalGovernance {
  return {
    ...input,
    effectivePolicy: effectiveFlowcordiaProposalPolicy(input.profile),
  };
}

export async function resolveFlowcordiaProposalGovernance(
  scope: WorkflowIndexScope
): Promise<ResolvedFlowcordiaProposalGovernance> {
  const stored = await getFlowcordiaProposalGovernancePolicy(scope);
  if (stored) {
    return resolved({
      source: "stored",
      publicId: stored.publicId,
      version: stored.version,
      profile: stored.profile,
      policyDigest: stored.policyDigest,
      updatedAt: stored.updatedAt,
    });
  }
  const profile = defaultFlowcordiaProposalGovernanceProfile();
  return resolved({
    source: "default",
    publicId: null,
    version: null,
    profile,
    policyDigest: flowcordiaProposalGovernanceProfileDigest(profile),
    updatedAt: null,
  });
}

export async function updateFlowcordiaProposalGovernance(input: {
  scope: WorkflowIndexScope;
  profile: unknown;
  expectedVersion: bigint | null;
  actorId: string;
  correlationId: string;
}): Promise<ResolvedFlowcordiaProposalGovernance> {
  const parsed = parseFlowcordiaProposalGovernanceProfile(input.profile);
  if (!parsed.success) {
    throw new FlowcordiaProposalGovernanceError(
      "invalid_policy",
      parsed.issues[0] ?? "The proposal governance profile is invalid."
    );
  }
  const stored = await saveFlowcordiaProposalGovernancePolicy({
    scope: input.scope,
    profile: parsed.profile,
    expectedVersion: input.expectedVersion,
    actorId: input.actorId,
    correlationId: input.correlationId,
  });
  return resolved({
    source: "stored",
    publicId: stored.publicId,
    version: stored.version,
    profile: stored.profile,
    policyDigest: stored.policyDigest,
    updatedAt: stored.updatedAt,
  });
}
