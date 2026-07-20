import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  validateWorkflow,
  type WorkflowDefinition,
} from "@flowcordia/workflow";

const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;

export function createFlowcordiaStarterWorkflow(input: {
  workflowId: string;
  name: string;
  description?: string;
}): WorkflowDefinition {
  const workflowId = input.workflowId.trim();
  const name = input.name.trim();
  const description = input.description?.trim();
  if (!WORKFLOW_ID_PATTERN.test(workflowId)) {
    throw new TypeError("Workflow ID has an invalid format.");
  }
  if (name.length < 1 || name.length > 160) {
    throw new TypeError("Workflow name must contain between 1 and 160 characters.");
  }
  if ((description?.length ?? 0) > 2_000) {
    throw new TypeError("Workflow description cannot exceed 2000 characters.");
  }

  const candidate: WorkflowDefinition = {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    id: workflowId,
    name,
    ...(description ? { description } : {}),
    labels: ["starter"],
    nodes: [
      {
        id: "manual_trigger",
        name: "Manual trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 120, y: 180 },
        configuration: {},
      },
      {
        id: "output",
        name: "Return output",
        kind: "output",
        operation: "output.return",
        position: { x: 460, y: 180 },
        configuration: {},
      },
    ],
    edges: [
      {
        id: "manual_trigger_to_output",
        source: "manual_trigger",
        target: "output",
      },
    ],
  };
  const validated = validateWorkflow(candidate);
  if (!validated.success) {
    throw new TypeError(
      validated.issues[0]?.message ?? "The starter workflow does not satisfy the contract."
    );
  }
  return validated.workflow;
}
