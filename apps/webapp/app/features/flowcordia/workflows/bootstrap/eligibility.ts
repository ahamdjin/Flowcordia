import type { WorkflowStudioSyncStatus } from "../studio/presentation";

export function canBootstrapFlowcordiaRepository(input: {
  workflowCount: number;
  syncState: WorkflowStudioSyncStatus["state"];
  indexedEntryCount: number;
  observedCommitSha: string | null;
  stale: boolean;
  loadError: boolean;
}): boolean {
  return (
    input.workflowCount === 0 &&
    input.syncState === "IDLE" &&
    input.indexedEntryCount === 0 &&
    Boolean(input.observedCommitSha) &&
    !input.stale &&
    !input.loadError
  );
}
