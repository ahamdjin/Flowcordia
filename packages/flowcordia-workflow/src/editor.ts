import { validateFlowcordiaCredentialReferences } from "./credentials.js";
import {
  type WorkflowStudioNodeTemplate,
  type WorkflowStudioTemplateId,
  WORKFLOW_STUDIO_NODE_TEMPLATES,
} from "./catalog.js";
import { validateFlowcordiaExecutionPolicy } from "./execution-policy.js";
import { parseFlowcordiaHttpConfiguration } from "./http.js";
import { cloneWorkflow } from "./serialization.js";
import { findInlineSecretPath } from "./security.js";
import {
  type WorkflowFunctionDefinition,
  validateWorkflowFunctionDefinition,
} from "./functions.js";
import type {
  JsonObject,
  WorkflowDefinition,
  WorkflowIssue,
  WorkflowNode,
  WorkflowPosition,
} from "./types.js";
import { validateWorkflow } from "./validation.js";

type WorkflowEditPosition = WorkflowPosition & JsonObject;

export type WorkflowEditCommand = (
  | {
      type: "set_workflow_details";
      name?: string;
      description?: string | null;
      labels?: string[];
    }
  | {
      type: "add_node";
      templateId: WorkflowStudioTemplateId;
      position: WorkflowEditPosition;
      name?: string;
    }
  | { type: "move_node"; nodeId: string; position: WorkflowEditPosition }
  | { type: "rename_node"; nodeId: string; name: string | null }
  | { type: "set_node_configuration"; nodeId: string; configuration: JsonObject }
  | { type: "set_node_credential_references"; nodeId: string; credentialReferences: string[] }
  | { type: "set_node_runtime"; nodeId: string; runtime: JsonObject | null }
  | { type: "remove_node"; nodeId: string }
  | { type: "connect_nodes"; source: string; target: string; condition?: "true" | "false" }
  | { type: "remove_edge"; edgeId: string }
) &
  JsonObject;

export type WorkflowEditErrorCode =
  | "unsupported_template"
  | "node_not_found"
  | "edge_not_found"
  | "developer_owned"
  | "unsupported_runtime_scope"
  | "unsupported_credential_scope"
  | "unsupported_connection"
  | "cycle"
  | "self_connection"
  | "duplicate_connection"
  | "invalid_result";

export type WorkflowNodeOwnership = "visual" | "developer";

export function workflowNodeOwnership(node: WorkflowNode): WorkflowNodeOwnership {
  return node.codeReference ? "developer" : "visual";
}

export type WorkflowEditResult =
  | { success: true; workflow: WorkflowDefinition }
  | {
      success: false;
      code: WorkflowEditErrorCode;
      message: string;
      issues: readonly WorkflowIssue[];
    };

function failure(
  code: WorkflowEditErrorCode,
  message: string,
  issues: readonly WorkflowIssue[] = []
): WorkflowEditResult {
  return { success: false, code, message, issues };
}

function templateFor(id: WorkflowStudioTemplateId): WorkflowStudioNodeTemplate | undefined {
  return WORKFLOW_STUDIO_NODE_TEMPLATES.find((template) => template.id === id);
}

function normalizeEntityStem(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return normalized.length >= 2 ? normalized : "node";
}

function nextId(stem: string, used: ReadonlySet<string>): string {
  const base = normalizeEntityStem(stem);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base.slice(0, 120 - String(suffix).length)}_${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new RangeError("Unable to allocate a stable workflow entity ID.");
}

function nextNodeId(workflow: WorkflowDefinition, template: WorkflowStudioNodeTemplate): string {
  return nextId(template.id, new Set(workflow.nodes.map((node) => node.id)));
}

function nextEdgeId(workflow: WorkflowDefinition, source: string, target: string): string {
  return nextId(`${source}_to_${target}`, new Set(workflow.edges.map((edge) => edge.id)));
}

function reaches(workflow: WorkflowDefinition, start: string, target: string): boolean {
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === target) return true;
    visited.add(current);
    for (const edge of workflow.edges) {
      if (edge.source === current && !visited.has(edge.target)) queue.push(edge.target);
    }
  }
  return false;
}

