import type { WorkflowStudioGraph } from "../studio/presentation";

export type FlowcordiaCredentialBindingValidation =
  | { success: true }
  | {
      success: false;
      code: "workflow_mismatch" | "node_not_found" | "node_not_supported" | "reference_not_bound";
      message: string;
    };

export function validateFlowcordiaCredentialBinding(input: {
  graph: WorkflowStudioGraph;
  workflowId: string;
  nodeId: string;
  reference: string;
}): FlowcordiaCredentialBindingValidation {
  if (input.graph.workflowId !== input.workflowId) {
    return {
      success: false,
      code: "workflow_mismatch",
      message: "Credential workflow identity does not match the selected workflow.",
    };
  }
  const node = input.graph.nodes.find((candidate) => candidate.id === input.nodeId);
  if (!node) {
    return {
      success: false,
      code: "node_not_found",
      message: "Credential node is not available in the selected workflow.",
    };
  }
  if (node.operation !== "action.http" || node.ownership !== "visual") {
    return {
      success: false,
      code: "node_not_supported",
      message: "Credentials can be stored only for a reviewed visual HTTP node.",
    };
  }
  if (!node.credentialReferences.includes(input.reference)) {
    return {
      success: false,
      code: "reference_not_bound",
      message: "The credential reference is not bound to this exact workflow node.",
    };
  }
  return { success: true };
}
