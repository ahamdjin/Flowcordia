import type { WorkflowEditCommand } from "@flowcordia/workflow";
import type { WorkflowDraftPasteSubgraphCommand } from "../drafts/types";

export const FLOWCORDIA_NODE_CLIPBOARD_TYPE = "application/x-flowcordia-workflow-nodes+json";
const ENTITY_ID = /^[a-z][a-z0-9_-]{1,127}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const POSITIVE_VERSION = /^[1-9][0-9]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_SELECTION = 100;

export interface WorkflowStudioNodeClipboardPayload {
  version: 2;
  workflowId: string;
  draftPublicId: string;
  draftVersion: string;
  documentSha256: string;
  nodeIds: string[];
}

function uniqueNodeIds(nodeIds: readonly string[]): string[] {
  return [...new Set(nodeIds.filter((nodeId) => ENTITY_ID.test(nodeId)))].slice(0, MAX_SELECTION);
}

export function nextWorkflowStudioDuplicateOffset(input: {
  currentStep: number;
  distance: number;
  cycle?: number;
}): { step: number; offset: { x: number; y: number } } {
  const cycle = Number.isInteger(input.cycle) && input.cycle! > 0 ? input.cycle! : 5;
  const distance = Number.isFinite(input.distance) && input.distance > 0 ? input.distance : 40;
  const currentStep =
    Number.isInteger(input.currentStep) && input.currentStep >= 0 ? input.currentStep : 0;
  const step = (currentStep % cycle) + 1;
  const value = step * distance;
  return { step, offset: { x: value, y: value } };
}

export function createWorkflowStudioNodeClipboardPayload(input: {
  workflowId: string;
  draftPublicId: string;
  draftVersion: string;
  documentSha256: string;
  nodeIds: readonly string[];
}): WorkflowStudioNodeClipboardPayload | null {
  if (
    !WORKFLOW_ID.test(input.workflowId) ||
    !ENTITY_ID.test(input.draftPublicId) ||
    !POSITIVE_VERSION.test(input.draftVersion) ||
    !SHA256.test(input.documentSha256)
  ) {
    return null;
  }
  const nodeIds = uniqueNodeIds(input.nodeIds);
  if (nodeIds.length === 0) return null;
  return {
    version: 2,
    workflowId: input.workflowId,
    draftPublicId: input.draftPublicId,
    draftVersion: input.draftVersion,
    documentSha256: input.documentSha256,
    nodeIds,
  };
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
    if (
      Object.keys(record).some(
        (key) =>
          ![
            "version",
            "workflowId",
            "draftPublicId",
            "draftVersion",
            "documentSha256",
            "nodeIds",
          ].includes(key)
      )
    ) {
      return null;
    }
    if (
      record.version !== 2 ||
      typeof record.workflowId !== "string" ||
      typeof record.draftPublicId !== "string" ||
      typeof record.draftVersion !== "string" ||
      typeof record.documentSha256 !== "string"
    ) {
      return null;
    }
    if (
      !WORKFLOW_ID.test(record.workflowId) ||
      !ENTITY_ID.test(record.draftPublicId) ||
      !POSITIVE_VERSION.test(record.draftVersion) ||
      !SHA256.test(record.documentSha256) ||
      !Array.isArray(record.nodeIds)
    ) {
      return null;
    }
    if (
      record.nodeIds.length === 0 ||
      record.nodeIds.length > MAX_SELECTION ||
      record.nodeIds.some((nodeId) => typeof nodeId !== "string" || !ENTITY_ID.test(nodeId))
    ) {
      return null;
    }
    const nodeIds = record.nodeIds as string[];
    if (new Set(nodeIds).size !== nodeIds.length) return null;
    return {
      version: 2,
      workflowId: record.workflowId,
      draftPublicId: record.draftPublicId,
      draftVersion: record.draftVersion,
      documentSha256: record.documentSha256,
      nodeIds: [...nodeIds],
    };
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

export function buildWorkflowStudioCrossWorkflowPasteCommand(input: {
  payload: WorkflowStudioNodeClipboardPayload;
  offset: { x: number; y: number };
}): WorkflowDraftPasteSubgraphCommand | null {
  if (!Number.isFinite(input.offset.x) || !Number.isFinite(input.offset.y)) return null;
  return {
    type: "paste_subgraph",
    sourceWorkflowId: input.payload.workflowId,
    sourceDraftPublicId: input.payload.draftPublicId,
    sourceDraftVersion: input.payload.draftVersion,
    sourceDocumentSha256: input.payload.documentSha256,
    nodeIds: [...input.payload.nodeIds],
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

export function createWorkflowStudioNodeRemovalPlan(input: {
  nodeIds: readonly string[];
  edges: ReadonlyArray<{ source: string; target: string }>;
}): {
  command: Extract<WorkflowEditCommand, { type: "remove_nodes" }>;
  edgeCount: number;
} | null {
  const nodeIds = uniqueNodeIds(input.nodeIds);
  if (nodeIds.length === 0) return null;
  const selected = new Set(nodeIds);
  return {
    command: { type: "remove_nodes", nodeIds },
    edgeCount: input.edges.filter((edge) => selected.has(edge.source) || selected.has(edge.target))
      .length,
  };
}
