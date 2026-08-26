import { formatWorkflowIssuePath, validateWorkflow } from "@flowcordia/workflow";

export const STUDIO_V2_WORKFLOW_SOURCE_MODULE = "@flowcordia/workflow";

export function printStudioV2WorkflowSource(document: unknown): string {
  const validation = validateWorkflow(document);
  if (!validation.success) {
    const issue = validation.issues[0];
    throw new Error(
      issue
        ? `${issue.message} (${formatWorkflowIssuePath(issue.path)})`
        : "The workflow document is invalid."
    );
  }

  return `import { defineWorkflow } from "${STUDIO_V2_WORKFLOW_SOURCE_MODULE}";
import type { WorkflowDefinition } from "${STUDIO_V2_WORKFLOW_SOURCE_MODULE}";

export default defineWorkflow(${JSON.stringify(validation.workflow, null, 2)} satisfies WorkflowDefinition);
`;
}
