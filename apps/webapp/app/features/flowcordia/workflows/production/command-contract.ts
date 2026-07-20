import type { JsonValue } from "@flowcordia/workflow";

export const FLOWCORDIA_PRODUCTION_CONFIRMATION = "RUN_FLOWCORDIA_PRODUCTION_PROOF" as const;

export interface FlowcordiaProductionRunCommand {
  operation: "run_production";
  confirmation: typeof FLOWCORDIA_PRODUCTION_CONFIRMATION;
  workflowId: string;
  expectedProposalId: string;
  expectedMergeCommitSha: string;
  requestId: string;
  payload: JsonValue;
}

export function buildFlowcordiaProductionRunCommand(input: {
  workflowId: string;
  expectedProposalId: string;
  expectedMergeCommitSha: string;
  requestId: string;
  payload: JsonValue;
}): FlowcordiaProductionRunCommand {
  return {
    operation: "run_production",
    confirmation: FLOWCORDIA_PRODUCTION_CONFIRMATION,
    workflowId: input.workflowId,
    expectedProposalId: input.expectedProposalId,
    expectedMergeCommitSha: input.expectedMergeCommitSha,
    requestId: input.requestId,
    payload: input.payload,
  };
}
