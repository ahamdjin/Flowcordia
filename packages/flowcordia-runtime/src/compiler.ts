import { createHash } from "node:crypto";
import {
  exactFlowcordiaActivepiecesPieceVersion,
  flowcordiaCredentialEnvironmentName,
  isFlowcordiaActivepiecesPieceNode,
  isWorkflowCodeExportName,
  isWorkflowCodeReferencePath,
  parseFlowcordiaActivepiecesPieceConfiguration,
  parseFlowcordiaApiTriggerConfiguration,
  parseFlowcordiaHttpConfiguration,
  serializeWorkflow,
  validateFlowcordiaCredentialReferences,
  validateFlowcordiaExecutionPolicy,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowcordia/workflow";
import { analyzeWorkflow } from "./analyze.js";
import type { FlowcordiaCompilationResult } from "./types.js";

function hasRuntimePolicy(node: WorkflowNode): boolean {
  const runtime = node.runtime;
  return (
    runtime !== undefined &&
    (runtime.queue !== undefined ||
      runtime.concurrencyKey !== undefined ||
      runtime.machine !== undefined ||
      runtime.maxDurationSeconds !== undefined ||
      runtime.retry !== undefined)
  );
}

function activepiecesConnectionEnvironmentName(externalId: string): string {
  const digest = createHash("sha256").update(externalId).digest("hex").slice(0, 40).toUpperCase();
  return `FLOWCORDIA_AP_CONNECTION_${digest}`;
}

function safeIdentifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `workflow_${normalized}`;
}

