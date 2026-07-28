import { z } from "zod";

const PositiveVersion = z.string().regex(/^[1-9][0-9]*$/);

export const WorkflowDraftUndoCommand = z
  .object({
    operation: z.literal("undo"),
    draftId: z.string().uuid(),
    expectedVersion: PositiveVersion,
  })
  .strict();

export const WorkflowDraftRedoCommand = z
  .object({
    operation: z.literal("redo"),
    draftId: z.string().uuid(),
    expectedVersion: PositiveVersion,
  })
  .strict();
