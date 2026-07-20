export interface FlowcordiaRollbackCandidate {
  proposalId: string;
  headSha: string;
  mergeCommitSha: string;
  pullRequestNumber: number;
}

export interface FlowcordiaRollbackBaseIdentity {
  commitSha: string;
  blobSha: string;
}

export interface FlowcordiaRollbackProjection {
  state: "UNAVAILABLE" | "NOT_AVAILABLE" | "READY";
  message: string;
  current: FlowcordiaRollbackCandidate | null;
  candidates: FlowcordiaRollbackCandidate[];
  base: FlowcordiaRollbackBaseIdentity | null;
}

export function unavailableFlowcordiaRollback(): FlowcordiaRollbackProjection {
  return {
    state: "UNAVAILABLE",
    message: "Rollback history or the current repository base is temporarily unavailable.",
    current: null,
    candidates: [],
    base: null,
  };
}

export function presentFlowcordiaRollback(input: {
  current: FlowcordiaRollbackCandidate | null;
  candidates: FlowcordiaRollbackCandidate[];
  base: FlowcordiaRollbackBaseIdentity | null;
}): FlowcordiaRollbackProjection {
  if (!input.current || input.candidates.length === 0) {
    return {
      state: "NOT_AVAILABLE",
      message: input.current
        ? "No earlier distinct governed workflow version is available for rollback."
        : "The current branch workflow does not match a merged governed proposal.",
      current: input.current,
      candidates: [],
      base: input.base,
    };
  }
  if (!input.base) return unavailableFlowcordiaRollback();
  return {
    state: "READY",
    message:
      "Create a new governed proposal that restores one earlier reviewed workflow version. Nothing is merged or deployed automatically.",
    current: input.current,
    candidates: input.candidates,
    base: input.base,
  };
}
