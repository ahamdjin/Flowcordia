import type { FlowcordiaPrivateBetaEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/private-beta-contract";
import { writeBoundedFlowcordiaAcceptanceEvidence } from "./evidence-boundary";

const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|email|userId|actor|correlation|policyId|installationId|workerId|databaseId|provider|stack|rawError/i;

export async function writeFlowcordiaPrivateBetaEvidence(
  path: string,
  evidence: FlowcordiaPrivateBetaEvidence
): Promise<void> {
  await writeBoundedFlowcordiaAcceptanceEvidence({
    boundary: "Private beta author",
    path,
    evidence,
    forbiddenKey: FORBIDDEN_KEY,
  });
}
