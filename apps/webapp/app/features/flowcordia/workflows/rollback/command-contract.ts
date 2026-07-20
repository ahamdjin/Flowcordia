export const FLOWCORDIA_ROLLBACK_CONFIRMATION = "CREATE_FLOWCORDIA_ROLLBACK_PROPOSAL" as const;

export interface FlowcordiaRollbackCommand extends Record<string, string> {
  operation: "create_rollback";
  confirmation: typeof FLOWCORDIA_ROLLBACK_CONFIRMATION;
  workflowId: string;
  targetProposalId: string;
  expectedTargetHeadSha: string;
  expectedTargetMergeCommitSha: string;
  expectedCurrentProposalId: string;
  expectedCurrentHeadSha: string;
  expectedCurrentMergeCommitSha: string;
  expectedBaseCommitSha: string;
  expectedBaseBlobSha: string;
  reason: string;
  retryFailedIntent: "false" | "true";
}

export interface FlowcordiaRollbackObserveCommand extends Record<string, string> {
  operation: "observe_rollback";
  workflowId: string;
  attemptProposalId: string;
}

export function buildFlowcordiaRollbackCommand(input: {
  workflowId: string;
  targetProposalId: string;
  expectedTargetHeadSha: string;
  expectedTargetMergeCommitSha: string;
  expectedCurrentProposalId: string;
  expectedCurrentHeadSha: string;
  expectedCurrentMergeCommitSha: string;
  expectedBaseCommitSha: string;
  expectedBaseBlobSha: string;
  reason: string;
  retryFailedIntent?: boolean;
}): FlowcordiaRollbackCommand {
  return {
    operation: "create_rollback",
    confirmation: FLOWCORDIA_ROLLBACK_CONFIRMATION,
    workflowId: input.workflowId,
    targetProposalId: input.targetProposalId,
    expectedTargetHeadSha: input.expectedTargetHeadSha,
    expectedTargetMergeCommitSha: input.expectedTargetMergeCommitSha,
    expectedCurrentProposalId: input.expectedCurrentProposalId,
    expectedCurrentHeadSha: input.expectedCurrentHeadSha,
    expectedCurrentMergeCommitSha: input.expectedCurrentMergeCommitSha,
    expectedBaseCommitSha: input.expectedBaseCommitSha,
    expectedBaseBlobSha: input.expectedBaseBlobSha,
    reason: input.reason,
    retryFailedIntent: input.retryFailedIntent ? "true" : "false",
  };
}

export function resumeFlowcordiaRollbackCommand(
  command: FlowcordiaRollbackCommand,
  retryFailedIntent: boolean
): FlowcordiaRollbackCommand {
  return {
    ...command,
    retryFailedIntent: retryFailedIntent ? "true" : "false",
  };
}

export function buildFlowcordiaRollbackObserveCommand(input: {
  workflowId: string;
  attemptProposalId: string;
}): FlowcordiaRollbackObserveCommand {
  return {
    operation: "observe_rollback",
    workflowId: input.workflowId,
    attemptProposalId: input.attemptProposalId,
  };
}
