import { describe, expect, it } from "vitest";
import { WorkflowDraftCommand } from "./commands.server";

describe("workflow draft history command contract", () => {
  it("accepts exact undo and redo operations", () => {
    expect(
      WorkflowDraftCommand.parse({
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
      WorkflowDraftCommand.parse({
        operation: "redo",
        draftId: "29e695b2-87c0-4c4d-9910-cc5ff9cb8379",
        expectedVersion: "8",
      })
    ).toMatchObject({ operation: "redo" });
  });

  it("rejects browser snapshots and unknown fields", () => {
    expect(
      WorkflowDraftCommand.safeParse({
        operation: "undo",
        draftId: "29e695b2-87c0-4c4d-9910-cc5ff9cb8379",
        expectedVersion: "7",
        document: { nodes: [] },
      }).success
    ).toBe(false);
  });
});
