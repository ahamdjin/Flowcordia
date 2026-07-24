from pathlib import Path


def write(path: str, content: str) -> None:
    file = Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one guarded match, found {count}; anchor={old[:120]!r}")
    file.write_text(source.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    file = Path(path)
    source = file.read_text()
    start_index = source.find(start)
    if start_index == -1:
        raise SystemExit(f"{path}: missing start marker {start!r}")
    end_index = source.find(end, start_index)
    if end_index == -1:
        raise SystemExit(f"{path}: missing end marker {end!r}")
    file.write_text(source[:start_index] + replacement + source[end_index:])


write(
    "packages/flowcordia-workflow/src/contract.ts",
    '''import { cloneWorkflow } from "./serialization.js";
import { parseFlowcordiaSubflowConfiguration } from "./subflow.js";
import type { JsonObject, WorkflowDefinition } from "./types.js";
import { validateWorkflowFunctionSchema } from "./function-schema.js";
import { validateWorkflow } from "./validation.js";

export const FLOWCORDIA_CALLABLE_CONTRACT_METADATA_VERSION = 1 as const;

export interface FlowcordiaCallableWorkflowContract {
  version: typeof FLOWCORDIA_CALLABLE_CONTRACT_METADATA_VERSION;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
}

export interface FlowcordiaCallableContractIssue {
  code:
    | "missing_trigger_contract"
    | "missing_output_contract"
    | "invalid_input_contract"
    | "invalid_output_contract"
    | "invalid_workflow"
    | "duplicate_workflow"
    | "mixed_revision"
    | "missing_child"
    | "invalid_child"
    | "child_contract_blocked"
    | "contract_mismatch"
    | "dependency_cycle"
    | "invalid_subflow";
  message: string;
  path: ReadonlyArray<string | number>;
}

export type FlowcordiaCallableContractResult =
  | { success: true; contract: FlowcordiaCallableWorkflowContract }
  | { success: false; issue: FlowcordiaCallableContractIssue };

export type FlowcordiaCallableContractResolution =
  | { state: "READY"; contract: FlowcordiaCallableWorkflowContract }
  | { state: "BLOCKED"; issue: FlowcordiaCallableContractIssue };

function cloneSchema(schema: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(schema)) as JsonObject;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function flowcordiaCallableSchemasEqual(
  left: JsonObject | null | undefined,
  right: JsonObject | null | undefined
): boolean {
  return Boolean(left && right) && canonicalJson(left) === canonicalJson(right);
}

function schemaIssue(
  code: "invalid_input_contract" | "invalid_output_contract",
  label: "input" | "output",
  schema: JsonObject | undefined,
  path: ReadonlyArray<string | number>
): FlowcordiaCallableContractIssue | undefined {
  if (!schema) {
    return {
      code: label === "input" ? "missing_trigger_contract" : "missing_output_contract",
      message:
        label === "input"
          ? "Callable workflows require an explicit object output schema on their single trigger."
          : "Callable workflows require an explicit object input schema on their single output node.",
      path,
    };
  }
  const issue = validateWorkflowFunctionSchema(schema, { requireObjectRoot: true })[0];
  return issue
    ? {
        code,
        message: `Callable workflow ${label} schema is invalid: ${issue.message}`,
        path: [...path, ...issue.path],
      }
    : undefined;
}

export function deriveFlowcordiaCallableWorkflowContract(
  workflow: WorkflowDefinition
): FlowcordiaCallableContractResult {
  const triggers = workflow.nodes.filter((node) => node.kind === "trigger");
  if (triggers.length !== 1) {
    return {
      success: false,
      issue: {
        code: "missing_trigger_contract",
        message: "Callable workflows require exactly one trigger with an explicit input contract.",
        path: ["nodes"],
      },
    };
  }
  const outputs = workflow.nodes.filter((node) => node.kind === "output");
  if (outputs.length !== 1) {
    return {
      success: false,
      issue: {
        code: "missing_output_contract",
        message: "Callable workflows require exactly one output node with an explicit return contract.",
        path: ["nodes"],
      },
    };
  }
  const trigger = triggers[0]!;
  const output = outputs[0]!;
  const triggerIndex = workflow.nodes.indexOf(trigger);
  const outputIndex = workflow.nodes.indexOf(output);
  const inputIssue = schemaIssue(
    "invalid_input_contract",
    "input",
    trigger.outputSchema,
    ["nodes", triggerIndex, "outputSchema"]
  );
  if (inputIssue) return { success: false, issue: inputIssue };
  const outputIssue = schemaIssue(
    "invalid_output_contract",
    "output",
    output.inputSchema,
    ["nodes", outputIndex, "inputSchema"]
  );
  if (outputIssue) return { success: false, issue: outputIssue };
  return {
    success: true,
    contract: {
      version: FLOWCORDIA_CALLABLE_CONTRACT_METADATA_VERSION,
      inputSchema: cloneSchema(trigger.outputSchema!),
      outputSchema: cloneSchema(output.inputSchema!),
    },
  };
}

export interface FlowcordiaCallableWorkflowGraphEntry {
  workflowId: string;
  status: "VALID" | "INVALID";
  sourceCommitSha: string;
  workflow: WorkflowDefinition | null;
}

export function resolveFlowcordiaCallableContractGraph(input: {
  sourceCommitSha: string;
  entries: readonly FlowcordiaCallableWorkflowGraphEntry[];
}): Map<string, FlowcordiaCallableContractResolution> {
  const entriesById = new Map<string, FlowcordiaCallableWorkflowGraphEntry>();
  const duplicates = new Set<string>();
  for (const entry of input.entries) {
    if (entriesById.has(entry.workflowId)) duplicates.add(entry.workflowId);
    else entriesById.set(entry.workflowId, entry);
  }
  const memo = new Map<string, FlowcordiaCallableContractResolution>();
  const resolve = (workflowId: string, stack: readonly string[]): FlowcordiaCallableContractResolution => {
    const existing = memo.get(workflowId);
    if (existing) return existing;
    if (stack.includes(workflowId)) {
      return {
        state: "BLOCKED",
        issue: {
          code: "dependency_cycle",
          message: `Callable workflow dependency cycle detected through "${workflowId}".`,
          path: [...stack, workflowId],
        },
      };
    }
    if (duplicates.has(workflowId)) {
      const result: FlowcordiaCallableContractResolution = {
        state: "BLOCKED",
        issue: {
          code: "duplicate_workflow",
          message: `Workflow "${workflowId}" has duplicate repository index identity.`,
          path: [workflowId],
        },
      };
      memo.set(workflowId, result);
      return result;
    }
    const entry = entriesById.get(workflowId);
    if (!entry) {
      return {
        state: "BLOCKED",
        issue: {
          code: "missing_child",
          message: `Child workflow "${workflowId}" is missing from the exact repository revision.`,
          path: [workflowId],
        },
      };
    }
    if (entry.sourceCommitSha !== input.sourceCommitSha) {
      const result: FlowcordiaCallableContractResolution = {
        state: "BLOCKED",
        issue: {
          code: "mixed_revision",
          message: `Workflow "${workflowId}" is indexed from a different repository revision.`,
          path: [workflowId],
        },
      };
      memo.set(workflowId, result);
      return result;
    }
    if (entry.status !== "VALID" || !entry.workflow) {
      const result: FlowcordiaCallableContractResolution = {
        state: "BLOCKED",
        issue: {
          code: "invalid_workflow",
          message: `Workflow "${workflowId}" is not a valid callable repository workflow.`,
          path: [workflowId],
        },
      };
      memo.set(workflowId, result);
      return result;
    }
    const derived = deriveFlowcordiaCallableWorkflowContract(entry.workflow);
    if (!derived.success) {
      const result: FlowcordiaCallableContractResolution = {
        state: "BLOCKED",
        issue: derived.issue,
      };
      memo.set(workflowId, result);
      return result;
    }
    const nextStack = [...stack, workflowId];
    for (const [nodeIndex, node] of entry.workflow.nodes.entries()) {
      if (node.operation !== "subflow.invoke") continue;
      const parsed = parseFlowcordiaSubflowConfiguration(node.configuration);
      if (!parsed.success) {
        const result: FlowcordiaCallableContractResolution = {
          state: "BLOCKED",
          issue: {
            code: "invalid_subflow",
            message: parsed.issues[0]?.message ?? "Subflow configuration is invalid.",
            path: ["nodes", nodeIndex, "configuration"],
          },
        };
        memo.set(workflowId, result);
        return result;
      }
      const targetId = parsed.configuration.workflowId;
      const targetEntry = entriesById.get(targetId);
      if (!targetEntry) {
        const result: FlowcordiaCallableContractResolution = {
          state: "BLOCKED",
          issue: {
            code: "missing_child",
            message: `Subflow node "${node.id}" references missing child workflow "${targetId}".`,
            path: ["nodes", nodeIndex, "configuration", "workflowId"],
          },
        };
        memo.set(workflowId, result);
        return result;
      }
      if (targetEntry.status !== "VALID") {
        const result: FlowcordiaCallableContractResolution = {
          state: "BLOCKED",
          issue: {
            code: "invalid_child",
            message: `Subflow node "${node.id}" references invalid child workflow "${targetId}".`,
            path: ["nodes", nodeIndex, "configuration", "workflowId"],
          },
        };
        memo.set(workflowId, result);
        return result;
      }
      const target = resolve(targetId, nextStack);
      if (target.state !== "READY") {
        const result: FlowcordiaCallableContractResolution = {
          state: "BLOCKED",
          issue: {
            code: "child_contract_blocked",
            message: `Child workflow "${targetId}" is not callable: ${target.issue.message}`,
            path: ["nodes", nodeIndex, "configuration", "workflowId"],
          },
        };
        memo.set(workflowId, result);
        return result;
      }
      if (
        !flowcordiaCallableSchemasEqual(node.inputSchema, target.contract.inputSchema) ||
        !flowcordiaCallableSchemasEqual(node.outputSchema, target.contract.outputSchema)
      ) {
        const result: FlowcordiaCallableContractResolution = {
          state: "BLOCKED",
          issue: {
            code: "contract_mismatch",
            message: `Subflow node "${node.id}" does not match child workflow "${targetId}" callable contract.`,
            path: ["nodes", nodeIndex],
          },
        };
        memo.set(workflowId, result);
        return result;
      }
    }
    const result: FlowcordiaCallableContractResolution = {
      state: "READY",
      contract: derived.contract,
    };
    memo.set(workflowId, result);
    return result;
  };

  for (const workflowId of [...entriesById.keys()].sort()) resolve(workflowId, []);
  return memo;
}

export interface FlowcordiaStoredCallableContractEntry {
  workflowId: string;
  status: "VALID" | "INVALID";
  sourceCommitSha: string;
  callableContractMetadataVersion: number;
  callableContractState: "UNKNOWN" | "READY" | "BLOCKED";
  callableInputSchema: JsonObject | null;
  callableOutputSchema: JsonObject | null;
  callableFailureMessage: string | null;
}

export function validateFlowcordiaSubflowContractBindings(input: {
  workflow: WorkflowDefinition;
  sourceCommitSha: string;
  entries: readonly FlowcordiaStoredCallableContractEntry[];
}): FlowcordiaCallableContractIssue[] {
  const entriesById = new Map(input.entries.map((entry) => [entry.workflowId, entry]));
  const issues: FlowcordiaCallableContractIssue[] = [];
  for (const [nodeIndex, node] of input.workflow.nodes.entries()) {
    if (node.operation !== "subflow.invoke") continue;
    const parsed = parseFlowcordiaSubflowConfiguration(node.configuration);
    if (!parsed.success) {
      issues.push({
        code: "invalid_subflow",
        message: parsed.issues[0]?.message ?? "Subflow configuration is invalid.",
        path: ["nodes", nodeIndex, "configuration"],
      });
      continue;
    }
    const targetId = parsed.configuration.workflowId;
    const target = entriesById.get(targetId);
    if (!target) {
      issues.push({
        code: "missing_child",
        message: `Child workflow "${targetId}" is missing from the exact repository index.`,
        path: ["nodes", nodeIndex, "configuration", "workflowId"],
      });
      continue;
    }
    if (target.status !== "VALID") {
      issues.push({
        code: "invalid_child",
        message: `Child workflow "${targetId}" is invalid at the exact repository revision.`,
        path: ["nodes", nodeIndex, "configuration", "workflowId"],
      });
      continue;
    }
    if (target.sourceCommitSha !== input.sourceCommitSha) {
      issues.push({
        code: "mixed_revision",
        message: `Child workflow "${targetId}" is indexed from a different repository revision.`,
        path: ["nodes", nodeIndex, "configuration", "workflowId"],
      });
      continue;
    }
    if (
      target.callableContractMetadataVersion !== FLOWCORDIA_CALLABLE_CONTRACT_METADATA_VERSION ||
      target.callableContractState !== "READY" ||
      !target.callableInputSchema ||
      !target.callableOutputSchema
    ) {
      issues.push({
        code: "child_contract_blocked",
        message:
          target.callableFailureMessage ??
          `Child workflow "${targetId}" does not expose a synchronized callable contract.`,
        path: ["nodes", nodeIndex, "configuration", "workflowId"],
      });
      continue;
    }
    if (
      !flowcordiaCallableSchemasEqual(node.inputSchema, target.callableInputSchema) ||
      !flowcordiaCallableSchemasEqual(node.outputSchema, target.callableOutputSchema)
    ) {
      issues.push({
        code: "contract_mismatch",
        message: `Subflow node "${node.id}" must be rebound to child workflow "${targetId}" exact callable contract.`,
        path: ["nodes", nodeIndex],
      });
    }
  }
  return issues;
}

export function bindFlowcordiaSubflowNodeContract(input: {
  workflow: WorkflowDefinition;
  nodeId: string;
  configuration: JsonObject;
  contract: FlowcordiaCallableWorkflowContract;
}):
  | { success: true; workflow: WorkflowDefinition }
  | { success: false; message: string } {
  const parsed = parseFlowcordiaSubflowConfiguration(input.configuration);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.issues[0]?.message ?? "Subflow configuration is invalid.",
    };
  }
  const inputIssues = validateWorkflowFunctionSchema(input.contract.inputSchema, {
    requireObjectRoot: true,
  });
  const outputIssues = validateWorkflowFunctionSchema(input.contract.outputSchema, {
    requireObjectRoot: true,
  });
  if (inputIssues[0] || outputIssues[0]) {
    return { success: false, message: "The indexed child callable contract is invalid." };
  }
  const workflow = cloneWorkflow(input.workflow);
  const node = workflow.nodes.find((candidate) => candidate.id === input.nodeId);
  if (!node || node.operation !== "subflow.invoke") {
    return { success: false, message: "The selected node is not a visual subflow node." };
  }
  if (parsed.configuration.workflowId === workflow.id) {
    return { success: false, message: "A workflow cannot invoke itself as a subflow." };
  }
  node.configuration = parsed.configuration;
  node.inputSchema = cloneSchema(input.contract.inputSchema);
  node.outputSchema = cloneSchema(input.contract.outputSchema);
  const validated = validateWorkflow(workflow);
  return validated.success
    ? { success: true, workflow: validated.workflow }
    : {
        success: false,
        message: validated.issues[0]?.message ?? "The bound subflow contract is invalid.",
      };
}
''',
)

replace_once(
    "packages/flowcordia-workflow/src/index.ts",
    'export * from "./credentials.js";',
    'export * from "./credentials.js";\nexport * from "./contract.js";',
)

replace_once(
    "packages/flowcordia-workflow/src/catalog.ts",
    '''    defaultName: "Manual trigger",
    defaultConfiguration: {},''',
    '''    defaultName: "Manual trigger",
    defaultConfiguration: {},
    defaultOutputSchema: { type: "object" },''',
)
replace_once(
    "packages/flowcordia-workflow/src/catalog.ts",
    '''    defaultName: "API trigger",
    defaultConfiguration: {},''',
    '''    defaultName: "API trigger",
    defaultConfiguration: {},
    defaultOutputSchema: { type: "object" },''',
)
replace_once(
    "packages/flowcordia-workflow/src/catalog.ts",
    '''    defaultName: "Schedule",
    defaultConfiguration: { cron: "0 9 * * 1-5", timezone: "UTC" },''',
    '''    defaultName: "Schedule",
    defaultConfiguration: { cron: "0 9 * * 1-5", timezone: "UTC" },
    defaultOutputSchema: { type: "object" },''',
)
replace_once(
    "packages/flowcordia-workflow/src/catalog.ts",
    '''    defaultName: "Webhook",
    defaultConfiguration: { method: "POST", path: "/" },''',
    '''    defaultName: "Webhook",
    defaultConfiguration: { method: "POST", path: "/" },
    defaultOutputSchema: { type: "object" },''',
)
replace_once(
    "packages/flowcordia-workflow/src/catalog.ts",
    '''    defaultName: "Output",
    defaultConfiguration: {},''',
    '''    defaultName: "Output",
    defaultConfiguration: {},
    defaultInputSchema: { type: "object" },''',
)

write(
    "packages/flowcordia-workflow/test/contract.test.ts",
    '''import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "../src/index.js";
import {
  bindFlowcordiaSubflowNodeContract,
  deriveFlowcordiaCallableWorkflowContract,
  resolveFlowcordiaCallableContractGraph,
  validateFlowcordiaSubflowContractBindings,
} from "../src/index.js";

const commit = "a".repeat(40);
const inputSchema = {
  type: "object",
  required: ["orderId"],
  properties: { orderId: { type: "string" } },
  additionalProperties: false,
} as const;
const outputSchema = {
  type: "object",
  required: ["accepted"],
  properties: { accepted: { type: "boolean" } },
  additionalProperties: false,
} as const;

function callable(id: string, child?: string): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id,
    name: id,
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
        outputSchema: inputSchema,
      },
      ...(child
        ? [
            {
              id: "child",
              kind: "subflow" as const,
              operation: "subflow.invoke",
              position: { x: 150, y: 0 },
              configuration: { workflowId: child, mode: "single" },
              inputSchema,
              outputSchema,
            },
          ]
        : []),
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 300, y: 0 },
        configuration: {},
        inputSchema: outputSchema,
      },
    ],
    edges: child
      ? [
          { id: "trigger-child", source: "trigger", target: "child" },
          { id: "child-output", source: "child", target: "output" },
        ]
      : [{ id: "trigger-output", source: "trigger", target: "output" }],
  };
}

describe("Flowcordia callable workflow contracts", () => {
  it("derives an explicit trigger-to-output callable contract", () => {
    expect(deriveFlowcordiaCallableWorkflowContract(callable("child"))).toEqual({
      success: true,
      contract: { version: 1, inputSchema, outputSchema },
    });
  });

  it("blocks workflows without an explicit output boundary without invalidating the workflow", () => {
    const workflow = callable("child");
    delete workflow.nodes.at(-1)!.inputSchema;
    const result = deriveFlowcordiaCallableWorkflowContract(workflow);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issue.code).toBe("missing_output_contract");
  });

  it("resolves a transitive exact-revision callable graph", () => {
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        { workflowId: "leaf", status: "VALID", sourceCommitSha: commit, workflow: callable("leaf") },
        {
          workflowId: "parent",
          status: "VALID",
          sourceCommitSha: commit,
          workflow: callable("parent", "leaf"),
        },
      ],
    });
    expect(result.get("leaf")?.state).toBe("READY");
    expect(result.get("parent")?.state).toBe("READY");
  });

  it("blocks parent readiness when a bound node drifts from the child contract", () => {
    const parent = callable("parent", "leaf");
    parent.nodes[1]!.inputSchema = { type: "object" };
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        { workflowId: "leaf", status: "VALID", sourceCommitSha: commit, workflow: callable("leaf") },
        { workflowId: "parent", status: "VALID", sourceCommitSha: commit, workflow: parent },
      ],
    });
    expect(result.get("parent")).toMatchObject({
      state: "BLOCKED",
      issue: { code: "contract_mismatch" },
    });
  });

  it("blocks recursive callable graphs", () => {
    const result = resolveFlowcordiaCallableContractGraph({
      sourceCommitSha: commit,
      entries: [
        { workflowId: "alpha", status: "VALID", sourceCommitSha: commit, workflow: callable("alpha", "beta") },
        { workflowId: "beta", status: "VALID", sourceCommitSha: commit, workflow: callable("beta", "alpha") },
      ],
    });
    expect(result.get("alpha")?.state).toBe("BLOCKED");
    expect(result.get("beta")?.state).toBe("BLOCKED");
  });

  it("binds exact indexed schemas while preserving invocation configuration", () => {
    const parent = callable("parent", "leaf");
    parent.nodes[1]!.inputSchema = { type: "object" };
    const result = bindFlowcordiaSubflowNodeContract({
      workflow: parent,
      nodeId: "child",
      configuration: { workflowId: "leaf", mode: "batch", itemsPath: "orders", maxItems: 10 },
      contract: { version: 1, inputSchema, outputSchema },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.workflow.nodes[1]).toMatchObject({
      configuration: { workflowId: "leaf", mode: "batch", itemsPath: "orders", maxItems: 10 },
      inputSchema,
      outputSchema,
    });
  });

  it("rejects stored child contracts that do not match the parent node", () => {
    const parent = callable("parent", "leaf");
    parent.nodes[1]!.outputSchema = { type: "object" };
    const issues = validateFlowcordiaSubflowContractBindings({
      workflow: parent,
      sourceCommitSha: commit,
      entries: [
        {
          workflowId: "leaf",
          status: "VALID",
          sourceCommitSha: commit,
          callableContractMetadataVersion: 1,
          callableContractState: "READY",
          callableInputSchema: inputSchema,
          callableOutputSchema: outputSchema,
          callableFailureMessage: null,
        },
      ],
    });
    expect(issues[0]?.code).toBe("contract_mismatch");
  });
});
''',
)

replace_once(
    "packages/flowcordia-runtime/src/runtime.ts",
    '''function assertFunctionBoundary(
  node: WorkflowNode,
  boundary: "input" | "output",
  schema: JsonObject | undefined,
  value: JsonValue
) {''',
    '''function assertFunctionBoundary(
  node: WorkflowNode,
  boundary: "input" | "output",
  schema: JsonObject | undefined,
  value: JsonValue
) {''',
)
replace_once(
    "packages/flowcordia-runtime/src/runtime.ts",
    '''  const subject = node.operation === "subflow.invoke" ? "Subflow" : "Function";''',
    '''  const subject = node.operation === "subflow.invoke"
    ? "Subflow"
    : node.kind === "trigger"
      ? "Trigger"
      : node.kind === "output"
        ? "Output"
        : "Function";''',
)
replace_once(
    "packages/flowcordia-runtime/src/runtime.ts",
    '''    case "trigger.manual":
    case "trigger.api":
    case "trigger.schedule":
    case "trigger.webhook":
    case "output.return":
      return value;''',
    '''    case "trigger.manual":
    case "trigger.api":
    case "trigger.schedule":
    case "trigger.webhook":
      assertFunctionBoundary(node, "input", node.outputSchema, value);
      return value;
    case "output.return":
      assertFunctionBoundary(node, "output", node.inputSchema, value);
      return value;''',
)

write(
    "packages/flowcordia-runtime/test/callable-contract-runtime.test.ts",
    '''import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { createPreviewRuntimeAdapters, executeFlowcordiaWorkflow } from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "callable",
    name: "Callable",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        operation: "trigger.manual",
        position: { x: 0, y: 0 },
        configuration: {},
        outputSchema: {
          type: "object",
          required: ["orderId"],
          properties: { orderId: { type: "string" } },
          additionalProperties: false,
        },
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 200, y: 0 },
        configuration: {},
        inputSchema: {
          type: "object",
          required: ["orderId"],
          properties: { orderId: { type: "string" } },
          additionalProperties: false,
        },
      },
    ],
    edges: [{ id: "trigger-output", source: "trigger", target: "output" }],
  };
}

describe("Flowcordia callable runtime boundaries", () => {
  it("enforces the trigger input contract", async () => {
    const result = await executeFlowcordiaWorkflow(
      workflow(),
      { unexpected: true },
      createPreviewRuntimeAdapters()
    );
    expect(result.success).toBe(false);
    expect(result.failedNodeId).toBe("trigger");
    expect(result.traces.at(-1)?.message).toContain("Trigger input failed schema validation");
  });

  it("enforces the output return contract", async () => {
    const invalid = workflow();
    invalid.nodes[1]!.inputSchema = {
      type: "object",
      required: ["accepted"],
      properties: { accepted: { type: "boolean" } },
    };
    const result = await executeFlowcordiaWorkflow(
      invalid,
      { orderId: "order_1" },
      createPreviewRuntimeAdapters()
    );
    expect(result.success).toBe(false);
    expect(result.failedNodeId).toBe("output");
    expect(result.traces.at(-1)?.message).toContain("Output output failed schema validation");
  });
});
''',
)

write(
    "internal-packages/database/prisma/migrations/20260724150000_flowcordia_callable_contracts/migration.sql",
    '''ALTER TABLE "flowcordia"."workflow_index_entry"
  ADD COLUMN "callable_contract_metadata_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "callable_contract_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "callable_input_schema" JSONB,
  ADD COLUMN "callable_output_schema" JSONB,
  ADD COLUMN "callable_failure_code" TEXT,
  ADD COLUMN "callable_failure_message" TEXT;

ALTER TABLE "flowcordia"."workflow_index_entry"
  ADD CONSTRAINT "workflow_index_entry_callable_contract_check" CHECK (
    (
      "callable_contract_metadata_version" = 0
      AND "callable_contract_state" = 'UNKNOWN'
      AND "callable_input_schema" IS NULL
      AND "callable_output_schema" IS NULL
      AND "callable_failure_code" IS NULL
      AND "callable_failure_message" IS NULL
    )
    OR
    (
      "callable_contract_metadata_version" = 1
      AND "callable_contract_state" = 'READY'
      AND jsonb_typeof("callable_input_schema") = 'object'
      AND jsonb_typeof("callable_output_schema") = 'object'
      AND "callable_failure_code" IS NULL
      AND "callable_failure_message" IS NULL
    )
    OR
    (
      "callable_contract_metadata_version" = 1
      AND "callable_contract_state" = 'BLOCKED'
      AND "callable_input_schema" IS NULL
      AND "callable_output_schema" IS NULL
      AND char_length("callable_failure_code") BETWEEN 1 AND 100
      AND char_length("callable_failure_message") BETWEEN 1 AND 1000
    )
  );

CREATE INDEX "workflow_index_entry_callable_contract_idx"
  ON "flowcordia"."workflow_index_entry"(
    "project_id",
    "repository_id",
    "source_commit_sha",
    "callable_contract_state",
    "workflow_id"
  );
''',
)

replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/types.ts",
    'import type { WorkflowDefinition, WorkflowIssue } from "@flowcordia/workflow";',
    'import type { JsonObject, WorkflowDefinition, WorkflowIssue } from "@flowcordia/workflow";',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/types.ts",
    '''  dependencyMetadataVersion: number;
  subflowWorkflowIds: readonly string[];
  failureCode:''',
    '''  dependencyMetadataVersion: number;
  subflowWorkflowIds: readonly string[];
  callableContractMetadataVersion: number;
  callableContractState: "UNKNOWN" | "READY" | "BLOCKED";
  callableInputSchema: JsonObject | null;
  callableOutputSchema: JsonObject | null;
  callableFailureCode: string | null;
  callableFailureMessage: string | null;
  failureCode:''',
)

replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/repository.server.ts",
    'import { prisma } from "~/db.server";',
    '''import { prisma } from "~/db.server";
import {
  validateWorkflowFunctionSchema,
  type JsonObject,
} from "@flowcordia/workflow";''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/repository.server.ts",
    '''  dependencyMetadataVersion: number;
  subflowWorkflowIds: unknown;
  failureCode:''',
    '''  dependencyMetadataVersion: number;
  subflowWorkflowIds: unknown;
  callableContractMetadataVersion: number;
  callableContractState: WorkflowIndexEntryRecord["callableContractState"];
  callableInputSchema: unknown;
  callableOutputSchema: unknown;
  callableFailureCode: string | null;
  callableFailureMessage: string | null;
  failureCode:''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/repository.server.ts",
    '''    "dependency_metadata_version" AS "dependencyMetadataVersion",
    "subflow_workflow_ids" AS "subflowWorkflowIds",
    "failure_code" AS "failureCode",''',
    '''    "dependency_metadata_version" AS "dependencyMetadataVersion",
    "subflow_workflow_ids" AS "subflowWorkflowIds",
    "callable_contract_metadata_version" AS "callableContractMetadataVersion",
    "callable_contract_state" AS "callableContractState",
    "callable_input_schema" AS "callableInputSchema",
    "callable_output_schema" AS "callableOutputSchema",
    "callable_failure_code" AS "callableFailureCode",
    "callable_failure_message" AS "callableFailureMessage",
    "failure_code" AS "failureCode",''',
)
replace_between(
    "apps/webapp/app/features/flowcordia/workflows/index/repository.server.ts",
    "function toEntry(row: EntryRow): WorkflowIndexEntryRecord {",
    "\nfunction scopePredicate",
    '''function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toEntry(row: EntryRow): WorkflowIndexEntryRecord {
  const subflowWorkflowIds = row.subflowWorkflowIds;
  if (
    !Array.isArray(subflowWorkflowIds) ||
    subflowWorkflowIds.length > 100 ||
    subflowWorkflowIds.some(
      (workflowId) => typeof workflowId !== "string" || !/^[a-z][a-z0-9_-]{2,127}$/.test(workflowId)
    ) ||
    new Set(subflowWorkflowIds).size !== subflowWorkflowIds.length ||
    [...subflowWorkflowIds]
      .sort()
      .some((workflowId, index) => workflowId !== subflowWorkflowIds[index])
  ) {
    throw new Error("Workflow index subflow dependency metadata is malformed.");
  }
  if (!Number.isSafeInteger(row.dependencyMetadataVersion) || row.dependencyMetadataVersion < 0) {
    throw new Error("Workflow index dependency metadata version is malformed.");
  }
  if (
    !Number.isSafeInteger(row.callableContractMetadataVersion) ||
    row.callableContractMetadataVersion < 0 ||
    !["UNKNOWN", "READY", "BLOCKED"].includes(row.callableContractState)
  ) {
    throw new Error("Workflow index callable contract metadata is malformed.");
  }
  let callableInputSchema: JsonObject | null = null;
  let callableOutputSchema: JsonObject | null = null;
  if (row.callableContractState === "READY") {
    if (
      row.callableContractMetadataVersion !== 1 ||
      !isJsonObject(row.callableInputSchema) ||
      !isJsonObject(row.callableOutputSchema) ||
      validateWorkflowFunctionSchema(row.callableInputSchema, { requireObjectRoot: true }).length > 0 ||
      validateWorkflowFunctionSchema(row.callableOutputSchema, { requireObjectRoot: true }).length > 0 ||
      row.callableFailureCode !== null ||
      row.callableFailureMessage !== null
    ) {
      throw new Error("Workflow index ready callable contract is malformed.");
    }
    callableInputSchema = row.callableInputSchema;
    callableOutputSchema = row.callableOutputSchema;
  } else if (row.callableContractState === "BLOCKED") {
    if (
      row.callableContractMetadataVersion !== 1 ||
      row.callableInputSchema !== null ||
      row.callableOutputSchema !== null ||
      !row.callableFailureCode ||
      !row.callableFailureMessage
    ) {
      throw new Error("Workflow index blocked callable contract is malformed.");
    }
  } else if (
    row.callableContractMetadataVersion !== 0 ||
    row.callableInputSchema !== null ||
    row.callableOutputSchema !== null ||
    row.callableFailureCode !== null ||
    row.callableFailureMessage !== null
  ) {
    throw new Error("Workflow index unknown callable contract is malformed.");
  }
  return {
    ...row,
    subflowWorkflowIds: subflowWorkflowIds as string[],
    callableInputSchema,
    callableOutputSchema,
  };
}
''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/repository.server.ts",
    '''          "source_blob_sha", "canonical_sha256", "dependency_metadata_version",
          "subflow_workflow_ids", "failure_code", "failure_message", "indexed_at", "created_at",
          "updated_at"''',
    '''          "source_blob_sha", "canonical_sha256", "dependency_metadata_version",
          "subflow_workflow_ids", "callable_contract_metadata_version", "callable_contract_state",
          "callable_input_schema", "callable_output_schema", "callable_failure_code",
          "callable_failure_message", "failure_code", "failure_message", "indexed_at", "created_at",
          "updated_at"''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/repository.server.ts",
    '''          ${entry.canonicalSha256}, ${entry.dependencyMetadataVersion},
          CAST(${JSON.stringify(entry.subflowWorkflowIds)} AS JSONB), ${entry.failureCode},
          ${entry.failureMessage}, ${entry.indexedAt}, ${now}, ${now}''',
    '''          ${entry.canonicalSha256}, ${entry.dependencyMetadataVersion},
          CAST(${JSON.stringify(entry.subflowWorkflowIds)} AS JSONB),
          ${entry.callableContractMetadataVersion}, ${entry.callableContractState},
          ${entry.callableInputSchema ? Prisma.sql`CAST(${JSON.stringify(entry.callableInputSchema)} AS JSONB)` : null},
          ${entry.callableOutputSchema ? Prisma.sql`CAST(${JSON.stringify(entry.callableOutputSchema)} AS JSONB)` : null},
          ${entry.callableFailureCode}, ${entry.callableFailureMessage}, ${entry.failureCode},
          ${entry.failureMessage}, ${entry.indexedAt}, ${now}, ${now}''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/repository.server.ts",
    '''          "dependency_metadata_version" = EXCLUDED."dependency_metadata_version",
          "subflow_workflow_ids" = EXCLUDED."subflow_workflow_ids",
          "failure_code" = EXCLUDED."failure_code",''',
    '''          "dependency_metadata_version" = EXCLUDED."dependency_metadata_version",
          "subflow_workflow_ids" = EXCLUDED."subflow_workflow_ids",
          "callable_contract_metadata_version" = EXCLUDED."callable_contract_metadata_version",
          "callable_contract_state" = EXCLUDED."callable_contract_state",
          "callable_input_schema" = EXCLUDED."callable_input_schema",
          "callable_output_schema" = EXCLUDED."callable_output_schema",
          "callable_failure_code" = EXCLUDED."callable_failure_code",
          "callable_failure_message" = EXCLUDED."callable_failure_message",
          "failure_code" = EXCLUDED."failure_code",''',
)

replace_once(
    "apps/webapp/app/features/flowcordia/workflows/index/service.server.ts",
    '''  collectFlowcordiaSubflowWorkflowIds,
  FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
} from "@flowcordia/workflow";''',
    '''  collectFlowcordiaSubflowWorkflowIds,
  FLOWCORDIA_CALLABLE_CONTRACT_METADATA_VERSION,
  FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
  resolveFlowcordiaCallableContractGraph,
  type WorkflowDefinition,
} from "@flowcordia/workflow";''',
)
replace_between(
    "apps/webapp/app/features/flowcordia/workflows/index/service.server.ts",
    "async function readIndexEntries(input: {",
    "\nexport async function processWorkflowIndexClaim",
    '''interface ReadIndexEntry {
  entry: Omit<
    WorkflowIndexEntryInput,
    | "callableContractMetadataVersion"
    | "callableContractState"
    | "callableInputSchema"
    | "callableOutputSchema"
    | "callableFailureCode"
    | "callableFailureMessage"
  >;
  workflow: WorkflowDefinition | null;
}

