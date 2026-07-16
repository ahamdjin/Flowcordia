import {
  validateWorkflow,
  type JsonObject,
  type JsonValue,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowcordia/workflow";
import { analyzeWorkflow } from "./analyze.js";
import type {
  FlowcordiaExecuteOptions,
  FlowcordiaExecutionResult,
  FlowcordiaRuntimeAdapters,
  FlowcordiaTriggerRuntimeOptions,
} from "./types.js";

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

function valueAtPath(value: JsonValue, path: string): JsonValue | undefined {
  if (!path) return value;
  let current: JsonValue | undefined = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function conditionMatches(configuration: JsonObject, value: JsonValue): boolean {
  const candidate = valueAtPath(value, String(configuration.path ?? ""));
  switch (configuration.operator) {
    case "equals":
      return JSON.stringify(candidate) === JSON.stringify(configuration.value);
    case "not_equals":
      return JSON.stringify(candidate) !== JSON.stringify(configuration.value);
    case "exists":
      return candidate !== undefined;
    default:
      return false;
  }
}

function inputForNode(
  workflow: WorkflowDefinition,
  node: WorkflowNode,
  payload: JsonValue,
  outputs: ReadonlyMap<string, JsonValue>
): JsonValue {
  const sources = workflow.edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => edge.source);
  if (sources.length === 0) return payload;
  if (sources.length === 1) return outputs.get(sources[0]!) ?? null;
  return Object.fromEntries(sources.map((source) => [source, outputs.get(source) ?? null]));
}

function shouldExecute(
  workflow: WorkflowDefinition,
  node: WorkflowNode,
  executed: ReadonlySet<string>,
  branchOutcomes: ReadonlyMap<string, boolean>
): boolean {
  const incoming = workflow.edges.filter((edge) => edge.target === node.id);
  if (incoming.length === 0) return true;
  return incoming.some((edge) => {
    if (!executed.has(edge.source)) return false;
    if (!edge.condition) return true;
    return edge.condition === String(branchOutcomes.get(edge.source));
  });
}

async function executeNode(
  node: WorkflowNode,
  value: JsonValue,
  adapters: FlowcordiaRuntimeAdapters
): Promise<JsonValue> {
  switch (node.operation) {
    case "trigger.manual":
    case "trigger.schedule":
    case "trigger.webhook":
    case "output.return":
      return value;
    case "action.http":
      return adapters.http({ node, configuration: node.configuration, value });
    case "control.wait":
      await adapters.wait({ node, durationSeconds: Number(node.configuration.durationSeconds) });
      return value;
    case "control.condition":
      return value;
    case "code.task":
      return adapters.code({ node, reference: node.codeReference!, value });
    default:
      throw new Error(`Unsupported Flowcordia operation: ${node.operation}`);
  }
}

export async function executeFlowcordiaWorkflow(
  workflow: WorkflowDefinition,
  payload: JsonValue,
  adapters: FlowcordiaRuntimeAdapters,
  options: FlowcordiaExecuteOptions = {}
): Promise<FlowcordiaExecutionResult> {
  const validated = validateWorkflow(workflow);
  const analysis = validated.success ? analyzeWorkflow(validated.workflow) : null;
  if (!validated.success || !analysis || analysis.issues.length > 0) {
    return {
      success: false,
      workflowId: workflow?.id ?? "invalid",
      mode: adapters.mode,
      output: null,
      traces: [
        {
          nodeId: "workflow",
          operation: "validate",
          status: "FAILED",
          message: validated.success ? analysis?.issues[0]?.message : validated.issues[0]?.message,
        },
      ],
      failedNodeId: "workflow",
    };
  }
  if (workflow.nodes.length > (options.maxNodes ?? 100)) {
    return {
      success: false,
      workflowId: workflow.id,
      mode: adapters.mode,
      output: null,
      traces: [
        {
          nodeId: "workflow",
          operation: "limit",
          status: "FAILED",
          message: "Workflow exceeds the configured execution node limit.",
        },
      ],
      failedNodeId: "workflow",
    };
  }

  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const outputs = new Map<string, JsonValue>();
  const executed = new Set<string>();
  const branchOutcomes = new Map<string, boolean>();
  const traces: FlowcordiaExecutionResult["traces"] = [];
  for (const nodeId of analysis.orderedNodeIds) {
    if (options.signal?.aborted) throw options.signal.reason;
    const node = nodes.get(nodeId)!;
    if (!shouldExecute(workflow, node, executed, branchOutcomes)) {
      traces.push({ nodeId, operation: node.operation, status: "SKIPPED" });
      continue;
    }
    try {
      const nodeInput = inputForNode(workflow, node, payload, outputs);
      if (node.operation === "control.condition") {
        branchOutcomes.set(node.id, conditionMatches(node.configuration, nodeInput));
      }
      const output = await executeNode(node, nodeInput, adapters);
      outputs.set(nodeId, output);
      executed.add(nodeId);
      traces.push({ nodeId, operation: node.operation, status: "SUCCEEDED", output });
    } catch (error) {
      traces.push({
        nodeId,
        operation: node.operation,
        status: "FAILED",
        message: error instanceof Error ? error.message : "Workflow node failed.",
      });
      return {
        success: false,
        workflowId: workflow.id,
        mode: adapters.mode,
        output: null,
        traces,
        failedNodeId: nodeId,
      };
    }
  }

  const outputNode = [...workflow.nodes]
    .reverse()
    .find((node) => node.kind === "output" && outputs.has(node.id));
  const lastExecuted = [...analysis.orderedNodeIds].reverse().find((id) => outputs.has(id));
  return {
    success: true,
    workflowId: workflow.id,
    mode: adapters.mode,
    output: outputs.get(outputNode?.id ?? lastExecuted ?? "") ?? null,
    traces,
  };
}

export function createPreviewRuntimeAdapters(): FlowcordiaRuntimeAdapters {
  return {
    mode: "preview",
    async http({ configuration, value }) {
      return {
        simulated: true,
        request: { method: configuration.method ?? "GET", url: configuration.url ?? "" },
        input: value,
      };
    },
    async code({ node, reference, value }) {
      return {
        simulated: true,
        nodeId: node.id,
        codeReference: { path: reference.path, exportName: reference.exportName },
        input: value,
      };
    },
    async wait() {
      // Preview proves the wait configuration without delaying the operator.
    },
  };
}

export function createTriggerRuntimeAdapters(
  options: FlowcordiaTriggerRuntimeOptions
): FlowcordiaRuntimeAdapters {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  return {
    mode: "live",
    async http({ node, configuration, value }) {
      if (!fetchImplementation) throw new Error("Fetch is unavailable in this runtime.");
      const url = new URL(String(configuration.url));
      if (!(await options.authorizeHttp(url))) {
        throw new Error("HTTP destination is not allowed by the Flowcordia egress policy.");
      }
      const headers: Record<string, string> = { "content-type": "application/json" };
      for (const reference of node.credentialReferences ?? []) {
        if (!options.resolveCredential) {
          throw new Error(`Credential reference "${reference}" has no runtime resolver.`);
        }
        const credential = await options.resolveCredential(reference);
        const credentialHeaders = credential.headers;
        if (
          !credentialHeaders ||
          typeof credentialHeaders !== "object" ||
          Array.isArray(credentialHeaders)
        ) {
          throw new Error(`Credential reference "${reference}" must provide a headers object.`);
        }
        for (const [name, headerValue] of Object.entries(credentialHeaders)) {
          if (typeof headerValue !== "string") {
            throw new Error(`Credential reference "${reference}" contains an invalid header.`);
          }
          const normalizedName = name.trim().toLowerCase();
          if (!normalizedName || ["host", "content-length"].includes(normalizedName)) {
            throw new Error(`Credential reference "${reference}" contains a forbidden header.`);
          }
          headers[normalizedName] = headerValue;
        }
      }
      const response = await fetchImplementation(url, {
        method: String(configuration.method ?? "GET"),
        headers,
        ...(["GET", "HEAD"].includes(String(configuration.method ?? "GET").toUpperCase())
          ? {}
          : { body: JSON.stringify(value) }),
      });
      if (!response.ok) throw new Error(`HTTP request failed with status ${response.status}.`);
      const text = await response.text();
      if (!text) return null;
      try {
        return jsonValue(JSON.parse(text));
      } catch {
        return text;
      }
    },
    async code({ node, value }) {
      const handler = options.codeHandlers?.[node.id];
      if (!handler) throw new Error(`Code handler "${node.id}" is not registered.`);
      return jsonValue(await handler(value));
    },
    async wait({ durationSeconds }) {
      await options.wait(durationSeconds);
    },
  };
}
