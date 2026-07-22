import type { ProductionWebhookRevocationReason } from "@flowcordia/control-plane";

export const FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION =
  "REVOKE_EXACT_FLOWCORDIA_PRODUCTION_WEBHOOK" as const;

export const FLOWCORDIA_WEBHOOK_REVOCATION_REASONS = [
  "credential_compromise",
  "unexpected_traffic",
  "workflow_retired",
  "manual_emergency_stop",
] as const satisfies readonly ProductionWebhookRevocationReason[];

export type FlowcordiaWebhookRevocationCommand = Record<string, string> & {
  operation: "revoke_webhook";
  confirmation: typeof FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION;
  workflowId: string;
  nodeId: string;
  expectedPublicId: string;
  reason: ProductionWebhookRevocationReason;
};

export interface FlowcordiaWebhookRevocationResponse {
  ok: boolean;
  status?: "revoked" | "already_revoked";
  endpoint?: {
    publicId: string;
    nodeId: string;
    revokedAt: string;
    reason: ProductionWebhookRevocationReason;
  };
  error?: string;
  message?: string;
  retryable?: boolean;
}

export function buildFlowcordiaWebhookRevocationCommand(input: {
  workflowId: string;
  nodeId: string;
  expectedPublicId: string;
  reason: ProductionWebhookRevocationReason;
}): FlowcordiaWebhookRevocationCommand {
  return {
    operation: "revoke_webhook",
    confirmation: FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION,
    workflowId: input.workflowId,
    nodeId: input.nodeId,
    expectedPublicId: input.expectedPublicId,
    reason: input.reason,
  };
}