async function readIndexEntries(input: {
  scope: WorkflowIndexScope;
  commitSha: string;
  catalog: Awaited<ReturnType<GitHubWorkflowCatalog["discover"]>> & { success: true };
  workflowStore: GitHubWorkflowStore;
  indexedAt: Date;
}): Promise<WorkflowIndexEntryInput[]> {
  const reads = await mapWithConcurrency(
    input.catalog.value.entries,
    READ_CONCURRENCY,
    async (entry): Promise<ReadIndexEntry> => {
      const result = await input.workflowStore.read({
        scope: input.scope,
        workflowId: entry.workflowId,
        revision: input.commitSha,
      });
      if (!result.success) {
        if (result.error.code !== "invalid_document") {
          throw new WorkflowIndexSyncError(
            result.error.code,
            result.error.message,
            result.error.retryable
          );
        }
        const issue = result.error.workflowIssues?.[0];
        return {
          workflow: null,
          entry: {
            workflowId: entry.workflowId,
            workflowPath: entry.path,
            sourceCommitSha: input.commitSha,
            sourceBlobSha: entry.blobSha,
            indexedAt: input.indexedAt,
            status: "INVALID",
            name: null,
            description: null,
            schemaVersion: null,
            nodeCount: null,
            edgeCount: null,
            canonicalSha256: null,
            dependencyMetadataVersion: FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
            subflowWorkflowIds: [],
            failureCode: issue?.code ?? "invalid_document",
            failureMessage: boundedFailure(issue?.message ?? result.error.message),
          },
        };
      }
      if (
        result.value.source.commitSha !== input.commitSha ||
        result.value.source.blobSha !== entry.blobSha ||
        result.value.source.path !== entry.path
      ) {
        throw new WorkflowIndexSyncError(
          "source_identity_mismatch",
          "The workflow source changed identity during exact-commit indexing.",
          false
        );
      }
      const workflow = result.value.workflow;
      return {
        workflow,
        entry: {
          workflowId: workflow.id,
          workflowPath: entry.path,
          sourceCommitSha: input.commitSha,
          sourceBlobSha: entry.blobSha,
          indexedAt: input.indexedAt,
          status: "VALID",
          name: workflow.name,
          description: workflow.description ?? null,
          schemaVersion: workflow.schemaVersion,
          nodeCount: workflow.nodes.length,
          edgeCount: workflow.edges.length,
          canonicalSha256: workflowSha256(workflow),
          dependencyMetadataVersion: FLOWCORDIA_DEPENDENCY_METADATA_VERSION,
          subflowWorkflowIds: collectFlowcordiaSubflowWorkflowIds(workflow),
          failureCode: null,
          failureMessage: null,
        },
      };
    }
  );
  const contracts = resolveFlowcordiaCallableContractGraph({
    sourceCommitSha: input.commitSha,
    entries: reads.map(({ entry, workflow }) => ({
      workflowId: entry.workflowId,
      status: entry.status,
      sourceCommitSha: entry.sourceCommitSha,
      workflow,
    })),
  });
  return reads.map(({ entry }) => {
    const resolution = contracts.get(entry.workflowId);
    if (!resolution || resolution.state === "BLOCKED") {
      const issue = resolution?.issue ?? {
        code: "invalid_workflow",
        message: "Callable workflow contract could not be resolved.",
      };
      return {
        ...entry,
        callableContractMetadataVersion: FLOWCORDIA_CALLABLE_CONTRACT_METADATA_VERSION,
        callableContractState: "BLOCKED" as const,
        callableInputSchema: null,
        callableOutputSchema: null,
        callableFailureCode: issue.code,
        callableFailureMessage: boundedFailure(issue.message),
      };
    }
    return {
      ...entry,
      callableContractMetadataVersion: FLOWCORDIA_CALLABLE_CONTRACT_METADATA_VERSION,
      callableContractState: "READY" as const,
      callableInputSchema: resolution.contract.inputSchema,
      callableOutputSchema: resolution.contract.outputSchema,
      callableFailureCode: null,
      callableFailureMessage: null,
    };
  });
}
''',
)

replace_once(
    "apps/webapp/app/features/flowcordia/workflows/subflows/presentation.ts",
    '''  evaluateFlowcordiaSubflowCandidate,
  type WorkflowDefinition,''',
    '''  evaluateFlowcordiaSubflowCandidate,
  validateFlowcordiaSubflowContractBindings,
  type WorkflowDefinition,''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/subflows/presentation.ts",
    '''      return {
        workflowId: entry.workflowId,
        name: entry.name ?? entry.workflowId,
        description: entry.description,
        eligible: evaluation.eligible,
        message: evaluation.message,
      };''',
    '''      const contractReady =
        entry.callableContractMetadataVersion === 1 &&
        entry.callableContractState === "READY" &&
        entry.callableInputSchema !== null &&
        entry.callableOutputSchema !== null;
      return {
        workflowId: entry.workflowId,
        name: entry.name ?? entry.workflowId,
        description: entry.description,
        eligible: evaluation.eligible && contractReady,
        message: evaluation.message ?? (contractReady ? null : entry.callableFailureMessage ?? "The child workflow callable contract is unavailable."),
      };''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/subflows/presentation.ts",
    '''  return {
    state: analysis.success ? "READY" : "BLOCKED",
    sourceCommitSha: input.sourceCommitSha,
    candidates,
    issues: analysis.success
      ? []
      : analysis.issues.map((dependencyIssue) => ({
          code: dependencyIssue.code,
          message: dependencyIssue.message,
          path: [...dependencyIssue.path],
        })),
  };''',
    '''  const contractIssues = validateFlowcordiaSubflowContractBindings({
    workflow: input.workflow,
    sourceCommitSha: input.sourceCommitSha,
    entries: input.entries,
  });
  const issues = [
    ...(analysis.success ? [] : analysis.issues),
    ...contractIssues,
  ].map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: [...issue.path].map(String),
  }));
  return {
    state: issues.length === 0 ? "READY" : "BLOCKED",
    sourceCommitSha: input.sourceCommitSha,
    candidates,
    issues,
  };''',
)

replace_once(
    "apps/webapp/app/features/flowcordia/workflows/drafts/service.server.ts",
    '''  addWorkflowFunctionNode,
  applyWorkflowEdit,
  analyzeFlowcordiaWorkflowDependencyGraph,
  collectFlowcordiaSubflowWorkflowIds,
  resolveWorkflowFunctionFixture,
  type JsonValue,''',
    '''  addWorkflowFunctionNode,
  applyWorkflowEdit,
  analyzeFlowcordiaWorkflowDependencyGraph,
  bindFlowcordiaSubflowNodeContract,
  collectFlowcordiaSubflowWorkflowIds,
  parseFlowcordiaSubflowConfiguration,
  resolveWorkflowFunctionFixture,
  validateFlowcordiaSubflowContractBindings,
  type JsonValue,
  type WorkflowDefinition,''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/drafts/service.server.ts",
    '''  let edited;
  if (input.command.type === "add_function_node") {''',
    '''  let edited;
  const configuredNode =
    input.command.type === "set_node_configuration"
      ? draft.document.nodes.find((node) => node.id === input.command.nodeId)
      : undefined;
  if (input.command.type === "set_node_configuration" && configuredNode?.operation === "subflow.invoke") {
    const parsed = parseFlowcordiaSubflowConfiguration(input.command.configuration);
    if (!parsed.success) {
      throw new WorkflowDraftError(
        "unsupported_edit",
        parsed.issues[0]?.message ?? "The subflow configuration is invalid."
      );
    }
    const target = await getWorkflowIndexEntry(input.scope, parsed.configuration.workflowId);
    if (
      !target ||
      target.status !== "VALID" ||
      target.sourceCommitSha !== draft.baseCommitSha ||
      target.callableContractMetadataVersion !== 1 ||
      target.callableContractState !== "READY" ||
      !target.callableInputSchema ||
      !target.callableOutputSchema
    ) {
      throw new WorkflowDraftError(
        "unsupported_edit",
        target?.callableFailureMessage ??
          "The selected child workflow does not expose a ready callable contract at this draft revision."
      );
    }
    edited = bindFlowcordiaSubflowNodeContract({
      workflow: draft.document,
      nodeId: input.command.nodeId,
      configuration: input.command.configuration,
      contract: {
        version: 1,
        inputSchema: target.callableInputSchema,
        outputSchema: target.callableOutputSchema,
      },
    });
  } else if (input.command.type === "add_function_node") {''',
)
replace_once(
    "apps/webapp/app/features/flowcordia/workflows/drafts/service.server.ts",
    '''  if (!edited.success) {
    throw new WorkflowDraftError("unsupported_edit", edited.message);
  }
  return updateWorkflowDraft({''',
    '''  if (!edited.success) {
    throw new WorkflowDraftError("unsupported_edit", edited.message);
  }
  if (configuredNode?.operation === "subflow.invoke") {
    await assertWorkflowDocumentDependencies(input.scope, edited.workflow, draft.baseCommitSha);
  }
  return updateWorkflowDraft({''',
)
replace_between(
    "apps/webapp/app/features/flowcordia/workflows/drafts/service.server.ts",
    "async function assertWorkflowDraftDependencies(",
    "\nexport async function getPublishableWorkflowDraft",
    '''async function assertWorkflowDocumentDependencies(
  scope: WorkflowDraftScope,
  workflow: WorkflowDefinition,
  sourceCommitSha: string
): Promise<void> {
  const entries = await listWorkflowIndexEntries(scope);
  const analysis = analyzeFlowcordiaWorkflowDependencyGraph({
    rootWorkflowId: workflow.id,
    sourceCommitSha,
    rootSubflowWorkflowIds: collectFlowcordiaSubflowWorkflowIds(workflow),
    entries: entries.map((entry) => ({
      workflowId: entry.workflowId,
      status: entry.status,
      sourceCommitSha: entry.sourceCommitSha,
      dependencyMetadataVersion: entry.dependencyMetadataVersion,
      subflowWorkflowIds: entry.subflowWorkflowIds,
    })),
  });
  if (!analysis.success) {
    throw new WorkflowDraftError(
      "compilation_failed",
      analysis.issues[0]?.message ?? "The subflow dependency graph is not safe to publish."
    );
  }
  const contractIssue = validateFlowcordiaSubflowContractBindings({
    workflow,
    sourceCommitSha,
    entries,
  })[0];
  if (contractIssue) {
    throw new WorkflowDraftError("compilation_failed", contractIssue.message);
  }
}

async function assertWorkflowDraftDependencies(
  scope: WorkflowDraftScope,
  draft: WorkflowDraftRecord
): Promise<void> {
  await assertWorkflowDocumentDependencies(scope, draft.document, draft.baseCommitSha);
}
''',
)

