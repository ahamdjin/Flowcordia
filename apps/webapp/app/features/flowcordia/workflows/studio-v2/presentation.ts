import type { WorkflowDefinition, WorkflowNode } from "@flowcordia/workflow";
import { MarkerType, type Edge, type Node } from "@xyflow/react";

export interface StudioV2CanvasNodeData extends Record<string, unknown> {
  node: WorkflowNode;
  label: string;
  operation: string;
}

export type StudioV2CanvasNode = Node<StudioV2CanvasNodeData, "studio-v2">;
export type StudioV2CanvasEdge = Edge;

export interface StudioV2CanvasGraph {
  nodes: StudioV2CanvasNode[];
  edges: StudioV2CanvasEdge[];
}

export function studioV2NodeLabel(node: WorkflowNode): string {
  return node.name?.trim() || node.operation;
}

export function buildStudioV2CanvasGraph(workflow: WorkflowDefinition): StudioV2CanvasGraph {
  return {
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: "studio-v2",
      position: node.position,
      data: {
        node,
        label: studioV2NodeLabel(node),
        operation: node.operation,
      },
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      type: "smoothstep",
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.condition,
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  };
}

export function studioV2SelectedNode(
  workflow: WorkflowDefinition,
  selectedNodeId: string | null
): WorkflowNode | null {
  if (!selectedNodeId) return null;
  return workflow.nodes.find((node) => node.id === selectedNodeId) ?? null;
}
