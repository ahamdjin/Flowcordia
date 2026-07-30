import type { WorkflowDefinition } from "./types.js";

/**
 * Defines one canonical Flowcordia workflow document in TypeScript.
 *
 * Studio's whole-workflow Code view accepts this exact shape and parses the
 * object literal without evaluating user code.
 */
export function defineWorkflow<const T extends WorkflowDefinition>(workflow: T): T {
  return workflow;
}
