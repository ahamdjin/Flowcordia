import type { FlowcordiaPromotionAcceptanceEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/promotion-contract";
import { writeBoundedFlowcordiaAcceptanceEvidence } from "./evidence-boundary";

const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|policyId|installationId|workerId|databaseId|provider|stack|rawError/i;

export async function writeFlowcordiaPromotionAcceptanceEvidence(
  path: string,
  evidence: FlowcordiaPromotionAcceptanceEvidence
): Promise<void> {
  await writeBoundedFlowcordiaAcceptanceEvidence({
    boundary: "Promotion",
    path,
    evidence,
    forbiddenKey: FORBIDDEN_KEY,
  });
}
