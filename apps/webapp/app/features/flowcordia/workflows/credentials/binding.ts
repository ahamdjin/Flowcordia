import type { WorkflowStudioGraph, WorkflowStudioNode } from "../studio/presentation";
import type { FlowcordiaCredentialType } from "./contract";

export type FlowcordiaCredentialBindingValidation =
  | { success: true; credentialType: FlowcordiaCredentialType }
  | {
      success: false;
      code:
        | "workflow_mismatch"
        | "node_not_found"
        | "node_not_supported"
        | "credential_type_mismatch"
        | "reference_not_bound"
        | "reference_type_conflict";
      message: string;
    };

export function flowcordiaCredentialTypeForNode(
  node: Pick<WorkflowStudioNode, "operation" | "ownership">
): FlowcordiaCredentialType | null {
  if (node.ownership !== "visual") return null;
  if (node.operation === "action.http") return "http_headers";
  if (node.operation === "trigger.webhook") return "webhook_hmac";
  return null;
}

function credentialTypesForReference(
  graph: WorkflowStudioGraph,
  reference: string
): Set<FlowcordiaCredentialType> {
  const types = new Set<FlowcordiaCredentialType>();
  for (const node of graph.nodes) {
    if (!node.credentialReferences.includes(reference)) continue;
    const type = flowcordiaCredentialTypeForNode(node);
    if (type) types.add(type);
  }
  return types;
}

export function validateFlowcordiaCredentialBinding(input: {
  graph: WorkflowStudioGraph;
  workflowId: string;
  nodeId: string;
  reference: string;
  credentialType: FlowcordiaCredentialType;
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
  const expectedType = flowcordiaCredentialTypeForNode(node);
  if (!expectedType) {
    return {
      success: false,
      code: "node_not_supported",
      message: "Credentials can be stored only for reviewed visual HTTP or webhook nodes.",
    };
  }
  if (expectedType !== input.credentialType) {
    return {
      success: false,
      code: "credential_type_mismatch",
      message: "Credential type does not match this workflow node operation.",
    };
  }
  if (!node.credentialReferences.includes(input.reference)) {
    return {
      success: false,
      code: "reference_not_bound",
      message: "The credential reference is not bound to this exact workflow node.",
    };
  }
  if (credentialTypesForReference(input.graph, input.reference).size > 1) {
    return {
      success: false,
      code: "reference_type_conflict",
      message:
        "The same credential reference cannot be shared by HTTP-header and webhook-HMAC nodes.",
    };
  }
  return { success: true, credentialType: expectedType };
}
