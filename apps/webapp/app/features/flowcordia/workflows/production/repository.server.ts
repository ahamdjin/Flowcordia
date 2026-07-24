import type { ControlPlaneScope } from "@flowcordia/control-plane";
import { isValidWorkflowId } from "@flowcordia/github-workflows";
import { prisma } from "~/db.server";

const MAX_DATABASE_BIGINT = 9_223_372_036_854_775_807n;

export interface FlowcordiaLatestMergedProposal {
  proposalId: string;
  workflowId: string;
  headSha: string;
  mergeCommitSha: string;
  state: "MERGED";
  closureSchemaVersion: string | null;
  closureDigest: string | null;
  closureWorkflowIds: string[];
}

function installationId(value: number): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Flowcordia proposal installation identity is invalid.");
  }
  return BigInt(value);
}

function repositoryGithubId(value: string): bigint {
  if (!/^[1-9][0-9]{0,18}$/.test(value)) {
    throw new TypeError("Flowcordia proposal repository identity is invalid.");
  }
  const parsed = BigInt(value);
  if (parsed > MAX_DATABASE_BIGINT) {
    throw new TypeError("Flowcordia proposal repository identity is invalid.");
  }
  return parsed;
}

export async function findLatestMergedFlowcordiaProposal(input: {
  scope: ControlPlaneScope;
  workflowId: string;
}): Promise<FlowcordiaLatestMergedProposal | null> {
  if (!isValidWorkflowId(input.workflowId)) {
    throw new TypeError("Flowcordia workflow identity is invalid.");
  }

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
      closureSchemaVersion: true,
      closureDigest: true,
      closureWorkflowIds: true,
    },
  });

  if (!proposal?.headSha || !proposal.mergeCommitSha) return null;
  return {
    proposalId: proposal.proposalId,
    workflowId: proposal.workflowId,
    headSha: proposal.headSha,
    mergeCommitSha: proposal.mergeCommitSha,
    state: "MERGED",
    closureSchemaVersion: proposal.closureSchemaVersion,
    closureDigest: proposal.closureDigest,
    closureWorkflowIds: [...proposal.closureWorkflowIds],
  };
}
