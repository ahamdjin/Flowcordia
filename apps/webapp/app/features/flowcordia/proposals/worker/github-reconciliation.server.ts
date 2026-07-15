import {
  ProposalObservationError,
  ProposalPersistenceError,
  workflowSha256,
  type ControlPlaneScope,
  type ProposalReconciliationGateway,
  type RemoteProposalObservation,
  type WorkflowProposalAggregate,
} from "@flowcordia/control-plane";
import {
  bodyHasProposalMarker,
  OctokitGitHubProposalClient,
  type FlowcordiaProposalOctokitLike,
} from "@flowcordia/github-proposals";
import {
  GitHubTransportError,
  GitHubWorkflowStore,
  OctokitGitHubRepositoryClient,
  type FlowcordiaOctokitLike,
  type GitHubWorkflowAccessScope,
} from "@flowcordia/github-workflows";
import { githubApp } from "~/services/gitHub.server";
import { assertCurrentProposalRepositoryBinding } from "../github.server";

function scopeFor(proposal: WorkflowProposalAggregate): ControlPlaneScope {
  return {
    tenantId: proposal.tenantId,
    projectId: proposal.projectId,
    installationId: proposal.installationId,
    repositoryId: proposal.repositoryId,
    repositoryGithubId: proposal.repositoryGithubId,
    repository: {
      owner: proposal.repository.owner,
      name: proposal.repository.name,
      branch: proposal.baseBranch,
    },
  };
}

function sameScope(expected: ControlPlaneScope, actual: GitHubWorkflowAccessScope): boolean {
  return (
    expected.tenantId === actual.tenantId &&
    expected.projectId === actual.projectId &&
    expected.installationId === actual.installationId &&
    expected.repository.owner === actual.repository.owner &&
    expected.repository.name === actual.repository.name &&
    expected.repository.branch === actual.repository.branch
  );
}

function mappedError(error: unknown): ProposalObservationError {
  if (error instanceof ProposalObservationError) return error;
  if (
    error instanceof ProposalPersistenceError ||
    (error instanceof Error && error.name === "FlowcordiaProposalConfigurationError")
  ) {
    return new ProposalObservationError(
      "scope_changed",
      "The tenant GitHub repository binding changed during reconciliation.",
      { retryable: false, cause: error }
    );
  }
  if (error instanceof GitHubTransportError) {
    if (error.status === 401 || error.status === 403) {
      return new ProposalObservationError(
        "scope_changed",
        "The GitHub App can no longer read the proposal repository.",
        { retryable: false, cause: error }
      );
    }
    const retryable =
      error.code === "network_error" ||
      error.code === "rate_limited" ||
      error.status === 408 ||
      error.status === 429 ||
      (error.status !== undefined && error.status >= 500);
    return new ProposalObservationError(
      retryable ? "github_unavailable" : "invalid_remote_response",
      retryable
        ? "GitHub is temporarily unavailable for proposal reconciliation."
        : "GitHub returned an invalid proposal response.",
      { retryable, retryAfterMs: error.retryAfterMs, cause: error }
    );
  }
  return new ProposalObservationError(
    "invalid_remote_response",
    "GitHub proposal reconciliation failed safely.",
    { retryable: false, cause: error }
  );
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  signal?.throwIfAborted();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () =>
        reject(
          new ProposalObservationError(
            "github_unavailable",
            "GitHub proposal observation timed out.",
            { retryable: true }
          )
        ),
      timeoutMs
    );
    abort = () => reject(signal?.reason ?? new Error("Proposal observation aborted."));
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

export class AppGitHubProposalReconciliationGateway implements ProposalReconciliationGateway {
  constructor(private readonly timeoutMs: number) {}

  async observe(
    proposal: WorkflowProposalAggregate,
    signal?: AbortSignal
  ): Promise<RemoteProposalObservation> {
    try {
      return await withTimeout(this.#observe(proposal, signal), this.timeoutMs, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw mappedError(error);
    }
  }

  async #observe(
    proposal: WorkflowProposalAggregate,
    signal?: AbortSignal
  ): Promise<RemoteProposalObservation> {
    if (!githubApp) {
      throw new ProposalObservationError("scope_changed", "The GitHub App is not enabled.", {
        retryable: false,
      });
    }
    const scope = scopeFor(proposal);
    await assertCurrentProposalRepositoryBinding(scope);
    signal?.throwIfAborted();
    const octokit = await githubApp.getInstallationOctokit(scope.installationId);
    const proposalClient = new OctokitGitHubProposalClient(
      octokit as unknown as FlowcordiaProposalOctokitLike
    );
    const workflowStore = new GitHubWorkflowStore({
      clientResolver: {
        resolve: async (requestedScope) => {
          if (!sameScope(scope, requestedScope)) {
            throw new ProposalPersistenceError(
              "GitHub repository scope changed during reconciliation."
            );
          }
          await assertCurrentProposalRepositoryBinding(scope);
          return new OctokitGitHubRepositoryClient(octokit as unknown as FlowcordiaOctokitLike);
        },
      },
    });

    const [branch, pullRequests] = await Promise.all([
      proposalClient.getBranch({ repository: scope.repository, branch: proposal.proposalBranch }),
      proposalClient.findPullRequests({
        repository: scope.repository,
        baseBranch: proposal.baseBranch,
        headBranch: proposal.proposalBranch,
      }),
    ]);
    const pullRequest = pullRequests.length === 1 ? pullRequests[0]! : null;
    if (pullRequests.length > 1) {
      await assertCurrentProposalRepositoryBinding(scope);
      return {
        branchSha: branch.exists ? branch.sha : null,
        pullRequest: null,
        pullRequestCollision: true,
        workflowSha256: null,
      };
    }
    // A merged/closed PR may have had its branch deleted. Its immutable head
    // commit remains readable and is stronger proof than a mutable branch name.
    const workflow = await workflowStore.read({
      scope,
      workflowId: proposal.workflowId,
      revision: pullRequest?.headSha ?? proposal.proposalBranch,
    });
    signal?.throwIfAborted();
    await assertCurrentProposalRepositoryBinding(scope);

    if (!workflow.success && workflow.error.code !== "not_found") {
      const retryable = workflow.error.retryable;
      throw new ProposalObservationError(
        retryable
          ? "github_unavailable"
          : workflow.error.code === "invalid_document"
            ? "workflow_mismatch"
            : workflow.error.code === "access_denied"
              ? "scope_changed"
              : "invalid_remote_response",
        retryable
          ? "GitHub workflow content is temporarily unavailable."
          : "GitHub workflow content could not be verified safely.",
        { retryable, retryAfterMs: workflow.error.retryAfterMs }
      );
    }

    return {
      branchSha: branch.exists ? branch.sha : null,
      pullRequestCollision: pullRequests.length > 1,
      pullRequest: pullRequest
        ? {
            number: pullRequest.number,
            url: pullRequest.url,
            state: pullRequest.state,
            draft: pullRequest.draft,
            merged: pullRequest.merged,
            mergeCommitSha: pullRequest.mergeCommitSha,
            baseBranch: pullRequest.baseBranch,
            headBranch: pullRequest.headBranch,
            headSha: pullRequest.headSha,
            markerMatches: bodyHasProposalMarker(pullRequest.body, {
              proposalId: proposal.proposalId,
              workflowId: proposal.workflowId,
              baseCommitSha: proposal.baseCommitSha,
              creatorReviewerId: proposal.creatorReviewerId,
            }),
          }
        : null,
      workflowSha256: workflow.success ? workflowSha256(workflow.value.workflow) : null,
    };
  }
}
