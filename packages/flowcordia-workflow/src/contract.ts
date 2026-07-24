import { cloneWorkflow } from "./serialization.js";
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
        message:
          "Callable workflows require exactly one output node with an explicit return contract.",
        path: ["nodes"],
      },
    };
  }
  const trigger = triggers[0]!;
  const output = outputs[0]!;
  const triggerIndex = workflow.nodes.indexOf(trigger);
  const outputIndex = workflow.nodes.indexOf(output);
  const inputIssue = schemaIssue("invalid_input_contract", "input", trigger.outputSchema, [
    "nodes",
    triggerIndex,
    "outputSchema",
  ]);
  if (inputIssue) return { success: false, issue: inputIssue };
  const outputIssue = schemaIssue("invalid_output_contract", "output", output.inputSchema, [
    "nodes",
    outputIndex,
    "inputSchema",
  ]);
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
  const resolve = (
    workflowId: string,
    stack: readonly string[]
  ): FlowcordiaCallableContractResolution => {
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
}): { success: true; workflow: WorkflowDefinition } | { success: false; message: string } {
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
