import {
  isWorkflowCodeExportName,
  isWorkflowCodeReferencePath,
  serializeWorkflow,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowcordia/workflow";
import { analyzeWorkflow } from "./analyze.js";
import type { FlowcordiaCompilationResult } from "./types.js";

function safeIdentifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `workflow_${normalized}`;
}

function generatedImportPath(path: string): string {
  return `../../${path.replace(/^\.\//, "")}`;
}

function credentialEnvironmentName(reference: string): string {
  return `FLOWCORDIA_CREDENTIAL_${reference.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function isTypedFunctionNode(node: WorkflowNode): boolean {
  return (
    typeof node.configuration.functionId === "string" &&
    node.inputSchema !== undefined &&
    node.outputSchema !== undefined
  );
}

function typedFunctionSignature(node: WorkflowNode): string {
  return JSON.stringify({
    codeReference: node.codeReference,
    inputSchema: node.inputSchema,
    outputSchema: node.outputSchema,
  });
}

export function compileWorkflowToTriggerTask(
  workflow: WorkflowDefinition
): FlowcordiaCompilationResult {
  const analysis = analyzeWorkflow(workflow);
  const issues = [...analysis.issues];
  const codeNodes = workflow.nodes.filter((node) => node.operation === "code.task");
  for (const node of codeNodes) {
    if (node.codeReference && !isWorkflowCodeReferencePath(node.codeReference.path)) {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message: "Code reference paths must be repository-relative and traversal-free.",
      });
    }
    if (node.codeReference && !isWorkflowCodeExportName(node.codeReference.exportName)) {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message: "Code reference export names must be valid JavaScript identifiers.",
      });
    }
  }

  const typedNodes = codeNodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => isTypedFunctionNode(node));
  const validationBindings = new Map<string, (typeof typedNodes)[number]>();
  for (const binding of typedNodes) {
    const functionId = String(binding.node.configuration.functionId);
    const existing = validationBindings.get(functionId);
    if (
      existing &&
      typedFunctionSignature(existing.node) !== typedFunctionSignature(binding.node)
    ) {
      issues.push({
        code: "invalid_configuration",
        nodeId: binding.node.id,
        message: `Typed function "${functionId}" has conflicting repository identities or schemas.`,
      });
    } else if (!existing) {
      validationBindings.set(functionId, binding);
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
  const validationTaskId =
    validationBindings.size > 0 ? `flowcordia-validate-${workflow.id}` : null;
  const exportName = safeIdentifier(`${workflow.id}Task`);
  const validationExportName = safeIdentifier(`${workflow.id}ValidationTask`);
  const imports = codeNodes.map(
    (node, index) =>
      `import { ${node.codeReference!.exportName} as flowcordiaCode${index} } from ${JSON.stringify(generatedImportPath(node.codeReference!.path))};`
  );
  const contracts = typedNodes.map(
    ({ index }) =>
      `const flowcordiaCode${index}Contract: FlowcordiaFunctionContract<typeof flowcordiaCode${index}> = flowcordiaCode${index};`
  );
  const wrappers = typedNodes.flatMap(({ index }) => [
    `const flowcordiaCode${index}Handler: FlowcordiaCodeHandler = async (value) =>`,
    `  flowcordiaCode${index}Contract(value as Parameters<typeof flowcordiaCode${index}Contract>[0]);`,
  ]);
  const handlers = codeNodes.map((node, index) =>
    isTypedFunctionNode(node)
      ? `${JSON.stringify(node.id)}: flowcordiaCode${index}Handler`
      : `${JSON.stringify(node.id)}: flowcordiaCode${index}`
  );
  const validationDefinitions = Array.from(validationBindings, ([functionId, { node, index }]) => [
    `  ${JSON.stringify(functionId)}: {`,
    `    inputSchema: ${JSON.stringify(node.inputSchema)} as JsonObject,`,
    `    outputSchema: ${JSON.stringify(node.outputSchema)} as JsonObject,`,
    `    handler: flowcordiaCode${index}Handler,`,
    `  },`,
  ]).flat();
  const credentialBindings = Object.fromEntries(
    Array.from(credentialEnvironment, ([environmentName, reference]) => [
      reference,
      environmentName,
    ])
  );
  const source = [
    `import { metadata, task, wait } from "@trigger.dev/sdk";`,
    validationTaskId
      ? `import { createTriggerRuntimeAdapters, executeFlowcordiaFunctionValidationSuite, executeFlowcordiaWorkflow } from "@flowcordia/runtime";`
      : `import { createTriggerRuntimeAdapters, executeFlowcordiaWorkflow } from "@flowcordia/runtime";`,
    ...(typedNodes.length > 0
      ? [
          `import type { FlowcordiaCodeHandler, FlowcordiaFunctionContract, FlowcordiaFunctionValidationCaseResult, FlowcordiaFunctionValidationDefinition, FlowcordiaFunctionValidationSuite } from "@flowcordia/runtime";`,
        ]
      : []),
    `import type { WorkflowDefinition, JsonObject, JsonValue } from "@flowcordia/workflow";`,
    ...imports,
    "",
    ...contracts,
    ...(contracts.length > 0 ? [""] : []),
    ...wrappers,
    ...(wrappers.length > 0 ? [""] : []),
    `const workflow = ${serializeWorkflow(workflow).trim()} as WorkflowDefinition;`,
    ...(validationTaskId
      ? [
          `const flowcordiaValidationDefinitions: Record<string, FlowcordiaFunctionValidationDefinition> = {`,
          ...validationDefinitions,
          `};`,
          "",
        ]
      : []),
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
    ...(validationTaskId
      ? [
          "",
          `export const ${validationExportName} = task({`,
          `  id: ${JSON.stringify(validationTaskId)},`,
          `  run: async (payload: FlowcordiaFunctionValidationSuite) => {`,
          `    if (!payload || payload.workflowId !== workflow.id)`,
          `      throw new Error("Flowcordia function validation payload does not match this workflow.");`,
          `    const caseStates: FlowcordiaFunctionValidationCaseResult[] = [];`,
          `    const writeMetadata = (identity: { proposalId: string; headSha: string; suiteDigest: string }, status: "RUNNING" | "PASSED" | "FAILED", passedCount: number, failedCount: number, failureCode: string | null = null) => {`,
          `      metadata.set("flowcordiaValidation", {`,
          `        schemaVersion: "0.1",`,
          `        workflowId: workflow.id,`,
          `        proposalId: identity.proposalId,`,
          `        headSha: identity.headSha,`,
          `        suiteDigest: identity.suiteDigest,`,
          `        status,`,
          `        passedCount,`,
          `        failedCount,`,
          `        failureCode,`,
          `        cases: caseStates,`,
          `        updatedAt: new Date().toISOString(),`,
          `      });`,
          `    };`,
          `    const result = await executeFlowcordiaFunctionValidationSuite(`,
          `      payload,`,
          `      flowcordiaValidationDefinitions,`,
          `      {`,
          `        onCase: (caseResult) => {`,
          `          caseStates.push(caseResult);`,
          `          writeMetadata(`,
          `            payload,`,
          `            "RUNNING",`,
          `            caseStates.filter((candidate) => candidate.status === "PASSED").length,`,
          `            caseStates.filter((candidate) => candidate.status === "FAILED").length`,
          `          );`,
          `        },`,
          `      }`,
          `    );`,
          `    writeMetadata(`,
          `      result,`,
          `      result.success ? "PASSED" : "FAILED",`,
          `      result.passedCount,`,
          `      result.failedCount,`,
          `      result.failureCode ?? null`,
          `    );`,
          `    if (!result.success) throw new Error("Flowcordia repository function validation failed.");`,
          `    return result;`,
          `  },`,
          `});`,
        ]
      : []),
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
      validationTaskId,
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
