import type { JsonValue, WorkflowDefinition } from "./types.js";

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }

  return value;
}

export function serializeWorkflow(workflow: WorkflowDefinition): string {
  return `${JSON.stringify(canonicalize(workflow as unknown as JsonValue), null, 2)}\n`;
}

export function cloneWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(serializeWorkflow(workflow)) as WorkflowDefinition;
}
