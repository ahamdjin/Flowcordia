import {
  flowcordiaCredentialEnvironmentName,
  validateFlowcordiaCredentialReferences,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import { compileWorkflowToTriggerTask } from "./compiler.js";
import type { FlowcordiaCompilationResult } from "./types.js";

function studioV2CredentialBindings(workflow: WorkflowDefinition): {
  bindings: Record<string, string>;
  issues: Extract<FlowcordiaCompilationResult, { success: false }>["issues"];
} {
  const bindings: Record<string, string> = {};
  const issues: Extract<FlowcordiaCompilationResult, { success: false }>["issues"] = [];

  for (const node of workflow.nodes) {
    const references = node.credentialReferences ?? [];
    for (const issue of validateFlowcordiaCredentialReferences(references)) {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message: issue.message,
      });
    }
    if (references.length === 0) continue;
    if (node.operation !== "action.http" && node.operation !== "code.typescript") {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message: "Credential references are supported only for HTTP and TypeScript Source nodes.",
      });
      continue;
    }
    for (const reference of references) {
      bindings[reference] = flowcordiaCredentialEnvironmentName(reference);
    }
  }

  return { bindings, issues };
}

function compilerInput(workflow: WorkflowDefinition): WorkflowDefinition {
  const cloned = JSON.parse(JSON.stringify(workflow)) as WorkflowDefinition;
  for (const node of cloned.nodes) {
    if (node.operation === "code.typescript") node.credentialReferences = [];
  }
  return cloned;
}

function injectStudioV2RuntimeMetadata(source: string, bindings: Record<string, string>): string {
  const bindingPattern = /const bindings: Record<string, string> = \{[^;]*\};/;
  if (!bindingPattern.test(source)) {
    throw new Error("Generated Flowcordia task source is missing its credential binding boundary.");
  }
  const withBindings = source.replace(
    bindingPattern,
    `const bindings: Record<string, string> = ${JSON.stringify(bindings)};`
  );
  const traceMarker = "      onTrace: async (trace) => {";
  if (!withBindings.includes(traceMarker)) {
    throw new Error("Generated Flowcordia task source is missing its execution metadata boundary.");
  }
  return withBindings.replace(
    traceMarker,
    `      environment: "production",\n      runId: ctx.run.id,\n${traceMarker}`
  );
}

export function compileStudioV2WorkflowToTriggerTask(
  workflow: WorkflowDefinition
): FlowcordiaCompilationResult {
  const credentialState = studioV2CredentialBindings(workflow);
  if (credentialState.issues.length > 0) {
    return { success: false, issues: credentialState.issues };
  }

  const compiled = compileWorkflowToTriggerTask(compilerInput(workflow));
  if (!compiled.success) return compiled;

  return {
    success: true,
    artifact: {
      ...compiled.artifact,
      source: injectStudioV2RuntimeMetadata(compiled.artifact.source, credentialState.bindings),
    },
  };
}
