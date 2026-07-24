import {
  proposalClosureIdentityState,
  type ProposalClosureIdentity,
  type WorkflowProposalAggregate,
} from "@flowcordia/control-plane";

export interface FlowcordiaPreviewClosureProof {
  state: "NOT_RECORDED" | "INVALID" | "WAITING" | "READY";
  schemaVersion: string | null;
  digest: string | null;
  expectedCount: number;
  installedCount: number;
  missingWorkflowIds: string[];
}

export function flowcordiaClosureTaskIdentifier(workflowId: string): string {
  return `flowcordia-${workflowId}`;
}

export function resolveFlowcordiaPreviewClosureExpectation(
  proposal: Pick<
    WorkflowProposalAggregate,
    "workflowId" | "closureSchemaVersion" | "closureDigest" | "closureWorkflowIds"
  >
):
  | { success: true; identity: ProposalClosureIdentity; taskIdentifiers: string[] }
  | { success: false; proof: FlowcordiaPreviewClosureProof } {
  const closure = proposalClosureIdentityState(proposal);
  if (closure.state !== "RECORDED") {
    return {
      success: false,
      proof: {
        state: closure.state,
        schemaVersion: proposal.closureSchemaVersion,
        digest: proposal.closureDigest,
        expectedCount: proposal.closureWorkflowIds.length,
        installedCount: 0,
        missingWorkflowIds: [],
      },
    };
  }
  return {
    success: true,
    identity: closure.identity,
    taskIdentifiers: closure.identity.workflowIds.map(flowcordiaClosureTaskIdentifier),
  };
}

export function evaluateFlowcordiaPreviewClosureInstallation(input: {
  proposal: Pick<
    WorkflowProposalAggregate,
    "workflowId" | "closureSchemaVersion" | "closureDigest" | "closureWorkflowIds"
  >;
  installedTaskIdentifiers: readonly string[];
}): FlowcordiaPreviewClosureProof {
  const expected = resolveFlowcordiaPreviewClosureExpectation(input.proposal);
  if (!expected.success) return expected.proof;
  const counts = new Map<string, number>();
  for (const identifier of input.installedTaskIdentifiers) {
    if (!expected.taskIdentifiers.includes(identifier)) continue;
    counts.set(identifier, (counts.get(identifier) ?? 0) + 1);
  }
  if ([...counts.values()].some((count) => count > 1)) {
    return {
      state: "INVALID",
      schemaVersion: expected.identity.schemaVersion,
      digest: expected.identity.digest,
      expectedCount: expected.identity.workflowIds.length,
      installedCount: [...counts.values()].filter((count) => count === 1).length,
      missingWorkflowIds: [],
    };
  }
  const missingWorkflowIds = expected.identity.workflowIds.filter(
    (workflowId) => counts.get(flowcordiaClosureTaskIdentifier(workflowId)) !== 1
  );
  return {
    state: missingWorkflowIds.length === 0 ? "READY" : "WAITING",
    schemaVersion: expected.identity.schemaVersion,
    digest: expected.identity.digest,
    expectedCount: expected.identity.workflowIds.length,
    installedCount: expected.identity.workflowIds.length - missingWorkflowIds.length,
    missingWorkflowIds,
  };
}
