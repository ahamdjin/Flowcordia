import type { ControlPlaneScope, ProposalState } from "@flowcordia/control-plane";
import { prisma } from "~/db.server";

export interface FlowcordiaLatestMergedProposal {
  proposalId: string;
  workflowId: string;
  headSha: string;
  mergeCommitSha: string;
  state: ProposalState;
}

function installationId(value: number): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Flowcordia production proposal installation identity is invalid.");
  }
  return BigInt(value);
}

function repositoryGithubId(value: string): bigint {
  if (!/^[1-9][0-9]{0,39}$/.test(value)) {
    throw new TypeError("Flowcordia production proposal repository identity is invalid.");
  }
  return BigInt(value);
}

export async function findLatestMergedFlowcordiaProposal(input: {
  scope: ControlPlaneScope;
  workflowId: string;
}): Promise<FlowcordiaLatestMergedProposal | null> {
  const proposal = await prisma.flowcordiaWorkflowProposal.findFirst({
    where: {
      organizationId: input.scope.tenantId,
      projectId: input.scope.projectId,
      appInstallationId: installationId(input.scope.installationId),
      repositoryId: input.scope.repositoryId,
      repositoryGithubId: repositoryGithubId(input.scope.repositoryGithubId),
      workflowId: input.workflowId,
      state: "MERGED",
      headSha: { not: null },
      mergeCommitSha: { not: null },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      proposalId: true,
      workflowId: true,
      headSha: true,
      mergeCommitSha: true,
      state: true,
    },
  });

  if (!proposal?.headSha || !proposal.mergeCommitSha) return null;
  return {
    proposalId: proposal.proposalId,
    workflowId: proposal.workflowId,
    headSha: proposal.headSha,
    mergeCommitSha: proposal.mergeCommitSha,
    state: proposal.state,
  };
}
