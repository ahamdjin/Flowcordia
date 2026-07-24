import {
  ProposalPersistenceError,
  type ControlPlaneScope,
  type GitHubProposalGateway,
} from "@flowcordia/control-plane";
import {
  buildProposalBranch,
  GitHubProposalService,
  GitHubProposalSourcePatchService,
  GitHubProposalWorkflowClosureService,
  GitHubProposalWorkflowClosureStore,
  OctokitGitHubProposalClient,
  type FlowcordiaProposalOctokitLike,
  type GitHubProposalResult,
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
  const create: GitHubProposalGateway["create"] = async (input) => {
    const created = await governedSourcePatches.create(input);
    if (!created.success) return created;
    const manifest = await closureStore.read({
      scope: {
        ...input.scope,
        repository: { ...input.scope.repository, branch: created.value.proposal.branch },
      },
      proposalId: input.proposalId,
      revision: created.value.proposal.headSha,
    });
    if (!manifest.success) {
      const code =
        manifest.error.code === "access_denied"
          ? "access_denied"
          : manifest.error.code === "rate_limited"
            ? "rate_limited"
            : manifest.error.code === "conflict"
              ? "conflict"
              : "unavailable";
      return {
        success: false,
        error: {
          code,
          operation: "create",
          phase: "workflow",
          message: "Exact proposal closure identity could not be recovered from the final head.",
          retryable: manifest.error.retryable,
          repository: input.scope.repository,
          proposalId: input.proposalId,
          proposalBranch: created.value.proposal.branch,
          pullRequestNumber: created.value.proposal.pullRequestNumber,
          requestId: manifest.error.requestId,
          retryAfterMs: manifest.error.retryAfterMs,
        },
      } satisfies GitHubProposalResult<never>;
    }
    if (
      manifest.value.manifest.proposalId !== input.proposalId ||
      manifest.value.manifest.rootWorkflowId !== input.workflow.id ||
      manifest.value.manifest.baseCommitSha !== input.expectedBaseCommitSha
    ) {
      return {
        success: false,
        error: {
          code: "proposal_collision",
          operation: "create",
          phase: "workflow",
          message: "Final proposal closure identity does not match the requested proposal.",
          retryable: false,
          repository: input.scope.repository,
          proposalId: input.proposalId,
          proposalBranch: created.value.proposal.branch,
          pullRequestNumber: created.value.proposal.pullRequestNumber,
        },
      };
    }
    return {
      success: true,
      value: {
        ...created.value,
        closure: {
          schemaVersion: manifest.value.manifest.schemaVersion,
          digest: manifest.value.manifest.closureDigest,
          workflowIds: manifest.value.manifest.entries.map((entry) => entry.workflowId),
        },
      },
    };
  };
  return {
    create,
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
