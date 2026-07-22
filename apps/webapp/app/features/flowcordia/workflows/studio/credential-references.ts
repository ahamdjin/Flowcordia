import {
  flowcordiaCredentialEnvironmentName,
  flowcordiaWebhookHmacEnvironmentName,
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

function supportsCredentialReferences(node: WorkflowStudioNode): boolean {
  return node.operation === "action.http" || node.operation === "trigger.webhook";
}

export function createWorkflowStudioCredentialReferencesDraft(
  node: WorkflowStudioNode
): WorkflowStudioCredentialReferencesDraft {
  if (!supportsCredentialReferences(node)) {
    return {
      kind: "blocked",
      message:
        "Credential references are supported only for HTTP request and webhook trigger nodes.",
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
  if (node.operation === "trigger.webhook" && node.credentialReferences.length > 1) {
    return {
      kind: "blocked",
      message: "A webhook trigger may bind exactly one HMAC credential reference.",
    };
  }
  return { kind: "editable", references: [...node.credentialReferences] };
}

export function buildWorkflowStudioCredentialReferences(
  references: readonly string[],
  operation: WorkflowStudioNode["operation"] = "action.http"
): WorkflowStudioCredentialReferencesResult {
  const normalized = references.map((reference) => reference.trim());
  const issue = validateFlowcordiaCredentialReferences(normalized)[0];
  if (issue) return { success: false, message: issue.message };
  if (operation === "trigger.webhook" && normalized.length > 1) {
    return {
      success: false,
      message: "A webhook trigger may bind at most one HMAC credential reference.",
    };
  }
  return { success: true, references: normalized };
}

export function projectWorkflowStudioCredentialBindings(
  references: readonly string[],
  operation: WorkflowStudioNode["operation"] = "action.http"
): WorkflowStudioCredentialBindingProjection[] {
  return references.map((reference) => ({
    reference,
    environmentName:
      operation === "trigger.webhook"
        ? flowcordiaWebhookHmacEnvironmentName(reference)
        : flowcordiaCredentialEnvironmentName(reference),
  }));
}
