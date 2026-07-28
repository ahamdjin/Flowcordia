import { z } from "zod";
import { WorkflowStudioTemplateIdCommand } from "./command-contract";

const WorkflowFastCreateEntityId = z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/);
const WorkflowFastCreatePosition = z
  .object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
  })
  .strict();

export const WorkflowAddConnectedNodeCommand = z
  .object({
    type: z.literal("add_connected_node"),
    templateId: WorkflowStudioTemplateIdCommand,
    position: WorkflowFastCreatePosition,
    source: WorkflowFastCreateEntityId,
    condition: z.enum(["true", "false"]).optional(),
    name: z.string().min(1).max(160).optional(),
  })
  .strict();

export const WorkflowInsertNodeOnEdgeCommand = z
  .object({
    type: z.literal("insert_node_on_edge"),
    templateId: WorkflowStudioTemplateIdCommand,
    position: WorkflowFastCreatePosition,
    edgeId: WorkflowFastCreateEntityId,
    name: z.string().min(1).max(160).optional(),
  })
  .strict();
