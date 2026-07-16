import { prisma } from "~/db.server";
import {
  FlowcordiaProposalConfigurationError,
  resolveControlPlaneScope,
} from "../../proposals/scope.server";
import type { WorkflowIndexScope } from "./types";

export async function resolveWorkflowIndexScope(input: {
  organizationId: string;
  projectId: string;
}): Promise<WorkflowIndexScope> {
  const controlPlane = await resolveControlPlaneScope(input);
  const repository = await prisma.githubRepository.findFirst({
    where: {
      id: controlPlane.repositoryId,
      githubId: BigInt(controlPlane.repositoryGithubId),
      installation: {
        organizationId: controlPlane.tenantId,
        appInstallationId: BigInt(controlPlane.installationId),
        deletedAt: null,
        suspendedAt: null,
      },
    },
    select: {
      id: true,
      githubId: true,
      name: true,
      fullName: true,
      installation: { select: { id: true, appInstallationId: true } },
    },
  });
  if (!repository) {
    throw new FlowcordiaProposalConfigurationError(
      "The connected GitHub repository binding changed before workflow indexing."
    );
  }
  if (
    repository.installation.appInstallationId !== BigInt(controlPlane.installationId) ||
    repository.githubId.toString() !== controlPlane.repositoryGithubId ||
    repository.name !== controlPlane.repository.name ||
    repository.fullName !== `${controlPlane.repository.owner}/${controlPlane.repository.name}`
  ) {
    throw new FlowcordiaProposalConfigurationError(
      "The connected GitHub repository identity is inconsistent."
    );
  }
  return {
    ...controlPlane,
    githubAppInstallationId: repository.installation.id,
  };
}
