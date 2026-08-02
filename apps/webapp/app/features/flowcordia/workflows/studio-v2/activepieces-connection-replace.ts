import type { JsonObject, JsonValue, WorkflowDefinition } from "@flowcordia/workflow";

function connectionReference(externalId: string): string {
  return `{{connections['${externalId}']}}`;
}

function rewriteJsonValue(
  value: JsonValue,
  sourceReference: string,
  targetReference: string
): { value: JsonValue; replacements: number } {
  if (typeof value === "string") {
    if (!value.includes(sourceReference)) return { value, replacements: 0 };
    const parts = value.split(sourceReference);
    return {
      value: parts.join(targetReference),
      replacements: Math.max(0, parts.length - 1),
    };
  }
  if (Array.isArray(value)) {
    let replacements = 0;
    const rewritten = value.map((entry) => {
      const result = rewriteJsonValue(entry, sourceReference, targetReference);
      replacements += result.replacements;
      return result.value;
    });
    return { value: rewritten, replacements };
  }
  if (value && typeof value === "object") {
    let replacements = 0;
    const rewritten = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const result = rewriteJsonValue(entry, sourceReference, targetReference);
        replacements += result.replacements;
        return [key, result.value];
      })
    );
    return { value: rewritten, replacements };
  }
  return { value, replacements: 0 };
}

function rewriteJsonObject(
  value: JsonObject,
  sourceReference: string,
  targetReference: string
): { value: JsonObject; replacements: number } {
  const rewritten = rewriteJsonValue(value, sourceReference, targetReference);
  if (!rewritten.value || typeof rewritten.value !== "object" || Array.isArray(rewritten.value)) {
    throw new Error("Activepieces connection replacement produced an invalid workflow configuration.");
  }
  return { value: rewritten.value, replacements: rewritten.replacements };
}

export function replaceStudioV2ActivepiecesConnectionReferences(input: {
  workflow: WorkflowDefinition;
  sourceExternalId: string;
  targetExternalId: string;
}): { workflow: WorkflowDefinition; replacements: number } {
  if (!input.sourceExternalId || !input.targetExternalId) {
    throw new Error("Activepieces connection external ids must be non-empty.");
  }
  if (input.sourceExternalId === input.targetExternalId) {
    throw new Error("Cannot replace an Activepieces connection with itself.");
  }

  const sourceReference = connectionReference(input.sourceExternalId);
  const targetReference = connectionReference(input.targetExternalId);
  let replacements = 0;
  const workflow: WorkflowDefinition = {
    ...input.workflow,
    nodes: input.workflow.nodes.map((node) => {
      const rewritten = rewriteJsonObject(node.configuration, sourceReference, targetReference);
      replacements += rewritten.replacements;
      const credentialReferences = (node.credentialReferences ?? []).map((reference) => {
        if (reference !== input.sourceExternalId) return reference;
        replacements += 1;
        return input.targetExternalId;
      });
      return {
        ...node,
        configuration: rewritten.value,
        credentialReferences: [...new Set(credentialReferences)],
      };
    }),
  };
  return { workflow, replacements };
}
