import type { GitHubWorkflowMutationContext } from "../access/scope.js";
import { validateMutationContext } from "../access/scope.js";
import { isValidWorkflowId } from "./path.js";

export type GitHubWorkflowMutationOperation = "create" | "update" | "delete";

function titleWorkflowId(workflowId: string): string {
  return workflowId.length <= 44 ? workflowId : `${workflowId.slice(0, 43)}…`;
}

export function buildWorkflowCommitMessage(
  operation: GitHubWorkflowMutationOperation,
  workflowId: string,
  context: GitHubWorkflowMutationContext
): string {
  if (!isValidWorkflowId(workflowId)) {
    throw new TypeError("Workflow ID has an invalid format.");
  }
  const contextIssues = validateMutationContext(context);
  if (contextIssues.length > 0) {
    throw new TypeError(contextIssues.join(" "));
  }

  const lines = [`flowcordia: ${operation} workflow ${titleWorkflowId(workflowId)}`];

  if (context.reason) {
    lines.push("", context.reason.trim());
  }

  lines.push(
    "",
    `Flowcordia-Actor: ${context.actorId}`,
    `Flowcordia-Correlation: ${context.correlationId}`
  );

  return `${lines.join("\n")}\n`;
}
