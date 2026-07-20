import { prisma } from "~/db.server";
import type { WorkflowIndexScope } from "../index/types";

export class FlowcordiaRollbackProposalGateError extends Error {
  readonly code = "rollback_verification_required" as const;
  readonly status = 409;
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "FlowcordiaRollbackProposalGateError";
  }
}

export async function requireVerifiedFlowcordiaRollbackProposal(input: {
  scope: WorkflowIndexScope;
  proposalId: string;
  expectedHeadSha: string;
}): Promise<void> {
  const intent = await prisma.flowcordiaRollbackIntent.findFirst({
    where: {
      organizationId: input.scope.tenantId,
      projectId: input.scope.projectId,
      githubAppInstallationId: input.scope.githubAppInstallationId,
      appInstallationId: BigInt(input.scope.installationId),
      repositoryId: input.scope.repositoryId,
      repositoryGithubId: BigInt(input.scope.repositoryGithubId),
      targetProposalId: input.proposalId,
    },
    select: {
      status: true,
      targetHeadSha: true,
    },
  });
  if (!intent) return;
  if (intent.status !== "PROPOSAL_CREATED") {
    throw new FlowcordiaRollbackProposalGateError(
      "This rollback proposal has not passed exact workflow, generated artifact, source, and immutable diff verification at its current head. Refresh it in Studio before review or promotion."
    );
  }
  const proposal = await prisma.flowcordiaWorkflowProposal.findFirst({
    where: {
      organizationId: input.scope.tenantId,
      projectId: input.scope.projectId,
      githubAppInstallationId: input.scope.githubAppInstallationId,
      appInstallationId: BigInt(input.scope.installationId),
      repositoryId: input.scope.repositoryId,
      repositoryGithubId: BigInt(input.scope.repositoryGithubId),
      repositoryOwner: input.scope.repository.owner,
      repositoryName: input.scope.repository.name,
      baseBranch: input.scope.repository.branch,
      proposalId: input.proposalId,
    },
    select: {
      state: true,
      headSha: true,
    },
  });
  if (
    !proposal ||
    proposal.headSha === null ||
    intent.targetHeadSha !== input.expectedHeadSha ||
    proposal.headSha !== input.expectedHeadSha ||
    proposal.headSha !== intent.targetHeadSha
  ) {
    throw new FlowcordiaRollbackProposalGateError(
      "This rollback proposal changed after exact-head verification. Do not merge it. Close it without merging, then create a new numbered rollback attempt in Studio."
    );
  }
  if (!["DRAFT", "READY", "PROMOTING", "MERGED"].includes(proposal.state)) {
    throw new FlowcordiaRollbackProposalGateError(
      "This rollback proposal is no longer in a verified lifecycle state. Refresh it in Studio before review or promotion."
    );
  }
}
