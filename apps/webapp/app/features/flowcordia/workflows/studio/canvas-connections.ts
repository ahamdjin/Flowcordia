import type { WorkflowEditCommand } from "@flowcordia/workflow";
import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";

export type WorkflowStudioCanvasBranch = "true" | "false" | null;

export interface WorkflowStudioCanvasPendingConnection {
  sourceId: string;
  condition: WorkflowStudioCanvasBranch;
}

export interface WorkflowStudioCanvasSourceHandle {
  id: string;
  label: string;
  condition: WorkflowStudioCanvasBranch;
  available: boolean;
  reason: string | null;
}

export type WorkflowStudioCanvasConnectionResult =
  | { success: true; command: Extract<WorkflowEditCommand, { type: "connect_nodes" }> }
  | { success: false; message: string };

function nodeById(graph: WorkflowStudioGraph, nodeId: string): WorkflowStudioNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

function reaches(graph: WorkflowStudioGraph, start: string, target: string): boolean {
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === target) return true;
    visited.add(current);
    for (const edge of graph.edges) {
      if (edge.source === current && !visited.has(edge.target)) queue.push(edge.target);
    }
  }
  return false;
}

export function workflowStudioCanvasSourceHandles(
  graph: WorkflowStudioGraph,
  nodeId: string
): WorkflowStudioCanvasSourceHandle[] {
  const node = nodeById(graph, nodeId);
  if (!node) return [];
  if (node.kind === "output") {
    return [
      {
        id: `${nodeId}:output`,
        label: "Output is terminal",
        condition: null,
        available: false,
        reason: "Output nodes cannot start another connection.",
      },
    ];
  }
  if (node.operation === "control.condition") {
    return (["true", "false"] as const).map((condition) => {
      const used = graph.edges.some(
        (edge) => edge.source === nodeId && edge.condition === condition
      );
      return {
        id: `${nodeId}:${condition}`,
        label: condition === "true" ? "True branch" : "False branch",
        condition,
        available: !used,
        reason: used ? `The ${condition} branch is already connected.` : null,
      };
    });
  }
  return [
    {
      id: `${nodeId}:next`,
      label: "Connect next",
      condition: null,
      available: true,
      reason: null,
    },
  ];
}

export function workflowStudioCanvasTargetEligibility({
  graph,
  pending,
  targetId,
}: {
  graph: WorkflowStudioGraph;
  pending: WorkflowStudioCanvasPendingConnection | null;
  targetId: string;
}): { eligible: boolean; message: string | null } {
  if (!pending) return { eligible: false, message: "Choose a source handle first." };
  const source = nodeById(graph, pending.sourceId);
  const target = nodeById(graph, targetId);
  if (!source || !target) {
    return { eligible: false, message: "The selected node is no longer present." };
  }
  if (source.id === target.id) {
    return { eligible: false, message: "A node cannot connect directly to itself." };
  }
  if (source.kind === "output") {
    return { eligible: false, message: "Output nodes cannot start another connection." };
  }
  if (target.kind === "trigger") {
    return { eligible: false, message: "Trigger nodes cannot receive incoming connections." };
  }
  if (source.operation === "control.condition" && pending.condition === null) {
    return { eligible: false, message: "Choose the true or false branch." };
  }
  if (source.operation !== "control.condition" && pending.condition !== null) {
    return { eligible: false, message: "Only condition nodes can use branch handles." };
  }
  if (
    graph.edges.some(
      (edge) =>
        edge.source === source.id &&
        (edge.target === target.id ||
          (pending.condition !== null && edge.condition === pending.condition))
    )
  ) {
    return {
      eligible: false,
      message:
        pending.condition === null
          ? "Those nodes are already connected."
          : `The ${pending.condition} branch is already connected.`,
    };
  }
  if (reaches(graph, target.id, source.id)) {
    return { eligible: false, message: "That connection would create a cycle." };
  }
  return { eligible: true, message: null };
}

export function buildWorkflowStudioCanvasConnectionCommand({
  graph,
  pending,
  targetId,
}: {
  graph: WorkflowStudioGraph;
  pending: WorkflowStudioCanvasPendingConnection | null;
  targetId: string;
}): WorkflowStudioCanvasConnectionResult {
  const eligibility = workflowStudioCanvasTargetEligibility({ graph, pending, targetId });
  if (!eligibility.eligible || !pending) {
    return {
      success: false,
      message: eligibility.message ?? "The connection is unavailable.",
    };
  }
  return {
    success: true,
    command: {
      type: "connect_nodes",
      source: pending.sourceId,
      target: targetId,
      ...(pending.condition === null ? {} : { condition: pending.condition }),
    },
  };
}
