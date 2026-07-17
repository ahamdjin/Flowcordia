import { ProposalPersistenceError, type ControlPlaneScope } from "@flowcordia/control-plane";
import {
  GitHubProposalService,
  GitHubProposalSourcePatchService,
  OctokitGitHubProposalClient,
  type FlowcordiaProposalOctokitLike,
} from "@flowcordia/github-proposals";
import {
  GitHubRepositorySourcePatchStore,
  GitHubWorkflowStore,
  OctokitGitHubRepositoryClient,
  type FlowcordiaOctokitLike,
  type GitHubWorkflowAccessScope,
} from "@flowcordia/github-workflows";
import {
  assertCurrentFlowcordiaRepositoryBinding,
  getFlowcordiaInstallationOctokit,
  sameFlowcordiaRepositoryScope,
} from "../github/binding.server";

/** Compatibility export for the established proposal reconciliation adapter. */
export const assertCurrentProposalRepositoryBinding = assertCurrentFlowcordiaRepositoryBinding;

export async function createGitHubProposalGateway(scope: ControlPlaneScope) {
  const octokit = await getFlowcordiaInstallationOctokit(scope);

  const repositoryResolver = {
    resolve: async (requestedScope: GitHubWorkflowAccessScope) => {
      if (!sameFlowcordiaRepositoryScope(scope, requestedScope)) {
        throw new ProposalPersistenceError("GitHub repository scope changed during resolution.");
      }
      await assertCurrentFlowcordiaRepositoryBinding(scope);
      return new OctokitGitHubRepositoryClient(octokit as unknown as FlowcordiaOctokitLike);
    },
  };
  const proposalResolver = {
    resolve: async (requestedScope: GitHubWorkflowAccessScope) => {
      if (!sameFlowcordiaRepositoryScope(scope, requestedScope)) {
        throw new ProposalPersistenceError("GitHub proposal scope changed during resolution.");
      }
      await assertCurrentFlowcordiaRepositoryBinding(scope);
      return new OctokitGitHubProposalClient(octokit as unknown as FlowcordiaProposalOctokitLike);
    },
  };
  const workflowStore = new GitHubWorkflowStore({ clientResolver: repositoryResolver });
  const sourcePatchStore = new GitHubRepositorySourcePatchStore({
    clientResolver: repositoryResolver,
  });
  const proposals = new GitHubProposalService({
    clientResolver: proposalResolver,
    workflowStore,
  });
  const governedSourcePatches = new GitHubProposalSourcePatchService({
    proposals,
    clientResolver: proposalResolver,
    sourcePatchStore,
  });
  return {
    create: governedSourcePatches.create.bind(governedSourcePatches),
    submit: proposals.submit.bind(proposals),
    promote: proposals.promote.bind(proposals),
  };
}
