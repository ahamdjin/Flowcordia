import { describe, expect, it } from "vitest";
import { WorkflowDraftRedoCommand, WorkflowDraftUndoCommand } from "./history-command-contract";

describe("workflow draft history command contract", () => {
  it("accepts exact undo and redo operations", () => {
    expect(
      WorkflowDraftUndoCommand.parse({
        operation: "undo",
        draftId: "29e695b2-87c0-4c4d-9910-cc5ff9cb8379",
        expectedVersion: "7",
      })
    ).toEqual({
      operation: "undo",
      draftId: "29e695b2-87c0-4c4d-9910-cc5ff9cb8379",
      expectedVersion: "7",
    });
    expect(
      WorkflowDraftRedoCommand.parse({
        operation: "redo",
        draftId: "29e695b2-87c0-4c4d-9910-cc5ff9cb8379",
        expectedVersion: "8",
      })
    ).toMatchObject({ operation: "redo" });
  });

  it("rejects browser snapshots and unknown fields", () => {
    expect(
      WorkflowDraftUndoCommand.safeParse({
        operation: "undo",
        draftId: "29e695b2-87c0-4c4d-9910-cc5ff9cb8379",
        expectedVersion: "7",
        document: { nodes: [] },
      }).success
    ).toBe(false);
  });
});