function generatedImportPath(path: string): string {
  return `../../${path.replace(/^\.\//, "")}`;
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
  const unsupportedCredentialNodes = new Set(
    analysis.issues
      .filter((issue) => issue.code === "unsupported_operation" && issue.nodeId)
      .map((issue) => issue.nodeId!)
  );
  for (const node of workflow.nodes) {
    const references = node.credentialReferences ?? [];
    if (references.length === 0 || unsupportedCredentialNodes.has(node.id)) continue;
    if (isFlowcordiaActivepiecesPieceNode(node)) continue;
    if (node.operation !== "action.http") {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message: "Credential references are currently supported only for HTTP request nodes.",
      });
      continue;
    }
    const referenceIssues = validateFlowcordiaCredentialReferences(references);
    for (const issue of referenceIssues) {
      issues.push({ code: "invalid_configuration", nodeId: node.id, message: issue.message });
    }
    if (referenceIssues.length > 0) continue;
    for (const reference of references) {
      const environmentName = flowcordiaCredentialEnvironmentName(reference);
      const existing = credentialEnvironment.get(environmentName);
      if (existing && existing !== reference) {
        issues.push({
          code: "invalid_configuration",
          nodeId: node.id,
          message: `Credential references "${existing}" and "${reference}" map to the same environment binding.`,
        });
      }
      credentialEnvironment.set(environmentName, reference);
    }
  }
  const triggerNode = workflow.nodes.find((node) => node.kind === "trigger");
  for (const node of workflow.nodes) {
    if (node.kind !== "trigger" && hasRuntimePolicy(node)) {
      issues.push({
        code: "invalid_configuration",
        nodeId: node.id,
        message:
          "Execution policy is supported only on the trigger, where it applies to the whole workflow run.",
      });
    }
  }
  const runtimePolicy = triggerNode?.runtime;
  for (const issue of validateFlowcordiaExecutionPolicy(runtimePolicy)) {
    issues.push({
      code: "invalid_configuration",
      nodeId: triggerNode?.id,
      message: issue.message,
    });
  }
  const retryPolicy = runtimePolicy?.retry;
  if (issues.length > 0) return { success: false, issues };

  const generatedWorkflow = JSON.parse(JSON.stringify(workflow)) as WorkflowDefinition;
  for (const node of generatedWorkflow.nodes) {
    if (node.operation !== "action.http") continue;
    const parsed = parseFlowcordiaHttpConfiguration(node.configuration);
    if (parsed.success) node.configuration = parsed.configuration;
  }

  const scheduleTrigger = workflow.nodes.find((node) => node.operation === "trigger.schedule");
  const activepiecesTriggerNode = workflow.nodes.find(
    (node) => node.kind === "trigger" && node.operation === "activepieces.piece.trigger"
  );
  const parsedActivepiecesTrigger = activepiecesTriggerNode
    ? parseFlowcordiaActivepiecesPieceConfiguration(activepiecesTriggerNode)
    : null;
  const activepiecesTriggerConfiguration =
    parsedActivepiecesTrigger?.success === true &&
    parsedActivepiecesTrigger.configuration.stepType === "trigger"
      ? parsedActivepiecesTrigger.configuration
      : null;
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
  const activepiecesConnectionBindings = Object.fromEntries(
    Array.from(
      new Set(
        workflow.nodes
          .filter((node) => isFlowcordiaActivepiecesPieceNode(node))
          .flatMap((node) => node.credentialReferences ?? [])
      )
    ).map((externalId) => [externalId, activepiecesConnectionEnvironmentName(externalId)])
  );
  const hasActivepiecesNodes = workflow.nodes.some((node) =>
    isFlowcordiaActivepiecesPieceNode(node)
  );
  const hasSubflowNodes = workflow.nodes.some((node) => node.operation === "subflow.invoke");
  const hasApprovalNodes = workflow.nodes.some((node) => node.operation === "approval.human");
  const baseTaskImports = scheduleTrigger
    ? validationTaskId
      ? "metadata, schedules, task, wait"
      : "metadata, schedules, wait"
    : "metadata, task, wait";
  const taskImports = hasSubflowNodes ? `batch, ${baseTaskImports}` : baseTaskImports;
  const taskFactory = scheduleTrigger ? "schedules.task" : "task";
  const taskConfiguration = scheduleTrigger
    ? [
        `  cron: {`,
        `    pattern: ${JSON.stringify(String(scheduleTrigger.configuration.cron).trim())},`,
        `    timezone: ${JSON.stringify(String(scheduleTrigger.configuration.timezone).trim())},`,
        `    environments: ["PRODUCTION"],`,
        `  },`,
      ]
    : [];
  const executionConfiguration = [
    ...(runtimePolicy?.queue !== undefined
      ? [`  queue: { name: ${JSON.stringify(runtimePolicy.queue)} },`]
      : []),
    ...(runtimePolicy?.machine !== undefined
      ? [`  machine: ${JSON.stringify(runtimePolicy.machine)},`]
      : []),
    ...(runtimePolicy?.maxDurationSeconds !== undefined
      ? [`  maxDuration: ${runtimePolicy.maxDurationSeconds},`]
      : []),
  ];
  const retryConfiguration = retryPolicy
    ? [
        `  retry: {`,
        ...(retryPolicy.maxAttempts !== undefined
          ? [`    maxAttempts: ${retryPolicy.maxAttempts},`]
          : []),
        ...(retryPolicy.minTimeoutMs !== undefined
          ? [`    minTimeoutInMs: ${retryPolicy.minTimeoutMs},`]
          : []),
        ...(retryPolicy.maxTimeoutMs !== undefined
          ? [`    maxTimeoutInMs: ${retryPolicy.maxTimeoutMs},`]
          : []),
        ...(retryPolicy.factor !== undefined ? [`    factor: ${retryPolicy.factor},`] : []),
        `    randomize: true,`,
        `  },`,
      ]
    : [];
  const runParameter = scheduleTrigger ? "payload, { ctx }" : "payload: JsonValue, { ctx }";
  const runtimePayload = scheduleTrigger
    ? [
        `    const adapters = createAdapters(ctx.run.id);`,
        `    const flowcordiaPayload = JSON.parse(JSON.stringify(payload)) as JsonValue;`,
        `    const result = await executeFlowcordiaWorkflow(workflow, flowcordiaPayload, adapters, {`,
      ]
    : [
        `    const adapters = createAdapters(ctx.run.id);`,
        `    const result = await executeFlowcordiaWorkflow(workflow, payload, adapters, {`,
      ];
  const source = [
    `import { ${taskImports} } from "@trigger.dev/sdk";`,
    ...(hasActivepiecesNodes
      ? [
          `import { formulaEvaluator as activepiecesFormulaEvaluator } from "@activepieces/core-formula";`,
        ]
      : []),
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
    `const workflow = ${serializeWorkflow(generatedWorkflow).trim()} as WorkflowDefinition;`,
    ...(validationTaskId
      ? [
          `const flowcordiaValidationDefinitions: Record<string, FlowcordiaFunctionValidationDefinition> = {`,
          ...validationDefinitions,
          `};`,
          "",
        ]
      : []),
    `const createAdapters = (flowcordiaRunId: string) => createTriggerRuntimeAdapters({`,
    `  codeHandlers: { ${handlers.join(", ")} },`,
    ...(hasActivepiecesNodes
      ? [
          `  loadActivepiecesPiece: async (packageName) => import(packageName) as Promise<Record<string, unknown>>,`,
          `  activepiecesFormulaEvaluator,`,
          `  activepiecesRunId: flowcordiaRunId,`,
          `  resolveActivepiecesConnection: async (externalId) => {`,
          `    const bindings: Record<string, string> = ${JSON.stringify(activepiecesConnectionBindings)};`,
          `    const environmentName = bindings[externalId];`,
          `    if (!environmentName) throw new Error(\`Activepieces connection "\${externalId}" is not bound.\`);`,
          `    const raw = process.env[environmentName];`,
          `    if (!raw) throw new Error(\`Activepieces connection environment "\${environmentName}" is unavailable.\`);`,
          `    return JSON.parse(raw) as unknown;`,
          `  },`,
        ]
      : []),
    ...(hasApprovalNodes
      ? [
          `  approval: async ({ node, configuration }) => {`,
          `    const token = await wait.createToken({`,
          `      timeout: \`\${configuration.timeoutSeconds}s\`,`,
          `      idempotencyKey: \`flowcordia-approval:\${workflow.id}:\${flowcordiaRunId}:\${node.id}\`,`,
          `      idempotencyKeyTTL: \`\${Math.min(configuration.timeoutSeconds + 86400, 2678400)}s\`,`,
          `      tags: ["flowcordia:approval"],`,
          `    });`,
          `    const timeoutAt = new Date(Date.now() + configuration.timeoutSeconds * 1000).toISOString();`,
          `    const reminderAt = configuration.reminderAfterSeconds === null`,
          `      ? null`,
          `      : new Date(Date.now() + configuration.reminderAfterSeconds * 1000).toISOString();`,
          `    const escalationAt = configuration.escalationAfterSeconds === null`,
          `      ? null`,
          `      : new Date(Date.now() + configuration.escalationAfterSeconds * 1000).toISOString();`,
          `    metadata.set("flowcordiaApproval", {`,
          `      schemaVersion: "0.2",`,
          `      state: "WAITING",`,
          `      waitpointId: token.id,`,
          `      workflowId: workflow.id,`,
          `      runId: flowcordiaRunId,`,
          `      nodeId: node.id,`,
          `      prompt: configuration.prompt,`,
          `      instruction: configuration.instruction,`,
          `      requireComment: configuration.requireComment,`,
          `      reminderAt,`,
          `      escalationAt,`,
          `      timeoutAt,`,
          `    });`,
          `    const completed = await wait.forToken<{ decision: "approved" | "rejected"; comment: string | null; decidedAt: string }>(token.id);`,
          `    if (!completed.ok) throw new Error("Human approval timed out before a decision was recorded.");`,
          `    metadata.set("flowcordiaApproval", {`,
          `      schemaVersion: "0.1",`,
          `      state: "DECIDED",`,
          `      waitpointId: token.id,`,
          `      workflowId: workflow.id,`,
          `      runId: flowcordiaRunId,`,
          `      nodeId: node.id,`,
          `      decision: completed.output.decision,`,
          `      decidedAt: completed.output.decidedAt,`,
          `    });`,
          `    return JSON.parse(JSON.stringify(completed.output)) as JsonValue;`,
          `  },`,
        ]
      : []),
    ...(hasSubflowNodes
      ? [
          `  invokeSubflow: async ({ taskId, payloads }) => {`,
          `    const result = await batch.triggerAndWait(payloads.map((payload) => ({ id: taskId, payload })));`,
          `    return result.runs.map((run) => {`,
          `      if (!run.ok) throw new Error(\`Flowcordia subflow "\${taskId}" failed.\`);`,
          `      return JSON.parse(JSON.stringify(run.output ?? null)) as JsonValue;`,
          `    });`,
          `  },`,
        ]
      : []),
    `  wait: async (durationSeconds) => { await wait.for({ seconds: durationSeconds }); },`,
    `  authorizeHttp: (url) => {`,
    `    const origins = new Set((process.env.FLOWCORDIA_HTTP_ORIGIN_ALLOWLIST ?? "")`,
    `      .split(",").map((origin) => origin.trim().toLowerCase().replace(/\/$/, "")).filter(Boolean));`,
    `    const legacyHosts = new Set((process.env.FLOWCORDIA_HTTP_HOST_ALLOWLIST ?? "")`,
    `      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));`,
    `    const legacyStandardHttps = url.protocol === "https:" && url.port === ""`,
    `      && legacyHosts.has(url.hostname.toLowerCase());`,
    `    return url.protocol === "https:"`,
    `      && (origins.has(url.origin.toLowerCase()) || legacyStandardHttps);`,
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
    `export const ${exportName} = ${taskFactory}({`,
    `  id: ${JSON.stringify(taskId)},`,
    ...taskConfiguration,
    ...executionConfiguration,
    ...retryConfiguration,
    `  run: async (${runParameter}) => {`,
    `    const flowcordiaNodeStates: Record<string, { operation: string; status: string }> = {};`,
    ...runtimePayload,
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
    ...(activepiecesTriggerConfiguration
      ? [
          "",
          `export const ${safeIdentifier(`${workflow.id}ActivepiecesScheduleTask`)} = task({`,
          `  id: ${JSON.stringify(`${taskId}-activepieces-schedule`)},`,
          `  queue: { concurrencyLimit: 1 },`,
          `  retry: { maxAttempts: 3 },`,
          `  run: async (_payload: unknown, { ctx }) => {`,
          `    const origin = process.env.APP_ORIGIN;`,
          `    const token = process.env.TRIGGER_SECRET_KEY;`,
          `    if (!origin || !token) throw new Error("Activepieces production schedule connector requires APP_ORIGIN and TRIGGER_SECRET_KEY.");`,
          `    const response = await fetch(new URL(${JSON.stringify(`/api/v1/flowcordia/activepieces/production-schedules/${taskId}-activepieces-schedule`)}, origin), {`,
          `      method: "POST",`,
          `      headers: { authorization: \`Bearer \${token}\`, "content-type": "application/json" },`,
          `      body: JSON.stringify({ runId: ctx.run.id }),`,
          `      redirect: "error",`,
          `    });`,
          `    if (!response.ok) throw new Error(\`Activepieces production schedule connector failed with HTTP \${response.status}.\`);`,
          `    return await response.json();`,
          `  },`,
          `});`,
        ]
      : []),
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
  const apiTriggerNode = workflow.nodes.find((node) => node.operation === "trigger.api");
  const parsedApiTrigger = apiTriggerNode
    ? parseFlowcordiaApiTriggerConfiguration(apiTriggerNode.configuration)
    : null;
  const apiTriggerConfiguration =
    parsedApiTrigger?.success === true ? parsedApiTrigger.configuration : null;
  const activepiecesTriggerBinding =
    activepiecesTriggerNode && activepiecesTriggerConfiguration
      ? {
          kind: "activepieces" as const,
          nodeId: activepiecesTriggerNode.id,
          taskId,
          scheduleTaskId: `${taskId}-activepieces-schedule`,
          pieceName: activepiecesTriggerConfiguration.settings.pieceName,
          pieceVersion: exactFlowcordiaActivepiecesPieceVersion(
            activepiecesTriggerConfiguration.settings.pieceVersion
          ),
          triggerName: activepiecesTriggerConfiguration.settings.triggerName!,
          input: activepiecesTriggerConfiguration.settings.input,
          propertySettings: activepiecesTriggerConfiguration.settings.propertySettings,
        }
      : null;
  const triggerBinding =
    activepiecesTriggerBinding ??
    (apiTriggerConfiguration
      ? {
          kind: "authenticated_api" as const,
          method: "POST" as const,
          path: `/api/v1/tasks/${encodeURIComponent(taskId)}/trigger`,
          authentication: "project_access_token" as const,
          request: {
            payloadField: "payload" as const,
            optionsField: "options" as const,
            idempotency: {
              keyPath: "options.idempotencyKey" as const,
              required: apiTriggerConfiguration.requireIdempotencyKey,
              ttlPath: "options.idempotencyKeyTTL" as const,
              ttl: `${apiTriggerConfiguration.idempotencyKeyTTLSeconds}s`,
              scope: "task_environment" as const,
            },
            queueTTL: {
              path: "options.ttl" as const,
              value: `${apiTriggerConfiguration.queueTTLSeconds}s`,
              semantics: "expire_before_start" as const,
            },
          },
        }
      : null);
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
      triggerBinding,
      warnings: triggerOperations
        .filter(
          (operation) =>
            operation !== "trigger.manual" &&
            operation !== "trigger.api" &&
            operation !== "trigger.schedule" &&
            operation !== "activepieces.piece.trigger"
        )
        .map(
          (operation) =>
            `${operation} requires a deployment binding before it can receive production events.`
        ),
    },
  };
}
