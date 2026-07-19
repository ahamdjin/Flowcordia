import {
  flowcordiaCredentialEnvironmentName,
  validateFlowcordiaCredentialReferences,
} from "@flowcordia/workflow";
import type { WorkflowStudioNode } from "./presentation";

export type WorkflowStudioCredentialReferencesDraft =
  | { kind: "editable"; references: string[] }
  | { kind: "blocked"; message: string };

export type WorkflowStudioCredentialReferencesResult =
  | { success: true; references: string[] }
  | { success: false; message: string };

export interface WorkflowStudioCredentialBindingProjection {
  reference: string;
  environmentName: string;
}

export function createWorkflowStudioCredentialReferencesDraft(
  node: WorkflowStudioNode
): WorkflowStudioCredentialReferencesDraft {
  if (node.operation !== "action.http") {
    return {
      kind: "blocked",
      message: "Credential references are currently supported only for HTTP request nodes.",
    };
  }
  if (node.ownership !== "visual") {
    return {
      kind: "blocked",
      message: "Developer-owned credential bindings must be changed in the repository.",
    };
  }
  const issues = validateFlowcordiaCredentialReferences(node.credentialReferences);
  if (issues.length > 0) {
    return {
      kind: "blocked",
      message: `${issues[0]!.message} Preserve this existing binding in code until it is migrated.`,
    };
  }
  return { kind: "editable", references: [...node.credentialReferences] };
}

export function buildWorkflowStudioCredentialReferences(
  references: readonly string[]
): WorkflowStudioCredentialReferencesResult {
  const normalized = references.map((reference) => reference.trim());
  const issue = validateFlowcordiaCredentialReferences(normalized)[0];
  if (issue) return { success: false, message: issue.message };
  return { success: true, references: normalized };
}

export function projectWorkflowStudioCredentialBindings(
  references: readonly string[]
): WorkflowStudioCredentialBindingProjection[] {
  return references.map((reference) => ({
    reference,
    environmentName: flowcordiaCredentialEnvironmentName(reference),
  }));
}
