import type { FlowcordiaProductionAcceptanceEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/production-contract";
import { writeBoundedFlowcordiaAcceptanceEvidence } from "./evidence-boundary";

const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|policyId|installationId|workerId|databaseId|provider|stack|rawError/i;

export async function writeFlowcordiaProductionAcceptanceEvidence(
  path: string,
  evidence: FlowcordiaProductionAcceptanceEvidence
): Promise<void> {
  await writeBoundedFlowcordiaAcceptanceEvidence({
    boundary: "Production",
    path,
    evidence,
    forbiddenKey: FORBIDDEN_KEY,
  });
}
