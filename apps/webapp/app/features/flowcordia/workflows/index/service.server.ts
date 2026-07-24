import { workflowSha256 } from "@flowcordia/control-plane";
import {
  collectFlowcordiaSubflowWorkflowIds,
  FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
} from "@flowcordia/workflow";
import type {
  GitHubWorkflowCatalog,
  GitHubWorkflowDiscoveryError,
  GitHubWorkflowStore,
} from "@flowcordia/github-workflows";
import { assertCurrentFlowcordiaRepositoryBinding } from "../../github/binding.server";
import { createWorkflowIndexGitHubGateway } from "./github.server";
import {
  claimWorkflowIndexSync,
  completeWorkflowIndexSync,
  failWorkflowIndexSync,
} from "./repository.server";
import type {
  ClaimedWorkflowIndexSync,
  WorkflowIndexEntryInput,
  WorkflowIndexScope,
} from "./types";

const READ_CONCURRENCY = 4;
const MAX_FAILURE_MESSAGE = 1_000;

export class WorkflowIndexSyncError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WorkflowIndexSyncError";
    this.code = code;
    this.retryable = retryable;
  }
}

function discoveryFailure(error: GitHubWorkflowDiscoveryError): WorkflowIndexSyncError {
  return new WorkflowIndexSyncError(error.code, error.message, error.retryable);
}

function boundedFailure(value: string): string {
  return value.slice(0, MAX_FAILURE_MESSAGE);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await map(values[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readIndexEntries(input: {
  scope: WorkflowIndexScope;
  commitSha: string;
  catalog: Awaited<ReturnType<GitHubWorkflowCatalog["discover"]>> & { success: true };
  workflowStore: GitHubWorkflowStore;
  indexedAt: Date;
}): Promise<WorkflowIndexEntryInput[]> {
  return mapWithConcurrency(input.catalog.value.entries, READ_CONCURRENCY, async (entry) => {
    const result = await input.workflowStore.read({
      scope: input.scope,
      workflowId: entry.workflowId,
      revision: input.commitSha,
    });
    if (!result.success) {
      if (result.error.code !== "invalid_document") {
        throw new WorkflowIndexSyncError(
          result.error.code,
          result.error.message,
          result.error.retryable
        );
      }
      const issue = result.error.workflowIssues?.[0];
      return {
        workflowId: entry.workflowId,
        workflowPath: entry.path,
        sourceCommitSha: input.commitSha,
        sourceBlobSha: entry.blobSha,
        indexedAt: input.indexedAt,
        status: "INVALID",
        name: null,
        description: null,
        schemaVersion: null,
        nodeCount: null,
        edgeCount: null,
        canonicalSha256: null,
        dependencyMetadataVersion: FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
        subflowWorkflowIds: [],
        failureCode: issue?.code ?? "invalid_document",
        failureMessage: boundedFailure(issue?.message ?? result.error.message),
      };
    }
    if (
      result.value.source.commitSha !== input.commitSha ||
      result.value.source.blobSha !== entry.blobSha ||
      result.value.source.path !== entry.path
    ) {
      throw new WorkflowIndexSyncError(
        "source_identity_mismatch",
        "The workflow source changed identity during exact-commit indexing.",
        false
      );
    }
    const workflow = result.value.workflow;
    return {
      workflowId: workflow.id,
      workflowPath: entry.path,
      sourceCommitSha: input.commitSha,
      sourceBlobSha: entry.blobSha,
      indexedAt: input.indexedAt,
      status: "VALID",
      name: workflow.name,
      description: workflow.description ?? null,
      schemaVersion: workflow.schemaVersion,
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      canonicalSha256: workflowSha256(workflow),
      dependencyMetadataVersion: FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
      subflowWorkflowIds: collectFlowcordiaSubflowWorkflowIds(workflow),
      failureCode: null,
      failureMessage: null,
    };
  });
}

export async function processWorkflowIndexClaim(
  claim: ClaimedWorkflowIndexSync
): Promise<{ commitSha: string; entryCount: number; validCount: number; invalidCount: number }> {
  try {
    await assertCurrentFlowcordiaRepositoryBinding(claim.scope);
    const { catalog, workflowStore } = await createWorkflowIndexGitHubGateway(claim.scope);
    const discovered = await catalog.discover({
      scope: claim.scope,
      revision: claim.requestedCommitSha ?? claim.scope.repository.branch,
    });
    if (!discovered.success) throw discoveryFailure(discovered.error);
    if (claim.requestedCommitSha && discovered.value.commitSha !== claim.requestedCommitSha) {
      throw new WorkflowIndexSyncError(
        "requested_commit_mismatch",
        "GitHub did not resolve the exact commit requested by the workflow index.",
        false
      );
    }
    const indexedAt = new Date();
    const entries = await readIndexEntries({
      scope: claim.scope,
      commitSha: discovered.value.commitSha,
      catalog: discovered,
      workflowStore,
      indexedAt,
    });
    await assertCurrentFlowcordiaRepositoryBinding(claim.scope);
    await completeWorkflowIndexSync({
      claim,
      observedCommitSha: discovered.value.commitSha,
      entries,
      now: indexedAt,
    });
    const validCount = entries.filter((entry) => entry.status === "VALID").length;
    return {
      commitSha: discovered.value.commitSha,
      entryCount: entries.length,
      validCount,
      invalidCount: entries.length - validCount,
    };
  } catch (error) {
    const normalized =
      error instanceof WorkflowIndexSyncError
        ? error
        : new WorkflowIndexSyncError(
            "workflow_index_failed",
            "Workflow indexing failed safely before replacing the durable catalog.",
            false,
            { cause: error }
          );
    await failWorkflowIndexSync({
      claim,
      errorCode: normalized.code,
      errorMessage: normalized.message,
    });
    throw normalized;
  }
}

export async function runOneWorkflowIndexSync(input: {
  workerId: string;
  leaseMs: number;
}): Promise<
  | { status: "idle" }
  | {
      status: "processed";
      syncId: string;
      result: { commitSha: string; entryCount: number; validCount: number; invalidCount: number };
    }
> {
  const claim = await claimWorkflowIndexSync(input);
  if (!claim) return { status: "idle" };
  const result = await processWorkflowIndexClaim(claim);
  return { status: "processed", syncId: claim.id, result };
}
