import type { FlowcordiaRollbackAcceptanceEvidence } from "../../apps/webapp/app/features/flowcordia/acceptance/rollback-contract";
import { writeBoundedFlowcordiaAcceptanceEvidence } from "./evidence-boundary";

const FORBIDDEN_KEY =
  /payload|output|cookie|token|secret|password|authorization|storageState|headers|actor|correlation|policyId|installationId|workerId|databaseId|provider|stack|rawError|reason/i;

export async function writeFlowcordiaRollbackAcceptanceEvidence(
  path: string,
  evidence: FlowcordiaRollbackAcceptanceEvidence
): Promise<void> {
  await writeBoundedFlowcordiaAcceptanceEvidence({
    boundary: "Rollback",
    path,
    evidence,
    forbiddenKey: FORBIDDEN_KEY,
  });
}
