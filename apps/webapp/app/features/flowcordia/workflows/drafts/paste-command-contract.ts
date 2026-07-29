import { z } from "zod";

const EntityId = z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/);
const WorkflowId = z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/);
const PositiveVersion = z.string().regex(/^[1-9][0-9]*$/);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Position = z
  .object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
  })
  .strict();

export const WorkflowPasteSubgraphCommand = z
  .object({
    type: z.literal("paste_subgraph"),
    sourceWorkflowId: WorkflowId,
    sourceDraftPublicId: EntityId,
    sourceDraftVersion: PositiveVersion,
    sourceDocumentSha256: Sha256,
    nodeIds: z
      .array(EntityId)
      .min(1)
      .max(100)
      .refine((nodeIds) => new Set(nodeIds).size === nodeIds.length, {
        message: "Node IDs must be unique.",
      }),
    offset: Position,
  })
  .strict();
