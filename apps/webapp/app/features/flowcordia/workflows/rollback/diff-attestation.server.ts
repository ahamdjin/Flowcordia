import {
  buildGeneratedWorkflowPath,
  GitHubTransportError,
  MAX_GITHUB_SOURCE_PATCH_FILES,
  type GitHubCommitComparisonResult,
  type GitHubRepositorySourcePatch,
} from "@flowcordia/github-workflows";
import { FlowcordiaRollbackError } from "./errors";

const MAX_ROLLBACK_CHANGED_FILES = MAX_GITHUB_SOURCE_PATCH_FILES + 2;

function invalidComparison(message: string): FlowcordiaRollbackError {
  return new FlowcordiaRollbackError("source_snapshot_unavailable", message, 409, false);
}

function comparisonFailure(error: unknown): FlowcordiaRollbackError {
  if (error instanceof FlowcordiaRollbackError) return error;
  const retryable =
    !(error instanceof GitHubTransportError) ||
    error.code === "network_error" ||
    error.code === "rate_limited" ||
    error.status === 408 ||
    (error.status !== undefined && error.status >= 500);
  return new FlowcordiaRollbackError(
    "source_snapshot_unavailable",
    "The immutable base-to-head comparison could not be verified for this rollback proposal.",
    retryable ? 503 : 409,
    retryable
  );
}

export function assertFlowcordiaRollbackComparison(input: {
  baseCommitSha: string;
  proposalHeadSha: string;
  comparison: GitHubCommitComparisonResult;
  allowedPaths: ReadonlySet<string>;
}): string[] {
  if (
    input.comparison.status !== "ahead" ||
    input.comparison.aheadBy < 1 ||
    input.comparison.behindBy !== 0 ||
    input.comparison.totalCommits < 1 ||
    input.comparison.baseCommitSha !== input.baseCommitSha ||
    input.comparison.mergeBaseCommitSha !== input.baseCommitSha ||
    input.comparison.headCommitSha !== input.proposalHeadSha ||
    input.comparison.files.length < 1
  ) {
    throw invalidComparison(
      "The rollback proposal head is not a proven descendant of its immutable base commit."
    );
  }
  if (input.comparison.files.length > MAX_ROLLBACK_CHANGED_FILES) {
    throw invalidComparison(
      "The rollback proposal changes more files than its governed path boundary allows."
    );
  }

  const changedPaths = new Set<string>();
  for (const file of input.comparison.files) {
    if ((file.status !== "added" && file.status !== "modified") || changedPaths.has(file.path)) {
      throw invalidComparison(
        "GitHub returned an unsupported changed-file identity for rollback verification."
      );
    }
    changedPaths.add(file.path);
  }

  const unexpectedPaths = [...changedPaths].filter((path) => !input.allowedPaths.has(path));
  if (unexpectedPaths.length > 0) {
    throw invalidComparison(
      `The rollback proposal contains changes outside its governed path set: ${unexpectedPaths
        .slice(0, 3)
        .join(", ")}.`
    );
  }
  return [...changedPaths].sort((left, right) => left.localeCompare(right));
}

export async function assertFlowcordiaRollbackDiffAtHead(input: {
  repositoryComparison: {
    compareCommits(input: {
      baseCommitSha: string;
      headCommitSha: string;
    }): Promise<GitHubCommitComparisonResult>;
  };
  workflowId: string;
  workflowPath: string;
  baseCommitSha: string;
  proposalHeadSha: string;
  sourcePatches: readonly GitHubRepositorySourcePatch[];
}): Promise<void> {
  try {
    const comparison = await input.repositoryComparison.compareCommits({
      baseCommitSha: input.baseCommitSha,
      headCommitSha: input.proposalHeadSha,
    });
    assertFlowcordiaRollbackComparison({
      baseCommitSha: input.baseCommitSha,
      proposalHeadSha: input.proposalHeadSha,
      comparison,
      allowedPaths: new Set([
        input.workflowPath,
        buildGeneratedWorkflowPath(input.workflowId),
        ...input.sourcePatches.map((patch) => patch.path),
      ]),
    });
  } catch (error) {
    throw comparisonFailure(error);
  }
}
