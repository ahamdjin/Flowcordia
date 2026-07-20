import type { FlowcordiaConnectedAcceptanceEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/contract";
import { writeBoundedFlowcordiaAcceptanceEvidence } from "./evidence-boundary";

const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|policyId|installationId|workerId|databaseId|provider|stack|rawError/i;

export async function writeFlowcordiaConnectedAcceptanceEvidence(
  path: string,
  evidence: FlowcordiaConnectedAcceptanceEvidence
): Promise<void> {
  await writeBoundedFlowcordiaAcceptanceEvidence({
    boundary: "Connected",
    path,
    evidence,
    forbiddenKey: FORBIDDEN_KEY,
  });
}