replace_once(
    "apps/webapp/test/flowcordia/workflowSubflowDependencyPresentation.test.ts",
    '''    dependencyMetadataVersion: 1,
    subflowWorkflowIds: dependencies,
    failureCode: null,''',
    '''    dependencyMetadataVersion: 1,
    subflowWorkflowIds: dependencies,
    callableContractMetadataVersion: 1,
    callableContractState: "READY",
    callableInputSchema: { type: "object" },
    callableOutputSchema: { type: "object" },
    callableFailureCode: null,
    callableFailureMessage: null,
    failureCode: null,''',
)

write(
    "flowcordia/architecture/callable-subflow-contracts.md",
    '''# Callable subflow contracts

## Decision

A subflow target is callable only when its exact repository revision exposes one explicit object-root input schema on its single trigger and one explicit object-root return schema on its single output node. Flowcordia reuses the existing bounded function JSON Schema subset; it does not infer contracts from samples or introduce another type language.

## Durable index

Repository synchronization derives callable contracts for every valid workflow, recursively validates each stored subflow binding, and writes versioned `READY` or `BLOCKED` metadata beside the exact source commit. Invalid or uncallable workflows remain visible as top-level repository workflows; only child selection is blocked. Existing rows begin at metadata version `0` and require synchronization before they can authorize child invocation.

## Studio and server ownership

Studio receives only bounded eligibility and failure messages. When a visual subflow target changes, the browser submits the invocation configuration only. The server resolves the exact indexed target, requires a ready contract, and replaces the parent node input/output schemas from durable metadata. Browser-supplied schemas are never trusted.

Before preview or proposal publication, the server rechecks repository dependency safety and every direct parent-to-child schema binding. A ready child contract already proves its downstream callable closure at the same commit.

## Runtime boundary

The portable runtime validates the incoming task payload against the trigger contract and validates the returned value at the output node. Subflow nodes continue to validate each child payload and result. Static review and live execution therefore enforce the same schema grammar.

## Exclusions

This boundary does not atomically publish child artifacts, install missing child tasks, infer contracts, support recursive workflows, or add JSON Schema unions/references. Multi-workflow proposal and deployment closure follows after exact callable contracts are established.
''',
)
replace_once(
    "flowcordia/product/capability-matrix.md",
    '''| Child tasks and subflows | Call-workflow node | Typed invocation, exact-revision indexed child selector, versioned durable dependency metadata, missing/invalid target checks, indirect cycle prevention, deterministic preview, schema enforcement, native parent-child wait, fixed failure projection, and deployment-version locking delivered; cross-file schema compatibility and multi-workflow proposal publication remain |''',
    '''| Child tasks and subflows | Call-workflow node | Typed invocation, exact-revision indexed child selector, versioned dependency and callable-contract metadata, server-bound trigger/output schemas, missing/invalid target checks, indirect cycle prevention, deterministic preview, static/runtime boundary enforcement, native parent-child wait, fixed failure projection, and deployment-version locking delivered; multi-workflow proposal publication remains |''',
)
replace_once(
    "flowcordia/product/roadmap.md",
    '''- Support subflows, batching, parallelism, approvals, and streaming. — typed version-locked child invocation, bounded same-child batch fan-out, exact-index child selection, missing/invalid target checks, and repository-wide cycle prevention delivered; approvals, streaming batches, mixed-child parallelism, schema compatibility, and multi-workflow proposal publication remain''',
    '''- Support subflows, batching, parallelism, approvals, and streaming. — typed version-locked child invocation, bounded same-child batch fan-out, exact-index child selection, missing/invalid target checks, repository-wide cycle prevention, and exact trigger/output callable contract binding delivered; approvals, streaming batches, mixed-child parallelism, and multi-workflow proposal publication remain''',
)

print("PR100 callable contract product transformation applied")
