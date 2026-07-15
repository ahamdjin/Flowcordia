import { workflowSha256 } from "@flowcordia/control-plane";
import type { FlowcordiaProjectContext } from "../../proposals/scope.server";
import { requireFlowcordiaProjectContext } from "../../proposals/scope.server";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import {
  getWorkflowIndexSync,
  listWorkflowIndexEntries,
} from "../index/repository.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import {
  presentWorkflowGraph,
  presentWorkflowIndexEntry,
  presentWorkflowIndexSync,
  workflowIssueMessage,
} from "./presentation";

export async function queryWorkflowStudio(input: {
  context: FlowcordiaProjectContext;
  selectedWorkflowId?: string;
}) {
  const project = requireFlowcordiaProjectContext(input.context);
  const scope = await resolveWorkflowIndexScope(project);
  const [sync, entries] = await Promise.all([
    getWorkflowIndexSync(scope),
    listWorkflowIndexEntries(scope),
  ]);
  const selected =
    entries.find((entry) => entry.workflowId === input.selectedWorkflowId) ?? entries[0] ?? null;
  let graph = null;
  let loadError: { code: string; message: string; retryable: boolean } | null = null;

  if (selected?.status === "VALID") {
    const { workflowStore } = await createWorkflowIndexGitHubGateway(scope);
    const result = await workflowStore.read({
      scope,
      workflowId: selected.workflowId,
      revision: selected.sourceCommitSha,
    });
    if (!result.success) {
      loadError = {
        code: result.error.code,
        message:
          result.error.code === "invalid_document"
            ? workflowIssueMessage(result.error.workflowIssues)
            : result.error.message,
        retryable: result.error.retryable,
      };
    } else if (
      result.value.source.commitSha !== selected.sourceCommitSha ||
      result.value.source.blobSha !== selected.sourceBlobSha ||
      result.value.source.path !== selected.workflowPath ||
      result.value.workflow.id !== selected.workflowId ||
      workflowSha256(result.value.workflow) !== selected.canonicalSha256
    ) {
      loadError = {
        code: "indexed_source_mismatch",
        message:
          "The indexed workflow no longer matches its exact GitHub source identity. Synchronize before rendering it.",
        retryable: false,
      };
    } else {
      graph = presentWorkflowGraph({
        workflow: result.value.workflow,
        source: result.value.source,
        appliedMigrations: result.value.appliedMigrations,
      });
    }
  } else if (selected?.status === "INVALID") {
    loadError = {
      code: selected.failureCode ?? "invalid_document",
      message: selected.failureMessage ?? "The workflow document is invalid.",
      retryable: false,
    };
  }

  const stale = Boolean(
    sync &&
      (sync.status !== "IDLE" ||
        !sync.observedCommitSha ||
        entries.some((entry) => entry.sourceCommitSha !== sync.observedCommitSha))
  );

  return {
    repository: { ...scope.repository },
    sync: presentWorkflowIndexSync(sync),
    workflows: entries.map(presentWorkflowIndexEntry),
    selectedWorkflowId: selected?.workflowId ?? null,
    graph,
    loadError,
    stale,
  };
}
