import { describe, expect, it } from "vitest";
import {
  nextWorkflowDraftEditHistory,
  targetWorkflowDraftHistoryRevision,
  workflowDraftHistoryAvailability,
} from "./history";

describe("workflow draft history transitions", () => {
  it("reports undo and redo availability from the retained durable range", () => {
    expect(workflowDraftHistoryAvailability({ min: 1n, cursor: 1n, max: 1n })).toEqual({
      canUndo: false,
      canRedo: false,
    });
    expect(workflowDraftHistoryAvailability({ min: 2n, cursor: 3n, max: 5n })).toEqual({
      canUndo: true,
      canRedo: true,
    });
    expect(workflowDraftHistoryAvailability({ min: 3n, cursor: 3n, max: 5n })).toEqual({
      canUndo: false,
      canRedo: true,
    });
    expect(workflowDraftHistoryAvailability({ min: 2n, cursor: 5n, max: 5n })).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });

  it("advances new edits and invalidates the redo branch", () => {
    expect(nextWorkflowDraftEditHistory({ min: 1n, cursor: 2n, max: 5n })).toEqual({
      min: 1n,
      cursor: 3n,
      max: 3n,
      pruneBefore: 1n,
      pruneAfter: 2n,
      prunedRevisionCount: 3n,
    });
  });

  it("keeps at most the configured number of restorable revisions", () => {
    expect(nextWorkflowDraftEditHistory({ min: 1n, cursor: 200n, max: 200n })).toEqual({
      min: 2n,
      cursor: 201n,
      max: 201n,
      pruneBefore: 2n,
      pruneAfter: 200n,
      prunedRevisionCount: 1n,
    });
    expect(nextWorkflowDraftEditHistory({ min: 42n, cursor: 80n, max: 80n }, 20n)).toEqual({
      min: 62n,
      cursor: 81n,
      max: 81n,
      pruneBefore: 62n,
      pruneAfter: 80n,
      prunedRevisionCount: 20n,
    });
  });

  it("rejects a non-positive retention window", () => {
    expect(() => nextWorkflowDraftEditHistory({ min: 1n, cursor: 1n, max: 1n }, 0n)).toThrow(
      "retention must be positive"
    );
  });

  it("resolves undo and redo targets within the retained range", () => {
    expect(
      targetWorkflowDraftHistoryRevision({
        state: { min: 2n, cursor: 3n, max: 5n },
        direction: "undo",
      })
    ).toBe(2n);
    expect(
      targetWorkflowDraftHistoryRevision({
        state: { min: 2n, cursor: 3n, max: 5n },
        direction: "redo",
      })
    ).toBe(4n);
    expect(
      targetWorkflowDraftHistoryRevision({
        state: { min: 3n, cursor: 3n, max: 5n },
        direction: "undo",
      })
    ).toBeNull();
    expect(
      targetWorkflowDraftHistoryRevision({
        state: { min: 2n, cursor: 5n, max: 5n },
        direction: "redo",
      })
    ).toBeNull();
  });
});