function finish(workflow: WorkflowDefinition): WorkflowEditResult {
  const validated = validateWorkflow(workflow);
  if (!validated.success) {
    return failure(
      "invalid_result",
      validated.issues[0]?.message ?? "The edit would create an invalid workflow.",
      validated.issues
    );
  }
  return { success: true, workflow: validated.workflow };
}

export function addWorkflowFunctionNode(
  source: WorkflowDefinition,
  definition: WorkflowFunctionDefinition,
  position: WorkflowPosition,
  name?: string
): WorkflowEditResult {
  const functionIssues = validateWorkflowFunctionDefinition(definition);
  if (functionIssues.length > 0) {
    return failure(
      "invalid_result",
      functionIssues[0]?.message ?? "The custom function definition is invalid."
    );
  }
  const workflow = cloneWorkflow(source);
  workflow.nodes.push({
    id: nextId(`function_${definition.id}`, new Set(workflow.nodes.map((node) => node.id))),
    name: name ?? definition.name,
    kind: "code",
    operation: "code.task",
    position: { ...position },
    configuration: { functionId: definition.id },
    inputSchema: JSON.parse(JSON.stringify(definition.inputSchema)) as JsonObject,
    outputSchema: JSON.parse(JSON.stringify(definition.outputSchema)) as JsonObject,
    codeReference: { ...definition.codeReference },
  });
  return finish(workflow);
}

