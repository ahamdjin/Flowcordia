import { cloneJson, stableJsonStringify } from "@flowcordia/foundation";
import type { WorkflowDefinition } from "./types.js";

export function serializeWorkflow(workflow: WorkflowDefinition): string {
  return stableJsonStringify(workflow, { space: 2, trailingNewline: true });
}

export function cloneWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  return cloneJson(workflow);
}
