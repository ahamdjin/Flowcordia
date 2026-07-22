import type { FlowcordiaWebhookAcceptanceEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/webhook-production-contract";
import { writeBoundedFlowcordiaAcceptanceEvidence } from "./evidence-boundary";

const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|installation|workerId|databaseId|provider|stack|rawError|url|publicId|deliveryId|runId/i;

export async function writeFlowcordiaWebhookAcceptanceEvidence(
  path: string,
  evidence: FlowcordiaWebhookAcceptanceEvidence
): Promise<void> {
  await writeBoundedFlowcordiaAcceptanceEvidence({
    boundary: "Production webhook",
    path,
    evidence,
    forbiddenKey: FORBIDDEN_KEY,
  });
}
