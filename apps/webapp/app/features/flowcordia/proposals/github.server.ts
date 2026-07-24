import { ProposalPersistenceError, type ControlPlaneScope } from "@flowcordia/control-plane";
import {
  buildProposalBranch,
  GitHubProposalService,
  GitHubProposalSourcePatchService,
  GitHubProposalWorkflowClosureService,
  GitHubProposalWorkflowClosureStore,
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

async function createProposalInfrastructure(scope: ControlPlaneScope) {
  const octokit = await getFlowcordiaInstallationOctokit(scope);
  const assertScope = async (requestedScope: GitHubWorkflowAccessScope, label: string) => {
    if (!sameFlowcordiaRepositoryScope(scope, requestedScope)) {
      throw new ProposalPersistenceError(`${label} scope changed during resolution.`);
    }
    await assertCurrentFlowcordiaRepositoryBinding(scope);
  };
  const repositoryResolver = {
    resolve: async (requestedScope: GitHubWorkflowAccessScope) => {
      await assertScope(requestedScope, "GitHub repository");
      return new OctokitGitHubRepositoryClient(octokit as unknown as FlowcordiaOctokitLike);
    },
  };
  const proposalResolver = {
    resolve: async (requestedScope: GitHubWorkflowAccessScope) => {
      await assertScope(requestedScope, "GitHub proposal");
      return new OctokitGitHubProposalClient(octokit as unknown as FlowcordiaProposalOctokitLike);
    },
  };
  const workflowStore = new GitHubWorkflowStore({ clientResolver: repositoryResolver });
  return { proposalResolver, workflowStore, repositoryResolver };
}

export async function createGitHubProposalGateway(scope: ControlPlaneScope) {
  const { proposalResolver, workflowStore, repositoryResolver } =
    await createProposalInfrastructure(scope);
  const sourcePatchStore = new GitHubRepositorySourcePatchStore({
    clientResolver: repositoryResolver,
  });
  const closureStore = new GitHubProposalWorkflowClosureStore({
    clientResolver: repositoryResolver,
  });
  const proposals = new GitHubProposalService({
    clientResolver: proposalResolver,
    workflowStore,
  });
  const governedWorkflowClosure = new GitHubProposalWorkflowClosureService({
    proposals,
    clientResolver: proposalResolver,
    workflowStore,
    closureStore,
  });
  const governedSourcePatches = new GitHubProposalSourcePatchService({
    proposals: governedWorkflowClosure,
    clientResolver: proposalResolver,
    sourcePatchStore,
  });
  return {
    create: governedSourcePatches.create.bind(governedSourcePatches),
    submit: proposals.submit.bind(proposals),
    promote: proposals.promote.bind(proposals),
  };
}

export async function createGitHubProposalSnapshotReader(scope: ControlPlaneScope) {
  const { proposalResolver } = await createProposalInfrastructure(scope);
  return {
    async read(pullRequestNumber: number) {
      const client = await proposalResolver.resolve(scope);
      return client.getProposalSnapshot({
        repository: scope.repository,
        pullRequestNumber,
      });
    },
  };
}

export async function createGitHubProposalAttemptInspector(scope: ControlPlaneScope) {
  const { proposalResolver } = await createProposalInfrastructure(scope);
  return {
    async inspect(input: { workflowId: string; proposalId: string }) {
      const branchName = buildProposalBranch(input.workflowId, input.proposalId);
      const client = await proposalResolver.resolve(scope);
      const [branch, pullRequests] = await Promise.all([
        client.getBranch({ repository: scope.repository, branch: branchName }),
        client.findPullRequests({
          repository: scope.repository,
          baseBranch: scope.repository.branch,
          headBranch: branchName,
        }),
      ]);
      return { branchName, branch, pullRequests };
    },
  };
}
