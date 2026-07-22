export const FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION =
  "ACTIVATE_EXACT_FLOWCORDIA_PRODUCTION_WEBHOOK" as const;

export type FlowcordiaWebhookActivationCommand = Record<string, string> & {
  operation: "activate_webhook";
  confirmation: typeof FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION;
  workflowId: string;
  nodeId: string;
  expectedProposalId: string;
  expectedMergeCommitSha: string;
};

export interface FlowcordiaWebhookActivationResponse {
  ok: boolean;
  status?: "activated" | "unchanged";
  endpoint?: {
    publicId: string;
    revision: number;
    fingerprint: string;
    nodeId: string;
    method: string;
    path: string;
    taskIdentifier: string;
    workerVersion: string;
    mergeCommitSha: string;
  };
  error?: string;
  message?: string;
  retryable?: boolean;
}

export function buildFlowcordiaWebhookActivationCommand(input: {
  workflowId: string;
  nodeId: string;
  expectedProposalId: string;
  expectedMergeCommitSha: string;
}): FlowcordiaWebhookActivationCommand {
  return {
    operation: "activate_webhook",
    confirmation: FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION,
    workflowId: input.workflowId,
    nodeId: input.nodeId,
    expectedProposalId: input.expectedProposalId,
    expectedMergeCommitSha: input.expectedMergeCommitSha,
  };
}
