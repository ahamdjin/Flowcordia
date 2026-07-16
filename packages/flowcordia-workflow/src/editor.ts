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
  WorkflowNodeKind,
  WorkflowPosition,
} from "./types.js";
import { validateWorkflow } from "./validation.js";

export type WorkflowStudioTemplateId =
  | "manual_trigger"
  | "schedule_trigger"
  | "webhook_trigger"
  | "http_action"
  | "condition"
  | "wait"
  | "code_task"
  | "output";

export interface WorkflowStudioNodeTemplate {
  id: WorkflowStudioTemplateId;
  label: string;
  kind: WorkflowNodeKind;
  operation: string;
  defaultName: string;
  defaultConfiguration: JsonObject;
}

export const WORKFLOW_STUDIO_NODE_TEMPLATES: readonly WorkflowStudioNodeTemplate[] = [
  {
    id: "manual_trigger",
    label: "Manual trigger",
    kind: "trigger",
    operation: "trigger.manual",
    defaultName: "Manual trigger",
    defaultConfiguration: {},
  },
  {
    id: "schedule_trigger",
    label: "Schedule trigger",
    kind: "trigger",
    operation: "trigger.schedule",
    defaultName: "Schedule",
    defaultConfiguration: { cron: "0 9 * * 1-5", timezone: "UTC" },
  },
  {
    id: "webhook_trigger",
    label: "Webhook trigger",
    kind: "trigger",
    operation: "trigger.webhook",
    defaultName: "Webhook",
    defaultConfiguration: { method: "POST", path: "/" },
  },
  {
    id: "http_action",
    label: "HTTP request",
    kind: "action",
    operation: "action.http",
    defaultName: "HTTP request",
    defaultConfiguration: { method: "GET", url: "" },
  },
  {
    id: "condition",
    label: "Condition",
    kind: "control",
    operation: "control.condition",
    defaultName: "Condition",
    defaultConfiguration: { path: "", operator: "equals", value: null },
  },
  {
    id: "wait",
    label: "Wait",
    kind: "control",
    operation: "control.wait",
    defaultName: "Wait",
    defaultConfiguration: { durationSeconds: 60 },
  },
  {
    id: "code_task",
    label: "Code task",
    kind: "code",
    operation: "code.task",
    defaultName: "Code task",
    defaultConfiguration: {},
  },
  {
    id: "output",
    label: "Output",
    kind: "output",
    operation: "output.return",
    defaultName: "Output",
    defaultConfiguration: {},
  },
] as const;

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
      node.configuration = JSON.parse(JSON.stringify(command.configuration)) as JsonObject;
      return finish(workflow);
    }
    case "remove_node": {
      const index = workflow.nodes.findIndex((candidate) => candidate.id === command.nodeId);
      if (index === -1)
        return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);
      if (workflowNodeOwnership(workflow.nodes[index]!) === "developer") {
        return failure(
          "developer_owned",
          "Developer-owned code nodes must be removed through a reviewed repository change."
        );
      }
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
