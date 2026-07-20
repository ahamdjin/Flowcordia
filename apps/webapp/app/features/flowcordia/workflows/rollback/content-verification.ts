import { compileWorkflowToTriggerTask } from "@flowcordia/runtime";
import { buildGeneratedWorkflowPath, type GitHubWorkflowStore } from "@flowcordia/github-workflows";
import { serializeWorkflow, type WorkflowDefinition } from "@flowcordia/workflow";
import type { WorkflowIndexScope } from "../index/types";
import { FlowcordiaRollbackError } from "./errors";

type RollbackWorkflowStore = Pick<GitHubWorkflowStore, "read" | "readGeneratedArtifact">;

function readFailure(input: { retryable: boolean; message: string }): FlowcordiaRollbackError {
  return new FlowcordiaRollbackError(
    "source_snapshot_unavailable",
    input.message,
    input.retryable ? 503 : 409,
    input.retryable
  );
}

export async function assertFlowcordiaRollbackContentAtHead(input: {
  scope: WorkflowIndexScope;
  workflowStore: RollbackWorkflowStore;
  workflow: WorkflowDefinition;
  workflowPath: string;
  proposalHeadSha: string;
}): Promise<void> {
  const compilation = compileWorkflowToTriggerTask(input.workflow);
  if (!compilation.success) {
    throw new FlowcordiaRollbackError(
      "historical_snapshot_unavailable",
      compilation.issues[0]?.message ??
        "The historical workflow no longer compiles to a governed Trigger.dev artifact.",
      409,
      false
    );
  }

  const [workflow, artifact] = await Promise.all([
    input.workflowStore.read({
      scope: input.scope,
      workflowId: input.workflow.id,
      revision: input.proposalHeadSha,
    }),
    input.workflowStore.readGeneratedArtifact({
      scope: input.scope,
      workflowId: input.workflow.id,
      revision: input.proposalHeadSha,
    }),
  ]);
  if (!workflow.success) {
    throw readFailure({
      retryable: workflow.error.retryable,
      message: "The rollback workflow could not be verified at the exact proposal head.",
    });
  }
  if (!artifact.success) {
    throw readFailure({
      retryable: artifact.error.retryable,
      message: "The generated rollback artifact could not be verified at the exact proposal head.",
    });
  }
  if (
    workflow.value.source.commitSha !== input.proposalHeadSha ||
    workflow.value.source.path !== input.workflowPath ||
    serializeWorkflow(workflow.value.workflow) !== serializeWorkflow(input.workflow) ||
    artifact.value.source.commitSha !== input.proposalHeadSha ||
    artifact.value.source.path !== buildGeneratedWorkflowPath(input.workflow.id) ||
    artifact.value.sourceText !== compilation.artifact.source
  ) {
    throw new FlowcordiaRollbackError(
      "source_snapshot_unavailable",
      "The rollback workflow or generated artifact does not match the exact governed content at the proposal head.",
      409,
      false
    );
  }
}
