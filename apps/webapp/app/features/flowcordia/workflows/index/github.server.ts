import { ProposalPersistenceError } from "@flowcordia/control-plane";
import {
  GitHubWorkflowCatalog,
  GitHubFunctionCatalogStore,
  GitHubWorkflowStore,
  OctokitGitHubRepositoryClient,
  OctokitGitHubWorkflowDiscoveryClient,
  type FlowcordiaOctokitLike,
  type FlowcordiaWorkflowDiscoveryOctokitLike,
  type GitHubWorkflowAccessScope,
} from "@flowcordia/github-workflows";
import {
  assertCurrentFlowcordiaRepositoryBinding,
  getFlowcordiaInstallationOctokit,
  sameFlowcordiaRepositoryScope,
} from "../../github/binding.server";
import type { WorkflowIndexScope } from "./types";

export async function createWorkflowIndexGitHubGateway(scope: WorkflowIndexScope) {
  const octokit = await getFlowcordiaInstallationOctokit(scope);
  const assertScope = async (requestedScope: GitHubWorkflowAccessScope) => {
    if (!sameFlowcordiaRepositoryScope(scope, requestedScope)) {
      throw new ProposalPersistenceError(
        "Workflow index repository scope changed during resolution."
      );
    }
    await assertCurrentFlowcordiaRepositoryBinding(scope);
  };

  const repositoryClientResolver = {
    resolve: async (requestedScope: GitHubWorkflowAccessScope) => {
      await assertScope(requestedScope);
      return new OctokitGitHubRepositoryClient(octokit as unknown as FlowcordiaOctokitLike);
    },
  };
  const workflowStore = new GitHubWorkflowStore({ clientResolver: repositoryClientResolver });
  const functionCatalog = new GitHubFunctionCatalogStore({
    clientResolver: repositoryClientResolver,
  });
  const catalog = new GitHubWorkflowCatalog({
    clientResolver: {
      resolve: async (requestedScope) => {
        await assertScope(requestedScope);
        return new OctokitGitHubWorkflowDiscoveryClient(
          octokit as unknown as FlowcordiaWorkflowDiscoveryOctokitLike
        );
      },
    },
    maxEntries: 500,
  });

  return { workflowStore, catalog, functionCatalog };
}
