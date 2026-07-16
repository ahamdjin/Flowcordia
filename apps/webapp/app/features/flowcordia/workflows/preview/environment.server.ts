import type { ControlPlaneScope } from "@flowcordia/control-plane";
import { buildProposalBranch } from "@flowcordia/github-proposals";
import { prisma } from "~/db.server";
import { UpsertBranchService } from "~/services/upsertBranch.server";

export type FlowcordiaPreviewPreparation =
  | { state: "READY"; branchName: string; alreadyExisted: boolean }
  | { state: "DISABLED"; message: string }
  | { state: "UNAVAILABLE"; message: string };

export async function prepareFlowcordiaPreviewEnvironment(input: {
  scope: ControlPlaneScope;
  workflowId: string;
  proposalId: string;
}): Promise<FlowcordiaPreviewPreparation> {
  const connection = await prisma.connectedGithubRepository.findFirst({
    where: {
      projectId: input.scope.projectId,
      repositoryId: input.scope.repositoryId,
      project: { organizationId: input.scope.tenantId, deletedAt: null },
      repository: {
        githubId: BigInt(input.scope.repositoryGithubId),
        installation: {
          organizationId: input.scope.tenantId,
          appInstallationId: BigInt(input.scope.installationId),
          deletedAt: null,
          suspendedAt: null,
        },
      },
    },
    select: { previewDeploymentsEnabled: true },
  });
  if (!connection) {
    return {
      state: "UNAVAILABLE",
      message: "The connected repository changed before preview preparation.",
    };
  }
  if (!connection.previewDeploymentsEnabled) {
    return {
      state: "DISABLED",
      message: "Enable GitHub preview deployments for this project to deploy proposal heads.",
    };
  }

  let branchName: string;
  try {
    branchName = buildProposalBranch(input.workflowId, input.proposalId);
  } catch {
    return { state: "UNAVAILABLE", message: "The preview branch identity is invalid." };
  }
  const result = await new UpsertBranchService().call(
    { type: "orgId", organizationId: input.scope.tenantId },
    {
      projectId: input.scope.projectId,
      env: "preview",
      branchName,
      git: {
        provider: "github",
        source: "trigger_github_app",
        commitRef: branchName,
        remoteUrl: `https://github.com/${input.scope.repository.owner}/${input.scope.repository.name}`,
        pullRequestState: "open",
      },
    }
  );
  if (!result.success) {
    return {
      state: "UNAVAILABLE",
      message:
        "The preview environment could not be prepared. Check preview capacity and project configuration.",
    };
  }
  return { state: "READY", branchName, alreadyExisted: result.alreadyExisted };
}
