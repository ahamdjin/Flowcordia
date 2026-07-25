import type { WorkflowEditCommand } from "@flowcordia/workflow";
import { workflowStudioCanvasTargetEligibility } from "./canvas-connections";
import type { WorkflowStudioGraph } from "./presentation";

export type WorkflowStudioCanvasEdge = WorkflowStudioGraph["edges"][number];
export type WorkflowStudioCanvasEdgeCondition = "true" | "false" | null;

export interface WorkflowStudioCanvasEdgeOption {
  id: string;
  label: string;
  eligible: boolean;
  message: string | null;
}

export interface WorkflowStudioCanvasEdgeConditionOption {
  condition: WorkflowStudioCanvasEdgeCondition;
  label: string;
  eligible: boolean;
  message: string | null;
}

export type WorkflowStudioCanvasReplaceEdgeResult =
  | {
      success: true;
      command: Extract<WorkflowEditCommand, { type: "replace_edge" }>;
    }
  | { success: false; message: string };

function edgeById(
  graph: WorkflowStudioGraph,
  edgeId: string
): WorkflowStudioCanvasEdge | undefined {
  return graph.edges.find((edge) => edge.id === edgeId);
}

function nodeName(graph: WorkflowStudioGraph, nodeId: string): string {
  return graph.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}

function graphWithoutEdge(graph: WorkflowStudioGraph, edgeId: string): WorkflowStudioGraph {
  return { ...graph, edges: graph.edges.filter((edge) => edge.id !== edgeId) };
}

function sourceConditionOptions(
  graph: WorkflowStudioGraph,
  edge: WorkflowStudioCanvasEdge
): readonly WorkflowStudioCanvasEdgeCondition[] {
  const source = graph.nodes.find((node) => node.id === edge.source);
  return source?.operation === "control.condition" ? ["true", "false"] : [null];
}

export function workflowStudioCanvasEdgeLabel(graph: WorkflowStudioGraph, edgeId: string): string {
  const edge = edgeById(graph, edgeId);
  if (!edge) return `Unknown connection ${edgeId}`;
  const branch = edge.condition ? ` on the ${edge.condition} branch` : "";
  return `${nodeName(graph, edge.source)} connects to ${nodeName(graph, edge.target)}${branch}`;
}

export function orderedWorkflowStudioCanvasEdgeIds(graph: WorkflowStudioGraph): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
  return [...graph.edges]
    .sort((left, right) => {
      const leftSource = nodes.get(left.source) ?? { x: 0, y: 0 };
      const rightSource = nodes.get(right.source) ?? { x: 0, y: 0 };
      const leftTarget = nodes.get(left.target) ?? { x: 0, y: 0 };
      const rightTarget = nodes.get(right.target) ?? { x: 0, y: 0 };
      return (
        leftSource.y - rightSource.y ||
        leftSource.x - rightSource.x ||
        leftTarget.y - rightTarget.y ||
        leftTarget.x - rightTarget.x ||
        left.id.localeCompare(right.id)
      );
    })
    .map((edge) => edge.id);
}

export function workflowStudioCanvasEdgeConditionOptions(input: {
  graph: WorkflowStudioGraph;
  edgeId: string;
  targetId: string;
}): WorkflowStudioCanvasEdgeConditionOption[] {
  const edge = edgeById(input.graph, input.edgeId);
  if (!edge) return [];
  const editableGraph = graphWithoutEdge(input.graph, input.edgeId);
  return sourceConditionOptions(input.graph, edge).map((condition) => {
    const eligibility = workflowStudioCanvasTargetEligibility({
      graph: editableGraph,
      pending: { sourceId: edge.source, condition },
      targetId: input.targetId,
    });
    return {
      condition,
      label: condition === null ? "Ordinary connection" : `${condition} branch`,
      eligible: eligibility.eligible,
      message: eligibility.message,
    };
  });
}

export function workflowStudioCanvasEdgeTargetOptions(input: {
  graph: WorkflowStudioGraph;
  edgeId: string;
  condition: WorkflowStudioCanvasEdgeCondition;
}): WorkflowStudioCanvasEdgeOption[] {
  const edge = edgeById(input.graph, input.edgeId);
  if (!edge) return [];
  const editableGraph = graphWithoutEdge(input.graph, input.edgeId);
  return input.graph.nodes.map((node) => {
    const eligibility = workflowStudioCanvasTargetEligibility({
      graph: editableGraph,
      pending: { sourceId: edge.source, condition: input.condition },
      targetId: node.id,
    });
    return {
      id: node.id,
      label: `${node.name} (${node.id})`,
      eligible: eligibility.eligible,
      message: eligibility.message,
    };
  });
}

export function buildWorkflowStudioCanvasReplaceEdgeCommand(input: {
  graph: WorkflowStudioGraph;
  edgeId: string;
  targetId: string;
  condition: WorkflowStudioCanvasEdgeCondition;
}): WorkflowStudioCanvasReplaceEdgeResult {
  const edge = edgeById(input.graph, input.edgeId);
  if (!edge) return { success: false, message: "The selected connection no longer exists." };
  const editableGraph = graphWithoutEdge(input.graph, input.edgeId);
  const eligibility = workflowStudioCanvasTargetEligibility({
    graph: editableGraph,
    pending: { sourceId: edge.source, condition: input.condition },
    targetId: input.targetId,
  });
  if (!eligibility.eligible) {
    return {
      success: false,
      message: eligibility.message ?? "The selected connection replacement is unavailable.",
    };
  }
  return {
    success: true,
    command: {
      type: "replace_edge",
      edgeId: edge.id,
      target: input.targetId,
      ...(input.condition === null ? {} : { condition: input.condition }),
    },
  };
}
