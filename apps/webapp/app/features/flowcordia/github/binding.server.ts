import { ProposalPersistenceError, type ControlPlaneScope } from "@flowcordia/control-plane";
import { getFlowcordiaGitHubApp } from "../setup/githubAppConfiguration.server";
import { resolveControlPlaneScope } from "../proposals/scope.server";
export { sameFlowcordiaRepositoryScope } from "./scope";

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
  const githubApp = await getFlowcordiaGitHubApp();
  if (!githubApp) throw new ProposalPersistenceError("The GitHub App is not enabled.");
  await assertCurrentFlowcordiaRepositoryBinding(scope);
  return githubApp.getInstallationOctokit(scope.installationId);
}
