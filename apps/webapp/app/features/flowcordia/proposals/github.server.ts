import { ProposalPersistenceError, type ControlPlaneScope } from "@flowcordia/control-plane";
import {
  GitHubProposalService,
  OctokitGitHubProposalClient,
  type FlowcordiaProposalOctokitLike,
} from "@flowcordia/github-proposals";
import {
  GitHubWorkflowStore,
  OctokitGitHubRepositoryClient,
  type FlowcordiaOctokitLike,
  type GitHubWorkflowAccessScope,
} from "@flowcordia/github-workflows";
import { githubApp } from "~/services/gitHub.server";
import { resolveControlPlaneScope } from "./scope.server";

function sameScope(expected: ControlPlaneScope, actual: GitHubWorkflowAccessScope): boolean {
  return (
    expected.tenantId === actual.tenantId &&
    expected.projectId === actual.projectId &&
    expected.installationId === actual.installationId &&
    expected.repository.owner === actual.repository.owner &&
    expected.repository.name === actual.repository.name
  );
}

export async function assertCurrentProposalRepositoryBinding(
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
      "The GitHub repository binding changed before the proposal operation."
    );
  }
}

export async function createGitHubProposalGateway(scope: ControlPlaneScope) {
  if (!githubApp) throw new ProposalPersistenceError("The GitHub App is not enabled.");
  await assertCurrentProposalRepositoryBinding(scope);
  const octokit = await githubApp.getInstallationOctokit(scope.installationId);

  const repositoryResolver = {
    resolve: async (requestedScope: GitHubWorkflowAccessScope) => {
      if (!sameScope(scope, requestedScope)) {
        throw new ProposalPersistenceError("GitHub repository scope changed during resolution.");
      }
      await assertCurrentProposalRepositoryBinding(scope);
      return new OctokitGitHubRepositoryClient(octokit as unknown as FlowcordiaOctokitLike);
    },
  };
  const proposalResolver = {
    resolve: async (requestedScope: GitHubWorkflowAccessScope) => {
      if (!sameScope(scope, requestedScope)) {
        throw new ProposalPersistenceError("GitHub proposal scope changed during resolution.");
      }
      await assertCurrentProposalRepositoryBinding(scope);
      return new OctokitGitHubProposalClient(octokit as unknown as FlowcordiaProposalOctokitLike);
    },
  };
  const workflowStore = new GitHubWorkflowStore({ clientResolver: repositoryResolver });
  const proposals = new GitHubProposalService({
    clientResolver: proposalResolver,
    workflowStore,
  });
  return {
    create: proposals.create.bind(proposals),
    submit: proposals.submit.bind(proposals),
    promote: proposals.promote.bind(proposals),
  };
}
