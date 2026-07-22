export const FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION =
  "CREATE_REPLACEMENT_FLOWCORDIA_WEBHOOK" as const;

export type FlowcordiaWebhookReplacementCommand = Record<string, string> & {
  operation: "replace_revoked_webhook";
  confirmation: typeof FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION;
  workflowId: string;
  nodeId: string;
  expectedRevokedPublicId: string;
};

export interface FlowcordiaWebhookReplacementResponse {
  ok: boolean;
  status?: "created" | "unchanged";
  endpoint?: {
    publicId: string;
    nodeId: string;
    generation: number;
    replacesPublicId: string;
    createdAt: string;
  };
  error?: string;
  message?: string;
  retryable?: boolean;
}

export function buildFlowcordiaWebhookReplacementCommand(input: {
  workflowId: string;
  nodeId: string;
  expectedRevokedPublicId: string;
}): FlowcordiaWebhookReplacementCommand {
  return {
    operation: "replace_revoked_webhook",
    confirmation: FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION,
    workflowId: input.workflowId,
    nodeId: input.nodeId,
    expectedRevokedPublicId: input.expectedRevokedPublicId,
  };
}
