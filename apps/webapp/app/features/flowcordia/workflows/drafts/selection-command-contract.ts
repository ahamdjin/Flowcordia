import { z } from "zod";

const WorkflowSelectionEntityId = z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/);
const WorkflowSelectionPosition = z
  .object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
  })
  .strict();

const UniqueWorkflowSelectionEntityIds = z
  .array(WorkflowSelectionEntityId)
  .min(1)
  .max(100)
  .refine((nodeIds) => new Set(nodeIds).size === nodeIds.length, {
    message: "Node IDs must be unique.",
  });

const WorkflowSelectionMove = z
  .object({
    nodeId: WorkflowSelectionEntityId,
    position: WorkflowSelectionPosition,
  })
  .strict();

export const WorkflowMoveNodesCommand = z
  .object({
    type: z.literal("move_nodes"),
    moves: z
      .array(WorkflowSelectionMove)
      .min(1)
      .max(100)
      .refine((moves) => new Set(moves.map((move) => move.nodeId)).size === moves.length, {
        message: "Each node can move only once per command.",
      }),
  })
  .strict();

export const WorkflowDuplicateSubgraphCommand = z
  .object({
    type: z.literal("duplicate_subgraph"),
    nodeIds: UniqueWorkflowSelectionEntityIds,
    offset: WorkflowSelectionPosition,
  })
  .strict();

export const WorkflowRemoveNodesCommand = z
  .object({
    type: z.literal("remove_nodes"),
    nodeIds: UniqueWorkflowSelectionEntityIds,
  })
  .strict();
