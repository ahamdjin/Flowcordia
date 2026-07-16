const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;
const ROOT_SEGMENT_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export const DEFAULT_WORKFLOW_ROOT = ".flowcordia/workflows";
export const DEFAULT_GENERATED_WORKFLOW_ROOT = "trigger/flowcordia";

export function normalizeWorkflowRoot(root: string): string {
  if (root.length === 0 || root.length > 240 || root.startsWith("/") || root.endsWith("/")) {
    throw new TypeError("Workflow root must be a relative repository directory.");
  }

  const segments = root.split("/");
  if (
    segments.some(
      (segment) => segment === "." || segment === ".." || !ROOT_SEGMENT_PATTERN.test(segment)
    )
  ) {
    throw new TypeError("Workflow root contains an unsafe repository path segment.");
  }

  return segments.join("/");
}

export function isValidWorkflowId(workflowId: string): boolean {
  return WORKFLOW_ID_PATTERN.test(workflowId);
}

export function buildWorkflowPath(workflowId: string, root = DEFAULT_WORKFLOW_ROOT): string {
  if (!isValidWorkflowId(workflowId)) {
    throw new TypeError("Workflow ID has an invalid format.");
  }

  return `${normalizeWorkflowRoot(root)}/${workflowId}.json`;
}

export function buildGeneratedWorkflowPath(
  workflowId: string,
  root = DEFAULT_GENERATED_WORKFLOW_ROOT
): string {
  if (!isValidWorkflowId(workflowId)) {
    throw new TypeError("Workflow ID has an invalid format.");
  }
  return `${normalizeWorkflowRoot(root)}/${workflowId}.ts`;
}
