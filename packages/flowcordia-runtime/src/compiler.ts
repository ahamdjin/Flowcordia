import { serializeWorkflow, type WorkflowDefinition } from "@flowcordia/workflow";
import { analyzeWorkflow } from "./analyze.js";
import type { FlowcordiaCompilationResult } from "./types.js";

function safeIdentifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `workflow_${normalized}`;
}

function importPath(path: string): boolean {
  return (
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    path !== "." &&
    /^(?:\.\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_@.-]+)*$/.test(path)
  );
}

function generatedImportPath(path: string): string {
  return `../../${path.replace(/^\.\//, "")}`;
}

function exportIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function credentialEnvironmentName(reference: string): string {
  return `FLOWCORDIA_CREDENTIAL_${reference.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

export function compileWorkflowToTriggerTask(
  workflow: WorkflowDefinition
): FlowcordiaCompilationResult {
  const analysis = analyzeWorkflow(workflow);
  const issues = [...analysis.issues];
  for (const node of workflow.nodes.filter((candidate) => candidate.operation === "code.task")) {
    if (node.codeReference && !importPath(node.codeReference.path)) {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message: "Code reference paths must be repository-relative and traversal-free.",
      });
    }
    if (node.codeReference && !exportIdentifier(node.codeReference.exportName)) {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message: "Code reference export names must be valid JavaScript identifiers.",
      });
    }
  }
  const credentialEnvironment = new Map<string, string>();
  for (const reference of workflow.nodes.flatMap((node) => node.credentialReferences ?? [])) {
    const environmentName = credentialEnvironmentName(reference);
    if (environmentName === "FLOWCORDIA_CREDENTIAL_") {
      issues.push({
        code: "invalid_configuration",
        message: `Credential reference "${reference}" cannot form an environment binding.`,
      });
    }
    const existing = credentialEnvironment.get(environmentName);
    if (existing && existing !== reference) {
      issues.push({
        code: "invalid_configuration",
        message: `Credential references "${existing}" and "${reference}" map to the same environment binding.`,
      });
    }
    credentialEnvironment.set(environmentName, reference);
  }
  if (issues.length > 0) return { success: false, issues };

  const taskId = `flowcordia-${workflow.id}`;
  const exportName = safeIdentifier(`${workflow.id}Task`);
  const codeNodes = workflow.nodes.filter((node) => node.operation === "code.task");
  const imports = codeNodes.map(
    (node, index) =>
      `import { ${node.codeReference!.exportName} as flowcordiaCode${index} } from ${JSON.stringify(generatedImportPath(node.codeReference!.path))};`
  );
  const handlers = codeNodes.map(
    (node, index) => `${JSON.stringify(node.id)}: flowcordiaCode${index}`
  );
  const credentialBindings = Object.fromEntries(
    Array.from(credentialEnvironment, ([environmentName, reference]) => [
      reference,
      environmentName,
    ])
  );
  const source = [
    `import { metadata, task, wait } from "@trigger.dev/sdk";`,
    `import { createTriggerRuntimeAdapters, executeFlowcordiaWorkflow } from "@flowcordia/runtime";`,
    `import type { WorkflowDefinition, JsonObject, JsonValue } from "@flowcordia/workflow";`,
    ...imports,
    "",
    `const workflow = ${serializeWorkflow(workflow).trim()} as WorkflowDefinition;`,
    `const adapters = createTriggerRuntimeAdapters({`,
    `  codeHandlers: { ${handlers.join(", ")} },`,
    `  wait: async (durationSeconds) => { await wait.for({ seconds: durationSeconds }); },`,
    `  authorizeHttp: (url) => {`,
    `    const allowlist = (process.env.FLOWCORDIA_HTTP_HOST_ALLOWLIST ?? "")`,
    `      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);`,
    `    return url.protocol === "https:" && allowlist.includes(url.hostname.toLowerCase());`,
    `  },`,
    `  resolveCredential: async (reference) => {`,
    `    const bindings: Record<string, string> = ${JSON.stringify(credentialBindings)};`,
    `    const environmentName = bindings[reference];`,
    `    if (!environmentName) throw new Error(\`Credential reference "\${reference}" is not bound.\`);`,
    `    const raw = process.env[environmentName];`,
    `    if (!raw) throw new Error(\`Credential environment "\${environmentName}" is unavailable.\`);`,
    `    const value = JSON.parse(raw) as unknown;`,
    `    if (!value || typeof value !== "object" || Array.isArray(value))`,
    `      throw new Error(\`Credential environment "\${environmentName}" must contain a JSON object.\`);`,
    `    return value as JsonObject;`,
    `  },`,
    `});`,
    "",
    `export const ${exportName} = task({`,
    `  id: ${JSON.stringify(taskId)},`,
    `  run: async (payload: JsonValue) => {`,
    `    const flowcordiaNodeStates: Record<string, { operation: string; status: string }> = {};`,
    `    const result = await executeFlowcordiaWorkflow(workflow, payload, adapters, {`,
    `      onTrace: async (trace) => {`,
    `        flowcordiaNodeStates[trace.nodeId] = {`,
    `          operation: trace.operation,`,
    `          status: trace.status,`,
    `        };`,
    `        metadata.set("flowcordia", {`,
    `          schemaVersion: "0.1",`,
    `          workflowId: workflow.id,`,
    `          nodes: flowcordiaNodeStates,`,
    `          updatedAt: new Date().toISOString(),`,
    `        });`,
    `      },`,
    `    });`,
    `    if (!result.success) throw new Error(result.traces.at(-1)?.message ?? "Flowcordia workflow failed.");`,
    `    return result.output;`,
    `  },`,
    `});`,
    "",
  ].join("\n");
  const triggerOperations = workflow.nodes
    .filter((node) => node.kind === "trigger")
    .map((node) => node.operation);
  return {
    success: true,
    artifact: {
      workflowId: workflow.id,
      taskId,
      exportName,
      source,
      orderedNodeIds: analysis.orderedNodeIds,
      triggerOperations,
      warnings: triggerOperations
        .filter((operation) => operation !== "trigger.manual")
        .map(
          (operation) =>
            `${operation} requires a deployment binding before it can receive production events.`
        ),
    },
  };
}
