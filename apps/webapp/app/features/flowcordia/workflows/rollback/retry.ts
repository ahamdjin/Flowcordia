export function isAbandonedFlowcordiaRollbackAttempt(input: {
  branchExists: boolean;
  pullRequests: readonly { state: "open" | "closed"; merged: boolean }[];
}): boolean {
  if (!input.branchExists && input.pullRequests.length === 0) return true;
  return (
    input.pullRequests.length === 1 &&
    input.pullRequests[0]?.state === "closed" &&
    input.pullRequests[0].merged === false
  );
}
