import {
  FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION,
  FLOWCORDIA_ACTIVEPIECES_TRIGGER_OPERATION,
  flowcordiaCredentialEnvironmentName,
  flowcordiaWebhookHmacEnvironmentName,
  type WorkflowDefinition,
} from "@flowcordia/workflow";

export interface StudioV2CredentialRequirement {
  reference: string;
  environmentName: string;
}

export type StudioV2CredentialRequirementResult =
  | { success: true; requirements: StudioV2CredentialRequirement[] }
  | { success: false; reference: string };

export function studioV2CredentialRequirements(
  workflow: WorkflowDefinition
): StudioV2CredentialRequirementResult {
  const requirements = new Map<string, string>();
  for (const node of workflow.nodes) {
    if (
      node.operation === FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION ||
      node.operation === FLOWCORDIA_ACTIVEPIECES_TRIGGER_OPERATION
    ) {
      continue;
    }
    for (const reference of node.credentialReferences ?? []) {
      const environmentName =
        node.operation === "trigger.webhook"
          ? flowcordiaWebhookHmacEnvironmentName(reference)
          : flowcordiaCredentialEnvironmentName(reference);
      const existing = requirements.get(reference);
      if (existing && existing !== environmentName) return { success: false, reference };
      requirements.set(reference, environmentName);
    }
  }

  return {
    success: true,
    requirements: [...requirements]
      .map(([reference, environmentName]) => ({ reference, environmentName }))
      .sort((left, right) => left.reference.localeCompare(right.reference)),
  };
}
