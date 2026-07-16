import type { WorkflowDefinition, WorkflowIssue } from "./types.js";

export function validateWorkflowIdentityTransition(
  previous: WorkflowDefinition,
  next: WorkflowDefinition
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const previousEdges = new Map(previous.edges.map((edge) => [edge.id, edge]));

  next.nodes.forEach((node, index) => {
    const existing = previousNodes.get(node.id);
    if (!existing) {
      return;
    }

    if (existing.kind !== node.kind || existing.operation !== node.operation) {
      issues.push({
        code: "identity_changed",
        message:
          "A node ID cannot be reused for a different kind or operation. Create a new node ID instead.",
        path: ["nodes", index, "id"],
        entity: { type: "node", id: node.id },
      });
    }
  });

  next.edges.forEach((edge, index) => {
    const existing = previousEdges.get(edge.id);
    if (!existing) {
      return;
    }

    const wasRewired =
      existing.source !== edge.source ||
      existing.target !== edge.target ||
      existing.sourceHandle !== edge.sourceHandle ||
      existing.targetHandle !== edge.targetHandle;

    if (wasRewired) {
      issues.push({
        code: "identity_changed",
        message: "A rewired connection must receive a new edge ID.",
        path: ["edges", index, "id"],
        entity: { type: "edge", id: edge.id },
      });
    }
  });

  return issues;
}
