import {
  validateGitHubRepositorySourcePatches,
  type GitHubRepositorySourcePatch,
  type GitHubRepositorySourcePatchStore,
  type GitHubWorkflowAccessScope,
  type GitHubWorkflowStoreError,
} from "@flowcordia/github-workflows";

import type {
  GitHubProposalClient,
  GitHubProposalClientResolver,
  GitHubProposalSnapshot,
} from "../transport/client.js";
import type {
  CreateGitHubProposalInput,
  CreateGitHubProposalValue,
  GitHubProposalError,
  GitHubProposalResult,
} from "../types.js";
import type { GitHubProposalService } from "./service.js";

export interface CreateGitHubProposalWithSourcePatchesInput extends CreateGitHubProposalInput {
  sourcePatches?: unknown;
}

export interface GitHubProposalSourcePatchServiceOptions {
  proposals: Pick<GitHubProposalService, "create">;
  clientResolver: GitHubProposalClientResolver;
  sourcePatchStore: GitHubRepositorySourcePatchStore;
}

function proposalScope(
  scope: GitHubWorkflowAccessScope,
  branch: string
): GitHubWorkflowAccessScope {
  return { ...scope, repository: { ...scope.repository, branch } };
}

function invalidInput(issues: string[]): GitHubProposalResult<never> {
  return {
    success: false,
    error: {
      code: "invalid_input",
      operation: "create",
      phase: "validation",
      message: "Proposal source patches are invalid.",
      retryable: false,
      inputIssues: issues,
    },
  };
}

function patchError(
  error: GitHubWorkflowStoreError,
  input: CreateGitHubProposalWithSourcePatchesInput,
  proposalBranch: string,
  pullRequestNumber: number
): GitHubProposalResult<never> {
  const code: GitHubProposalError["code"] =
    error.code === "conflict" || error.code === "identity_conflict"
      ? "conflict"
      : error.code === "access_denied"
        ? "access_denied"
        : error.code === "not_found"
          ? "not_found"
          : error.code === "rate_limited"
            ? "rate_limited"
            : error.code === "ambiguous_write"
              ? "ambiguous_mutation"
              : error.code === "invalid_input" || error.code === "invalid_document"
                ? "invalid_input"
                : "unavailable";
  return {
    success: false,
    error: {
      code,
      operation: "create",
      phase: "workflow",
      message:
        code === "conflict"
          ? "Proposal source file changed and could not be patched safely."
          : code === "ambiguous_mutation"
            ? "Proposal source patch may have been written, but its exact result could not be proven."
            : "Proposal source patch could not be stored safely.",
      retryable: error.retryable,
      repository: input.scope.repository,
      proposalId: input.proposalId,
      proposalBranch,
      pullRequestNumber,
      requestId: error.requestId,
      retryAfterMs: error.retryAfterMs,
      inputIssues: error.inputIssues,
    },
  };
}

function patchMismatch(
  input: CreateGitHubProposalWithSourcePatchesInput,
  proposalBranch: string,
  pullRequestNumber: number,
  patch: GitHubRepositorySourcePatch
): GitHubProposalResult<never> {
  return {
    success: false,
    error: {
      code: "conflict",
      operation: "create",
      phase: "workflow",
      message: `Proposal source file "${patch.path}" no longer matches the requested patch.`,
      retryable: false,
      repository: input.scope.repository,
      proposalId: input.proposalId,
      proposalBranch,
      pullRequestNumber,
    },
  };
}

function snapshotUnavailable(
  input: CreateGitHubProposalWithSourcePatchesInput,
  proposalBranch: string,
  pullRequestNumber: number
): GitHubProposalResult<never> {
  return {
    success: false,
    error: {
      code: "unavailable",
      operation: "create",
      phase: "pull_request",
      message: "Proposal source patches were stored, but the final pull request head is unavailable.",
      retryable: true,
      repository: input.scope.repository,
      proposalId: input.proposalId,
      proposalBranch,
      pullRequestNumber,
    },
  };
}

function snapshotIdentityMatches(
  snapshot: GitHubProposalSnapshot,
  input: CreateGitHubProposalWithSourcePatchesInput,
  proposalBranch: string
): boolean {
  return (
    snapshot.pullRequest.baseBranch === input.scope.repository.branch &&
    snapshot.pullRequest.headBranch === proposalBranch &&
    snapshot.pullRequest.state === "open" &&
    !snapshot.pullRequest.merged
  );
}

function snapshotCollision(
  input: CreateGitHubProposalWithSourcePatchesInput,
  proposalBranch: string,
  pullRequestNumber: number,
  message: string
): GitHubProposalResult<never> {
  return {
    success: false,
    error: {
      code: "proposal_collision",
      operation: "create",
      phase: "pull_request",
      message,
      retryable: false,
      repository: input.scope.repository,
      proposalId: input.proposalId,
      proposalBranch,
      pullRequestNumber,
    },
  };
}

