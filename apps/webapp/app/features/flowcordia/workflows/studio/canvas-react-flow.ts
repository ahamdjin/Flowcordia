import type { WorkflowEditCommand } from "@flowcordia/workflow";
import type { Connection } from "@xyflow/react";
import {
  buildWorkflowStudioCanvasConnectionCommand,
  type WorkflowStudioCanvasPendingConnection,
} from "./canvas-connections";
import type { WorkflowStudioGraph } from "./presentation";

type ConnectCommand = Extract<WorkflowEditCommand, { type: "connect_nodes" }>;
type ReplaceEdgeCommand = Extract<WorkflowEditCommand, { type: "replace_edge" }>;

export type WorkflowStudioReactFlowCommandResult<TCommand> =
  | { success: true; command: TCommand }
  | { success: false; message: string };

function conditionFromHandle(handleId: string | null): "true" | "false" | null {
  if (handleId === "true" || handleId === "false") return handleId;
  return null;
}

function pendingConnection(connection: Connection): WorkflowStudioCanvasPendingConnection | null {
  if (!connection.source) return null;
  return {
    sourceId: connection.source,
    condition: conditionFromHandle(connection.sourceHandle),
  };
}

export function buildWorkflowStudioReactFlowConnectionCommand({
  graph,
  connection,
}: {
  graph: WorkflowStudioGraph;
  connection: Connection;
}): WorkflowStudioReactFlowCommandResult<ConnectCommand> {
  if (!connection.source || !connection.target) {
    return { success: false, message: "Choose both a source and a target node." };
  }
  return buildWorkflowStudioCanvasConnectionCommand({
    graph,
    pending: pendingConnection(connection),
    targetId: connection.target,
  });
}

export function buildWorkflowStudioReactFlowReconnectCommand({
  graph,
  edgeId,
  connection,
}: {
  graph: WorkflowStudioGraph;
  edgeId: string;
  connection: Connection;
}): WorkflowStudioReactFlowCommandResult<ReplaceEdgeCommand> {
  const edge = graph.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return { success: false, message: "The selected connection no longer exists." };
  if (!connection.source || connection.source !== edge.source) {
    return {
      success: false,
      message:
        "Flowcordia keeps the source of an existing connection stable. Reconnect its target instead.",
    };
  }
  if (!connection.target) {
    return { success: false, message: "Choose a target node for the connection." };
  }
  if (connection.target === edge.target) {
    return { success: false, message: "The connection already uses that target." };
  }

  const graphWithoutCurrentEdge: WorkflowStudioGraph = {
    ...graph,
    edges: graph.edges.filter((candidate) => candidate.id !== edgeId),
  };
  const result = buildWorkflowStudioCanvasConnectionCommand({
    graph: graphWithoutCurrentEdge,
    pending: {
      sourceId: edge.source,
      condition: edge.condition === "true" || edge.condition === "false" ? edge.condition : null,
    },
    targetId: connection.target,
  });
  if (!result.success) return result;

  return {
    success: true,
    command: {
      type: "replace_edge",
      edgeId,
      target: connection.target,
      ...(edge.condition === "true" || edge.condition === "false"
        ? { condition: edge.condition }
        : {}),
    },
  };
}
