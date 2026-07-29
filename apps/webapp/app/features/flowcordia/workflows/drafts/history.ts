export const WORKFLOW_DRAFT_HISTORY_RETENTION = 200n;

export interface WorkflowDraftHistoryState {
  min: bigint;
  cursor: bigint;
  max: bigint;
}

export type WorkflowDraftHistoryDirection = "undo" | "redo";

export function workflowDraftHistoryAvailability(state: WorkflowDraftHistoryState): {
  canUndo: boolean;
  canRedo: boolean;
} {
  return {
    canUndo: state.cursor > state.min,
    canRedo: state.cursor < state.max,
  };
}

export function nextWorkflowDraftEditHistory(
  state: WorkflowDraftHistoryState,
  retention: bigint = WORKFLOW_DRAFT_HISTORY_RETENTION
): {
  min: bigint;
  cursor: bigint;
  max: bigint;
  pruneBefore: bigint;
  pruneAfter: bigint;
  prunedRevisionCount: bigint;
} {
  if (retention < 1n) throw new Error("Workflow draft history retention must be positive.");

  const cursor = state.cursor + 1n;
  const min = state.min > cursor - retention + 1n ? state.min : cursor - retention + 1n;
  const normalizedMin = min < 1n ? 1n : min;
  const redoPruned = state.max > state.cursor ? state.max - state.cursor : 0n;
  const oldestPruned = normalizedMin > state.min ? normalizedMin - state.min : 0n;

  return {
    min: normalizedMin,
    cursor,
    max: cursor,
    pruneBefore: normalizedMin,
    pruneAfter: state.cursor,
    prunedRevisionCount: redoPruned + oldestPruned,
  };
}

export function targetWorkflowDraftHistoryRevision(input: {
  state: WorkflowDraftHistoryState;
  direction: WorkflowDraftHistoryDirection;
}): bigint | null {
  if (input.direction === "undo") {
    return input.state.cursor > input.state.min ? input.state.cursor - 1n : null;
  }
  return input.state.cursor < input.state.max ? input.state.cursor + 1n : null;
}
