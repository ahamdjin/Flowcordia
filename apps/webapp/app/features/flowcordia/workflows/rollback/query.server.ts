import { workflowSha256 } from "@flowcordia/control-plane";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import type { WorkflowIndexScope } from "../index/types";
import { presentFlowcordiaRollback, unavailableFlowcordiaRollback } from "./presentation";
import { queryFlowcordiaRollbackHistory } from "./repository.server";

export async function queryFlowcordiaRollback(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
}) {
  const { workflowStore } = await createWorkflowIndexGitHubGateway(input.scope);
  const current = await workflowStore.read({
    scope: input.scope,
    workflowId: input.workflowId,
  });
  if (!current.success || current.value.workflow.id !== input.workflowId) {
    return unavailableFlowcordiaRollback();
  }

  const history = await queryFlowcordiaRollbackHistory({
    ...input,
    currentWorkflowSha256: workflowSha256(current.value.workflow),
  });
  return presentFlowcordiaRollback({
    ...history,
    base: {
      commitSha: current.value.source.commitSha,
      blobSha: current.value.source.blobSha,
    },
  });
}
