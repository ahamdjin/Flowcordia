import type { WorkflowEditCommand } from "@flowcordia/workflow";

export const FLOWCORDIA_NODE_CLIPBOARD_TYPE = "application/x-flowcordia-workflow-nodes+json";
const ENTITY_ID = /^[a-z][a-z0-9_-]{1,127}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const MAX_SELECTION = 100;

export interface WorkflowStudioNodeClipboardPayload {
  version: 1;
  workflowId: string;
  nodeIds: string[];
}

function uniqueNodeIds(nodeIds: readonly string[]): string[] {
  return [...new Set(nodeIds.filter((nodeId) => ENTITY_ID.test(nodeId)))].slice(0, MAX_SELECTION);
}

export function createWorkflowStudioNodeClipboardPayload(input: {
  workflowId: string;
  nodeIds: readonly string[];
}): WorkflowStudioNodeClipboardPayload | null {
  if (!WORKFLOW_ID.test(input.workflowId)) return null;
  const nodeIds = uniqueNodeIds(input.nodeIds);
  if (nodeIds.length === 0) return null;
  return { version: 1, workflowId: input.workflowId, nodeIds };
}

export function serializeWorkflowStudioNodeClipboardPayload(
  payload: WorkflowStudioNodeClipboardPayload
): string {
  return JSON.stringify(payload);
}

export function parseWorkflowStudioNodeClipboardPayload(
  value: string
): WorkflowStudioNodeClipboardPayload | null {
  try {
    const candidate = JSON.parse(value) as unknown;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["version", "workflowId", "nodeIds"].includes(key))) {
      return null;
    }
    if (record.version !== 1 || typeof record.workflowId !== "string") return null;
    if (!WORKFLOW_ID.test(record.workflowId) || !Array.isArray(record.nodeIds)) return null;
    if (
      record.nodeIds.length === 0 ||
      record.nodeIds.length > MAX_SELECTION ||
      record.nodeIds.some((nodeId) => typeof nodeId !== "string" || !ENTITY_ID.test(nodeId))
    ) {
      return null;
    }
    const nodeIds = record.nodeIds as string[];
    if (new Set(nodeIds).size !== nodeIds.length) return null;
    return { version: 1, workflowId: record.workflowId, nodeIds: [...nodeIds] };
  } catch {
    return null;
  }
}

export function buildWorkflowStudioDuplicateCommand(input: {
  nodeIds: readonly string[];
  offset: { x: number; y: number };
}): Extract<WorkflowEditCommand, { type: "duplicate_subgraph" }> | null {
  const nodeIds = uniqueNodeIds(input.nodeIds);
  if (
    nodeIds.length === 0 ||
    !Number.isFinite(input.offset.x) ||
    !Number.isFinite(input.offset.y)
  ) {
    return null;
  }
  return {
    type: "duplicate_subgraph",
    nodeIds,
    offset: { x: input.offset.x, y: input.offset.y },
  };
}

export function buildWorkflowStudioMoveNodesCommand(
  moves: ReadonlyArray<{ nodeId: string; position: { x: number; y: number } }>
): Extract<WorkflowEditCommand, { type: "move_nodes" }> | null {
  if (moves.length === 0 || moves.length > MAX_SELECTION) return null;
  if (
    new Set(moves.map((move) => move.nodeId)).size !== moves.length ||
    moves.some(
      (move) =>
        !ENTITY_ID.test(move.nodeId) ||
        !Number.isFinite(move.position.x) ||
        !Number.isFinite(move.position.y)
    )
  ) {
    return null;
  }
  return {
    type: "move_nodes",
    moves: moves.map((move) => ({
      nodeId: move.nodeId,
      position: { x: move.position.x, y: move.position.y },
    })),
  };
}
