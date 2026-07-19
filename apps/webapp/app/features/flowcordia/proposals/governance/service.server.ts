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

function resolvedStored(input: {
  publicId: string;
  version: bigint;
  profile: FlowcordiaProposalGovernanceProfile;
  policyDigest: string;
  updatedAt: Date;
}): ResolvedFlowcordiaProposalGovernance {
  return resolved({ source: "stored", ...input });
}

export async function resolveFlowcordiaProposalGovernance(
  scope: WorkflowIndexScope
): Promise<ResolvedFlowcordiaProposalGovernance> {
  const stored = await getFlowcordiaProposalGovernancePolicy(scope);
  if (stored) {
    return resolvedStored({
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
  return resolvedStored({
    publicId: stored.publicId,
    version: stored.version,
    profile: stored.profile,
    policyDigest: stored.policyDigest,
    updatedAt: stored.updatedAt,
  });
}

export async function ensureStoredFlowcordiaProposalGovernance(input: {
  scope: WorkflowIndexScope;
  actorId: string;
  correlationId: string;
}): Promise<ResolvedFlowcordiaProposalGovernance> {
  const current = await resolveFlowcordiaProposalGovernance(input.scope);
  if (current.source === "stored") return current;
  try {
    return await updateFlowcordiaProposalGovernance({
      scope: input.scope,
      profile: current.profile,
      expectedVersion: null,
      actorId: input.actorId,
      correlationId: input.correlationId,
    });
  } catch (error) {
    if (error instanceof FlowcordiaProposalGovernanceError && error.code === "policy_conflict") {
      const concurrent = await resolveFlowcordiaProposalGovernance(input.scope);
      if (concurrent.source === "stored") return concurrent;
    }
    throw error;
  }
}
