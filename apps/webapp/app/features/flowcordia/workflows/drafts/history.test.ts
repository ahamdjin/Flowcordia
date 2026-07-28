import { describe, expect, it } from "vitest";
import {
  nextWorkflowDraftEditHistory,
  targetWorkflowDraftHistoryRevision,
  workflowDraftHistoryAvailability,
} from "./history";

describe("workflow draft history transitions", () => {
  it("reports undo and redo availability from the durable cursor", () => {
    expect(workflowDraftHistoryAvailability({ cursor: 1n, max: 1n })).toEqual({
      canUndo: false,
      canRedo: false,
    });
    expect(workflowDraftHistoryAvailability({ cursor: 2n, max: 4n })).toEqual({
      canUndo: true,
      canRedo: true,
    });
    expect(workflowDraftHistoryAvailability({ cursor: 4n, max: 4n })).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });

  it("advances new edits and invalidates the redo branch", () => {
    expect(nextWorkflowDraftEditHistory({ cursor: 2n, max: 5n })).toEqual({
      cursor: 3n,
      max: 3n,
      pruneAfter: 2n,
    });
  });

  it("resolves bounded undo and redo targets", () => {
    expect(
      targetWorkflowDraftHistoryRevision({
        state: { cursor: 3n, max: 5n },
        direction: "undo",
      })
    ).toBe(2n);
    expect(
      targetWorkflowDraftHistoryRevision({
        state: { cursor: 3n, max: 5n },
        direction: "redo",
      })
    ).toBe(4n);
    expect(
      targetWorkflowDraftHistoryRevision({
        state: { cursor: 1n, max: 5n },
        direction: "undo",
      })
    ).toBeNull();
    expect(
      targetWorkflowDraftHistoryRevision({
        state: { cursor: 5n, max: 5n },
        direction: "redo",
      })
    ).toBeNull();
  });
});
