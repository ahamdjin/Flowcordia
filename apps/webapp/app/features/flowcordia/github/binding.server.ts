import { ProposalPersistenceError, type ControlPlaneScope } from "@flowcordia/control-plane";
import type { GitHubWorkflowAccessScope } from "@flowcordia/github-workflows";
import { githubApp } from "~/services/gitHub.server";
import { resolveControlPlaneScope } from "../proposals/scope.server";

export function sameFlowcordiaRepositoryScope(
  expected: ControlPlaneScope,
  actual: GitHubWorkflowAccessScope
): boolean {
  return (
    expected.tenantId === actual.tenantId &&
    expected.projectId === actual.projectId &&
    expected.installationId === actual.installationId &&
    expected.repository.owner === actual.repository.owner &&
    expected.repository.name === actual.repository.name &&
    expected.repository.branch === actual.repository.branch
  );
}

export async function assertCurrentFlowcordiaRepositoryBinding(
  scope: ControlPlaneScope
): Promise<void> {
  const current = await resolveControlPlaneScope({
    organizationId: scope.tenantId,
    projectId: scope.projectId,
  });
  if (
    current.installationId !== scope.installationId ||
    current.repositoryId !== scope.repositoryId ||
    current.repositoryGithubId !== scope.repositoryGithubId ||
    current.repository.owner !== scope.repository.owner ||
    current.repository.name !== scope.repository.name ||
    current.repository.branch !== scope.repository.branch
  ) {
    throw new ProposalPersistenceError(
      "The GitHub repository binding changed before the Flowcordia operation."
    );
  }
}

export async function getFlowcordiaInstallationOctokit(scope: ControlPlaneScope) {
  if (!githubApp) throw new ProposalPersistenceError("The GitHub App is not enabled.");
  await assertCurrentFlowcordiaRepositoryBinding(scope);
  return githubApp.getInstallationOctokit(scope.installationId);
}
