import { workflowSha256 } from "@flowcordia/control-plane";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { FlowcordiaRollbackError } from "./errors";

export function assertFlowcordiaRollbackSnapshot(input: {
  workflow: WorkflowDefinition;
  expectedWorkflowId: string;
  expectedWorkflowSha256: string;
}): void {
  if (
    input.workflow.id !== input.expectedWorkflowId ||
    workflowSha256(input.workflow) !== input.expectedWorkflowSha256
  ) {
    throw new FlowcordiaRollbackError(
      "historical_snapshot_unavailable",
      "The historical workflow does not match the exact governed rollback target.",
      409,
      false
    );
  }
}
