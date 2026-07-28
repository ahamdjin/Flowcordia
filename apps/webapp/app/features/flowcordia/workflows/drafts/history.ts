export interface WorkflowDraftHistoryState {
  cursor: bigint;
  max: bigint;
}

export type WorkflowDraftHistoryDirection = "undo" | "redo";

export function workflowDraftHistoryAvailability(state: WorkflowDraftHistoryState): {
  canUndo: boolean;
  canRedo: boolean;
} {
  return {
    canUndo: state.cursor > 1n,
    canRedo: state.cursor < state.max,
  };
}

export function nextWorkflowDraftEditHistory(state: WorkflowDraftHistoryState): {
  cursor: bigint;
  max: bigint;
  pruneAfter: bigint;
} {
  const cursor = state.cursor + 1n;
  return { cursor, max: cursor, pruneAfter: state.cursor };
}

export function targetWorkflowDraftHistoryRevision(input: {
  state: WorkflowDraftHistoryState;
  direction: WorkflowDraftHistoryDirection;
}): bigint | null {
  if (input.direction === "undo") {
    return input.state.cursor > 1n ? input.state.cursor - 1n : null;
  }
  return input.state.cursor < input.state.max ? input.state.cursor + 1n : null;
}
