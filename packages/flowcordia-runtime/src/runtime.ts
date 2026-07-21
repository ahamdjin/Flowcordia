import {
  createWorkflowFunctionPreviewValue,
  formatWorkflowFunctionValuePath,
  parseFlowcordiaHttpConfiguration,
  validateWorkflow,
  validateWorkflowFunctionValue,
  type FlowcordiaHttpConfiguration,
  type JsonObject,
  type JsonValue,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowcordia/workflow";
import { analyzeWorkflow } from "./analyze.js";
import type {
  FlowcordiaExecuteOptions,
  FlowcordiaExecutionResult,
  FlowcordiaPreviewRuntimeOptions,
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

function assertFunctionBoundary(
  node: WorkflowNode,
  boundary: "input" | "output",
  schema: JsonObject | undefined,
  value: JsonValue
) {
  if (!schema) return;
  const issue = validateWorkflowFunctionValue(schema, value)[0];
  if (!issue) return;
  throw new Error(
    `Function ${boundary} failed schema validation at ${formatWorkflowFunctionValuePath(issue.path)}: ${issue.message}`
  );
}

async function executeNode(
  node: WorkflowNode,
  value: JsonValue,
  adapters: FlowcordiaRuntimeAdapters,
  signal?: AbortSignal
): Promise<JsonValue> {
  switch (node.operation) {
    case "trigger.manual":
    case "trigger.api":
    case "trigger.schedule":
    case "trigger.webhook":
    case "output.return":
      return value;
    case "action.http":
      return adapters.http({ node, configuration: node.configuration, value, signal });
    case "control.wait":
      await adapters.wait({ node, durationSeconds: Number(node.configuration.durationSeconds) });
      return value;
    case "control.condition":
      return value;
    case "code.task": {
      assertFunctionBoundary(node, "input", node.inputSchema, value);
      const output = await adapters.code({ node, reference: node.codeReference!, value });
      assertFunctionBoundary(node, "output", node.outputSchema, output);
      return output;
    }
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
  const traces: FlowcordiaExecutionResult["traces"] = [];
  const recordTrace = async (trace: FlowcordiaExecutionResult["traces"][number]) => {
    traces.push(trace);
    try {
      await options.onTrace?.(trace);
    } catch {
      // Observability must not change workflow behavior.
    }
  };
  const validated = validateWorkflow(workflow);
  const analysis = validated.success ? analyzeWorkflow(validated.workflow) : null;
  if (!validated.success || !analysis || analysis.issues.length > 0) {
    await recordTrace({
      nodeId: "workflow",
      operation: "validate",
      status: "FAILED",
      message: validated.success ? analysis?.issues[0]?.message : validated.issues[0]?.message,
    });
    return {
      success: false,
      workflowId: workflow?.id ?? "invalid",
      mode: adapters.mode,
      output: null,
      traces,
      failedNodeId: "workflow",
    };
  }
  if (workflow.nodes.length > (options.maxNodes ?? 100)) {
    await recordTrace({
      nodeId: "workflow",
      operation: "limit",
      status: "FAILED",
      message: "Workflow exceeds the configured execution node limit.",
    });
    return {
      success: false,
      workflowId: workflow.id,
      mode: adapters.mode,
      output: null,
      traces,
      failedNodeId: "workflow",
    };
  }

  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const outputs = new Map<string, JsonValue>();
  const executed = new Set<string>();
  const branchOutcomes = new Map<string, boolean>();
  for (const nodeId of analysis.orderedNodeIds) {
    if (options.signal?.aborted) throw options.signal.reason;
    const node = nodes.get(nodeId)!;
    if (!shouldExecute(workflow, node, executed, branchOutcomes)) {
      await recordTrace({ nodeId, operation: node.operation, status: "SKIPPED" });
      continue;
    }
    try {
      const nodeInput = inputForNode(workflow, node, payload, outputs);
      if (node.operation === "control.condition") {
        branchOutcomes.set(node.id, conditionMatches(node.configuration, nodeInput));
      }
      const output = await executeNode(node, nodeInput, adapters, options.signal);
      outputs.set(nodeId, output);
      executed.add(nodeId);
      await recordTrace({ nodeId, operation: node.operation, status: "SUCCEEDED", output });
    } catch (error) {
      await recordTrace({
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

export function createPreviewRuntimeAdapters(
  options: FlowcordiaPreviewRuntimeOptions = {}
): FlowcordiaRuntimeAdapters {
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
      const mocked = options.codeMocks?.[node.id];
      if (mocked !== undefined) return jsonValue(mocked);
      if (node.outputSchema) return createWorkflowFunctionPreviewValue(node.outputSchema);
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

const FORBIDDEN_CREDENTIAL_HEADER_NAMES = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const HTTP_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

class FlowcordiaHttpRuntimeError extends Error {}

function httpConfiguration(configuration: JsonObject): FlowcordiaHttpConfiguration {
  const parsed = parseFlowcordiaHttpConfiguration(configuration);
  if (!parsed.success) {
    throw new FlowcordiaHttpRuntimeError(
      parsed.issues[0]?.message ?? "HTTP node configuration is invalid."
    );
  }
  return parsed.configuration;
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readBoundedResponseBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await cancelResponseBody(response);
    throw new FlowcordiaHttpRuntimeError(
      `HTTP response exceeds the configured ${maxBytes}-byte limit.`
    );
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new FlowcordiaHttpRuntimeError(
          `HTTP response exceeds the configured ${maxBytes}-byte limit.`
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function readHttpResponse(
  response: Response,
  configuration: FlowcordiaHttpConfiguration
): Promise<JsonValue> {
  if (configuration.responseMode === "none") {
    await cancelResponseBody(response);
    return null;
  }

  const text = await readBoundedResponseBody(response, configuration.maxResponseBytes);
  if (!text) return null;
  if (configuration.responseMode === "text") return text;
  try {
    return jsonValue(JSON.parse(text));
  } catch {
    if (configuration.responseMode === "auto") return text;
    throw new FlowcordiaHttpRuntimeError("HTTP response was expected to contain valid JSON.");
  }
}

function requestAbortState(timeoutSeconds: number, parent?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parent?.reason);
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutSeconds * 1_000);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

export function createTriggerRuntimeAdapters(
  options: FlowcordiaTriggerRuntimeOptions
): FlowcordiaRuntimeAdapters {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  return {
    mode: "live",
    async http({ node, configuration, value, signal }) {
      if (!fetchImplementation) throw new Error("Fetch is unavailable in this runtime.");
      const parsedConfiguration = httpConfiguration(configuration);
      const url = new URL(parsedConfiguration.url);
      if (!(await options.authorizeHttp(url))) {
        throw new Error("HTTP destination is not allowed by the Flowcordia egress policy.");
      }
      const credentialHeaderOwners = new Map<string, string>();
      const headerEntries = new Map<string, string>();
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
          if (typeof headerValue !== "string" || /[\r\n]/.test(headerValue)) {
            throw new Error(`Credential reference "${reference}" contains an invalid header.`);
          }
          const normalizedName = name.trim().toLowerCase();
          if (
            !HTTP_HEADER_NAME.test(normalizedName) ||
            FORBIDDEN_CREDENTIAL_HEADER_NAMES.has(normalizedName)
          ) {
            throw new Error(`Credential reference "${reference}" contains a forbidden header.`);
          }
          const existingOwner = credentialHeaderOwners.get(normalizedName);
          if (existingOwner) {
            throw new Error(
              `Credential references "${existingOwner}" and "${reference}" both provide the "${normalizedName}" header.`
            );
          }
          credentialHeaderOwners.set(normalizedName, reference);
          headerEntries.set(normalizedName, headerValue);
        }
      }
      if (parsedConfiguration.bodyMode === "input" && !headerEntries.has("content-type")) {
        headerEntries.set("content-type", "application/json");
      }

      const abortState = requestAbortState(parsedConfiguration.timeoutSeconds, signal);
      try {
        const response = await fetchImplementation(url, {
          method: parsedConfiguration.method,
          headers: Object.fromEntries(headerEntries),
          redirect: "manual",
          signal: abortState.signal,
          ...(parsedConfiguration.bodyMode === "input" ? { body: JSON.stringify(value) } : {}),
        });
        if (response.status >= 300 && response.status < 400) {
          await cancelResponseBody(response);
          throw new FlowcordiaHttpRuntimeError(
            "HTTP redirects are not followed; call the final allowlisted HTTPS destination directly."
          );
        }
        if (!response.ok) {
          await cancelResponseBody(response);
          throw new FlowcordiaHttpRuntimeError(
            `HTTP request failed with status ${response.status}.`
          );
        }
        return await readHttpResponse(response, parsedConfiguration);
      } catch (error) {
        if (abortState.timedOut()) {
          throw new FlowcordiaHttpRuntimeError(
            `HTTP request timed out after ${parsedConfiguration.timeoutSeconds} seconds.`
          );
        }
        if (signal?.aborted) {
          throw new FlowcordiaHttpRuntimeError("HTTP request was cancelled.");
        }
        if (error instanceof FlowcordiaHttpRuntimeError) throw error;
        throw new FlowcordiaHttpRuntimeError("HTTP request could not be completed.");
      } finally {
        abortState.cleanup();
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