async function readSnapshot(
  client: GitHubProposalClient,
  input: CreateGitHubProposalWithSourcePatchesInput,
  pullRequestNumber: number
): Promise<GitHubProposalSnapshot | null> {
  try {
    return await client.getProposalSnapshot({
      repository: input.scope.repository,
      pullRequestNumber,
    });
  } catch {
    return null;
  }
}

export class GitHubProposalSourcePatchService {
  readonly #proposals: Pick<GitHubProposalService, "create">;
  readonly #clientResolver: GitHubProposalClientResolver;
  readonly #sourcePatchStore: GitHubRepositorySourcePatchStore;

  constructor(options: GitHubProposalSourcePatchServiceOptions) {
    if (!options?.proposals || typeof options.proposals.create !== "function") {
      throw new TypeError("Source patch proposal service requires the canonical proposal service.");
    }
    if (!options.clientResolver || typeof options.clientResolver.resolve !== "function") {
      throw new TypeError("Source patch proposal service requires a proposal client resolver.");
    }
    if (
      !options.sourcePatchStore ||
      typeof options.sourcePatchStore.read !== "function" ||
      typeof options.sourcePatchStore.save !== "function"
    ) {
      throw new TypeError("Source patch proposal service requires a repository source patch store.");
    }
    this.#proposals = options.proposals;
    this.#clientResolver = options.clientResolver;
    this.#sourcePatchStore = options.sourcePatchStore;
  }

  async create(
    input: CreateGitHubProposalWithSourcePatchesInput
  ): Promise<GitHubProposalResult<CreateGitHubProposalValue>> {
    const validation = validateGitHubRepositorySourcePatches(input?.sourcePatches ?? []);
    if (!validation.success) return invalidInput(validation.issues.map((issue) => issue.message));

    const { sourcePatches: _sourcePatches, ...proposalInput } = input;
    const created = await this.#proposals.create(proposalInput);
    if (!created.success || validation.patches.length === 0) return created;

    const branch = created.value.proposal.branch;
    const pullRequestNumber = created.value.proposal.pullRequestNumber;
    const scope = proposalScope(input.scope, branch);
    for (const patch of validation.patches) {
      const current = await this.#sourcePatchStore.read({ scope, path: patch.path });
      if (
        created.value.resumed &&
        current.success &&
        current.value.sourceText === patch.sourceText
      ) {
        continue;
      }
      if (!current.success && current.error.code !== "not_found") {
        return patchError(current.error, input, branch, pullRequestNumber);
      }

      const saved = await this.#sourcePatchStore.save({
        scope,
        patch,
        mutation: input.mutation,
      });
      if (!saved.success) {
        if (saved.error.code === "ambiguous_write") {
          const reconciled = await this.#sourcePatchStore.read({ scope, path: patch.path });
          if (reconciled.success && reconciled.value.sourceText === patch.sourceText) continue;
        }
        return patchError(saved.error, input, branch, pullRequestNumber);
      }
    }

    let client: GitHubProposalClient;
    try {
      client = await this.#clientResolver.resolve(input.scope);
    } catch {
      return snapshotUnavailable(input, branch, pullRequestNumber);
    }
    const snapshot = await readSnapshot(client, input, pullRequestNumber);
    if (!snapshot) return snapshotUnavailable(input, branch, pullRequestNumber);
    if (!snapshotIdentityMatches(snapshot, input, branch)) {
      return snapshotCollision(
        input,
        branch,
        pullRequestNumber,
        "Pull request identity changed while source patches were being stored."
      );
    }

    const headSha = snapshot.pullRequest.headSha;
    for (const patch of validation.patches) {
      const verified = await this.#sourcePatchStore.read({
        scope,
        path: patch.path,
        revision: headSha,
      });
      if (!verified.success) {
        return patchError(verified.error, input, branch, pullRequestNumber);
      }
      if (verified.value.sourceText !== patch.sourceText) {
        return patchMismatch(input, branch, pullRequestNumber, patch);
      }
    }

    const stableSnapshot = await readSnapshot(client, input, pullRequestNumber);
    if (!stableSnapshot) return snapshotUnavailable(input, branch, pullRequestNumber);
    if (!snapshotIdentityMatches(stableSnapshot, input, branch)) {
      return snapshotCollision(
        input,
        branch,
        pullRequestNumber,
        "Pull request identity changed after source patches were verified."
      );
    }
    if (stableSnapshot.pullRequest.headSha !== headSha) {
      return {
        success: false,
        error: {
          code: "conflict",
          operation: "create",
          phase: "pull_request",
          message: "Proposal branch changed while source patches were being verified. Resume creation.",
          retryable: true,
          repository: input.scope.repository,
          proposalId: input.proposalId,
          proposalBranch: branch,
          pullRequestNumber,
          expectedHeadSha: headSha,
          actualHeadSha: stableSnapshot.pullRequest.headSha,
        },
      };
    }

    return {
      success: true,
      value: {
        ...created.value,
        proposal: { ...created.value.proposal, headSha },
        audit: { ...created.value.audit, headSha },
      },
    };
  }
}