export function applyWorkflowEdit(
  source: WorkflowDefinition,
  command: WorkflowEditCommand
): WorkflowEditResult {
  const workflow = cloneWorkflow(source);

  switch (command.type) {
    case "set_workflow_details": {
      if (command.name !== undefined) workflow.name = command.name;
      if (command.description === null) delete workflow.description;
      else if (command.description !== undefined) workflow.description = command.description;
      if (command.labels !== undefined) workflow.labels = [...command.labels];
      return finish(workflow);
    }
    case "add_node": {
      const template = templateFor(command.templateId);
      if (!template) {
        return failure("unsupported_template", "The selected Studio node template is unsupported.");
      }
      const node: WorkflowNode = {
        id: nextNodeId(workflow, template),
        name: command.name ?? template.defaultName,
        kind: template.kind,
        operation: template.operation,
        position: { ...command.position },
        configuration: JSON.parse(JSON.stringify(template.defaultConfiguration)) as JsonObject,
      };
      workflow.nodes.push(node);
      return finish(workflow);
    }
    case "move_node": {
      const node = workflow.nodes.find((candidate) => candidate.id === command.nodeId);
      if (!node) return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);
      node.position = { ...command.position };
      return finish(workflow);
    }
    case "rename_node": {
      const node = workflow.nodes.find((candidate) => candidate.id === command.nodeId);
      if (!node) return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);
      if (command.name === null) delete node.name;
      else node.name = command.name;
      return finish(workflow);
    }
    case "set_node_configuration": {
      const node = workflow.nodes.find((candidate) => candidate.id === command.nodeId);
      if (!node) return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);
      if (workflowNodeOwnership(node) === "developer") {
        return failure(
          "developer_owned",
          "This node is backed by developer-owned code. Change its configuration in the repository."
        );
      }
      const secretPath = findInlineSecretPath(command.configuration);
      if (secretPath) {
        return failure(
          "invalid_result",
          `Configuration field "${secretPath.join(".")}" looks like an inline secret. Select a credential reference instead.`
        );
      }
      if (node.operation === "action.http") {
        const parsed = parseFlowcordiaHttpConfiguration(command.configuration);
        if (!parsed.success) {
          return failure(
            "invalid_result",
            parsed.issues[0]?.message ?? "The HTTP configuration is invalid."
          );
        }
        node.configuration = parsed.configuration;
      } else {
        node.configuration = JSON.parse(JSON.stringify(command.configuration)) as JsonObject;
      }
      return finish(workflow);
    }
    case "set_node_credential_references": {
      const node = workflow.nodes.find((candidate) => candidate.id === command.nodeId);
      if (!node) return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);
      if (workflowNodeOwnership(node) === "developer") {
        return failure(
          "developer_owned",
          "This node is backed by developer-owned code. Change its credential references in the repository."
        );
      }
      if (node.operation !== "action.http") {
        return failure(
          "unsupported_credential_scope",
          "Credential references are currently supported only for HTTP request nodes."
        );
      }
      const issue = validateFlowcordiaCredentialReferences(command.credentialReferences)[0];
      if (issue) return failure("invalid_result", issue.message);
      if (command.credentialReferences.length === 0) delete node.credentialReferences;
      else node.credentialReferences = [...command.credentialReferences];
      return finish(workflow);
    }
    case "set_node_runtime": {
      const node = workflow.nodes.find((candidate) => candidate.id === command.nodeId);
      if (!node) return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);
      if (workflowNodeOwnership(node) === "developer") {
        return failure(
          "developer_owned",
          "This node is backed by developer-owned code. Change its execution policy in the repository."
        );
      }
      if (node.kind !== "trigger") {
        return failure(
          "unsupported_runtime_scope",
          "Execution policy is supported only on the trigger, where it applies to the whole workflow run."
        );
      }
      const runtime = command.runtime as import("./types.js").WorkflowRuntimePolicy | null;
      const issue = validateFlowcordiaExecutionPolicy(runtime ?? undefined)[0];
      if (issue) return failure("invalid_result", issue.message);
      if (runtime === null || Object.keys(runtime).length === 0) delete node.runtime;
      else node.runtime = JSON.parse(JSON.stringify(runtime));
      return finish(workflow);
    }
    case "remove_node": {
      const index = workflow.nodes.findIndex((candidate) => candidate.id === command.nodeId);
      if (index === -1)
        return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);
      workflow.nodes.splice(index, 1);
      workflow.edges = workflow.edges.filter(
        (edge) => edge.source !== command.nodeId && edge.target !== command.nodeId
      );
      return finish(workflow);
    }
    case "connect_nodes": {
      const source = workflow.nodes.find((candidate) => candidate.id === command.source);
      const target = workflow.nodes.find((candidate) => candidate.id === command.target);
      if (!source) return failure("node_not_found", `Node "${command.source}" does not exist.`);
      if (!target) return failure("node_not_found", `Node "${command.target}" does not exist.`);
      if (source.id === target.id) {
        return failure("self_connection", "A node cannot connect directly to itself.");
      }
      if (source.kind === "output") {
        return failure("unsupported_connection", "Output nodes cannot connect to another node.");
      }
      if (target.kind === "trigger") {
        return failure(
          "unsupported_connection",
          "Trigger nodes cannot receive incoming connections."
        );
      }
      if (reaches(workflow, target.id, source.id)) {
        return failure("cycle", "That connection would create a directed cycle.");
      }
      if (source.operation === "control.condition" && command.condition === undefined) {
        return failure(
          "invalid_result",
          "Connections leaving a condition node must select the true or false branch."
        );
      }
      if (source.operation !== "control.condition" && command.condition !== undefined) {
        return failure(
          "invalid_result",
          "Only condition nodes can create true or false branch connections."
        );
      }
      if (
        workflow.edges.some(
          (edge) =>
            edge.source === command.source &&
            (edge.target === command.target ||
              (command.condition !== undefined && edge.condition === command.condition))
        )
      ) {
        return failure(
          "duplicate_connection",
          command.condition
            ? `The ${command.condition} branch is already connected.`
            : "Those nodes are already connected."
        );
      }
      workflow.edges.push({
        id: nextEdgeId(workflow, command.source, command.target),
        source: command.source,
        target: command.target,
        ...(command.condition ? { condition: command.condition } : {}),
      });
      return finish(workflow);
    }
    case "remove_edge": {
      const index = workflow.edges.findIndex((candidate) => candidate.id === command.edgeId);
      if (index === -1)
        return failure("edge_not_found", `Edge "${command.edgeId}" does not exist.`);
      workflow.edges.splice(index, 1);
      return finish(workflow);
    }
  }
}
