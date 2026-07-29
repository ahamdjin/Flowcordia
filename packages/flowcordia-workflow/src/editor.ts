import { parseFlowcordiaApiTriggerConfiguration } from "./api-trigger.js";
import { parseFlowcordiaApprovalConfiguration } from "./approval.js";
import { validateFlowcordiaCredentialReferences } from "./credentials.js";
import {
  type WorkflowStudioNodeTemplate,
  type WorkflowStudioTemplateId,
  WORKFLOW_STUDIO_NODE_TEMPLATES,
} from "./catalog.js";
import { validateFlowcordiaExecutionPolicy } from "./execution-policy.js";
import { parseFlowcordiaHttpConfiguration } from "./http.js";
import { parseFlowcordiaMappingConfiguration } from "./mapping.js";
import { cloneWorkflow } from "./serialization.js";
import { findInlineSecretPath } from "./security.js";
import { isReachable } from "@flowcordia/foundation";
import { parseFlowcordiaSubflowConfiguration } from "./subflow.js";
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
type WorkflowEditMove = { nodeId: string; position: WorkflowEditPosition } & JsonObject;

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
  | {
      type: "add_connected_node";
      templateId: WorkflowStudioTemplateId;
      position: WorkflowEditPosition;
      source: string;
      condition?: "true" | "false";
      name?: string;
    }
  | {
      type: "insert_node_on_edge";
      templateId: WorkflowStudioTemplateId;
      position: WorkflowEditPosition;
      edgeId: string;
      name?: string;
    }
  | { type: "move_node"; nodeId: string; position: WorkflowEditPosition }
  | { type: "move_nodes"; moves: WorkflowEditMove[] }
  | { type: "duplicate_subgraph"; nodeIds: string[]; offset: WorkflowEditPosition }
  | { type: "remove_nodes"; nodeIds: string[] }
  | { type: "rename_node"; nodeId: string; name: string | null }
  | { type: "set_node_configuration"; nodeId: string; configuration: JsonObject }
  | { type: "set_node_credential_references"; nodeId: string; credentialReferences: string[] }
  | { type: "set_node_runtime"; nodeId: string; runtime: JsonObject | null }
  | { type: "remove_node"; nodeId: string }
  | { type: "connect_nodes"; source: string; target: string; condition?: "true" | "false" }
  | { type: "replace_edge"; edgeId: string; target: string; condition?: "true" | "false" }
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

function createTemplateNode(
  workflow: WorkflowDefinition,
  template: WorkflowStudioNodeTemplate,
  position: WorkflowEditPosition,
  name?: string
): WorkflowNode {
  return {
    id: nextNodeId(workflow, template),
    name: name ?? template.defaultName,
    kind: template.kind,
    operation: template.operation,
    position: { ...position },
    configuration: JSON.parse(JSON.stringify(template.defaultConfiguration)) as JsonObject,
    ...(template.defaultInputSchema
      ? { inputSchema: JSON.parse(JSON.stringify(template.defaultInputSchema)) as JsonObject }
      : {}),
    ...(template.defaultOutputSchema
      ? { outputSchema: JSON.parse(JSON.stringify(template.defaultOutputSchema)) as JsonObject }
      : {}),
  };
}

function connectNodesInWorkflow(
  workflow: WorkflowDefinition,
  input: {
    source: string;
    target: string;
    condition?: "true" | "false";
    edgeId?: string;
    sourceHandle?: string;
    targetHandle?: string;
    insertAt?: number;
  }
): WorkflowEditResult | null {
  const source = workflow.nodes.find((candidate) => candidate.id === input.source);
  const target = workflow.nodes.find((candidate) => candidate.id === input.target);
  if (!source) return failure("node_not_found", 'Node "' + input.source + '" does not exist.');
  if (!target) return failure("node_not_found", 'Node "' + input.target + '" does not exist.');
  if (source.id === target.id) {
    return failure("self_connection", "A node cannot connect directly to itself.");
  }
  if (source.kind === "output") {
    return failure("unsupported_connection", "Output nodes cannot connect to another node.");
  }
  if (target.kind === "trigger") {
    return failure("unsupported_connection", "Trigger nodes cannot receive incoming connections.");
  }
  if (
    isReachable(
      workflow.nodes.map((node) => node.id),
      workflow.edges,
      target.id,
      source.id
    )
  ) {
    return failure("cycle", "That connection would create a directed cycle.");
  }
  if (source.operation === "control.condition" && input.condition === undefined) {
    return failure(
      "invalid_result",
      "Connections leaving a condition node must select the true or false branch."
    );
  }
  if (source.operation !== "control.condition" && input.condition !== undefined) {
    return failure(
      "invalid_result",
      "Only condition nodes can create true or false branch connections."
    );
  }
  if (
    workflow.edges.some(
      (edge) =>
        edge.source === input.source &&
        (edge.target === input.target ||
          (input.condition !== undefined && edge.condition === input.condition))
    )
  ) {
    return failure(
      "duplicate_connection",
      input.condition
        ? "The " + input.condition + " branch is already connected."
        : "Those nodes are already connected."
    );
  }
  const edge = {
    id: input.edgeId ?? nextEdgeId(workflow, input.source, input.target),
    source: input.source,
    target: input.target,
    ...(input.sourceHandle === undefined ? {} : { sourceHandle: input.sourceHandle }),
    ...(input.targetHandle === undefined ? {} : { targetHandle: input.targetHandle }),
    ...(input.condition === undefined ? {} : { condition: input.condition }),
  };
  if (input.insertAt === undefined) workflow.edges.push(edge);
  else workflow.edges.splice(input.insertAt, 0, edge);
  return null;
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

export function pasteWorkflowSubgraph(input: {
  target: WorkflowDefinition;
  source: WorkflowDefinition;
  nodeIds: readonly string[];
  offset: WorkflowPosition;
}): WorkflowEditResult {
  const workflow = cloneWorkflow(input.target);
  const selectedIds = new Set(input.nodeIds);
  if (selectedIds.size !== input.nodeIds.length) {
    return failure("invalid_result", "Node IDs must be unique.");
  }
  const originals = input.source.nodes.filter((node) => selectedIds.has(node.id));
  if (originals.length !== selectedIds.size) {
    const missingNodeId = input.nodeIds.find(
      (nodeId) => !input.source.nodes.some((node) => node.id === nodeId)
    );
    return failure("node_not_found", `Node "${missingNodeId ?? "unknown"}" does not exist.`);
  }

  const usedNodeIds = new Set(workflow.nodes.map((node) => node.id));
  const pastedNodeIds = new Map<string, string>();
  const pastedNodes = originals.map((node) => {
    const id = nextId(node.id, usedNodeIds);
    usedNodeIds.add(id);
    pastedNodeIds.set(node.id, id);
    const pasted = JSON.parse(JSON.stringify(node)) as WorkflowNode;
    pasted.id = id;
    pasted.position = {
      x: node.position.x + input.offset.x,
      y: node.position.y + input.offset.y,
    };
    if (pasted.name) pasted.name = `${pasted.name} copy`.slice(0, 160);
    return pasted;
  });
  workflow.nodes.push(...pastedNodes);

  const usedEdgeIds = new Set(workflow.edges.map((edge) => edge.id));
  const pastedEdges = input.source.edges
    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .map((edge) => {
      const pasted = JSON.parse(JSON.stringify(edge)) as (typeof workflow.edges)[number];
      pasted.id = nextId(edge.id, usedEdgeIds);
      usedEdgeIds.add(pasted.id);
      pasted.source = pastedNodeIds.get(edge.source)!;
      pasted.target = pastedNodeIds.get(edge.target)!;
      return pasted;
    });
  workflow.edges.push(...pastedEdges);
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
      workflow.nodes.push(createTemplateNode(workflow, template, command.position, command.name));
      return finish(workflow);
    }
    case "add_connected_node": {
      const template = templateFor(command.templateId);
      if (!template) {
        return failure("unsupported_template", "The selected Studio node template is unsupported.");
      }
      const node = createTemplateNode(workflow, template, command.position, command.name);
      workflow.nodes.push(node);
      const connectionFailure = connectNodesInWorkflow(workflow, {
        source: command.source,
        target: node.id,
        ...(command.condition === undefined ? {} : { condition: command.condition }),
      });
      if (connectionFailure) return connectionFailure;
      return finish(workflow);
    }
    case "insert_node_on_edge": {
      const edgeIndex = workflow.edges.findIndex((candidate) => candidate.id === command.edgeId);
      if (edgeIndex === -1) {
        return failure("edge_not_found", 'Edge "' + command.edgeId + '" does not exist.');
      }
      const template = templateFor(command.templateId);
      if (!template) {
        return failure("unsupported_template", "The selected Studio node template is unsupported.");
      }
      const current = workflow.edges[edgeIndex]!;
      workflow.edges.splice(edgeIndex, 1);
      const node = createTemplateNode(workflow, template, command.position, command.name);
      workflow.nodes.push(node);
      const condition =
        current.condition === "true" || current.condition === "false"
          ? current.condition
          : undefined;
      const incomingFailure = connectNodesInWorkflow(workflow, {
        source: current.source,
        target: node.id,
        edgeId: current.id,
        insertAt: edgeIndex,
        ...(current.sourceHandle === undefined ? {} : { sourceHandle: current.sourceHandle }),
        ...(condition === undefined ? {} : { condition }),
      });
      if (incomingFailure) return incomingFailure;
      const outgoingFailure = connectNodesInWorkflow(workflow, {
        source: node.id,
        target: current.target,
        insertAt: edgeIndex + 1,
        ...(current.targetHandle === undefined ? {} : { targetHandle: current.targetHandle }),
      });
      if (outgoingFailure) return outgoingFailure;
      return finish(workflow);
    }
    case "move_node": {
      const node = workflow.nodes.find((candidate) => candidate.id === command.nodeId);
      if (!node) return failure("node_not_found", `Node "${command.nodeId}" does not exist.`);
      node.position = { ...command.position };
      return finish(workflow);
    }
    case "move_nodes": {
      const moveIds = command.moves.map((move) => move.nodeId);
      if (new Set(moveIds).size !== moveIds.length) {
        return failure("invalid_result", "Each node can move only once per command.");
      }
      const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
      for (const move of command.moves) {
        if (!nodesById.has(move.nodeId)) {
          return failure("node_not_found", `Node "${move.nodeId}" does not exist.`);
        }
      }
      for (const move of command.moves) {
        nodesById.get(move.nodeId)!.position = { ...move.position };
      }
      return finish(workflow);
    }
    case "duplicate_subgraph": {
      const selectedIds = new Set(command.nodeIds);
      if (selectedIds.size !== command.nodeIds.length) {
        return failure("invalid_result", "Node IDs must be unique.");
      }
      const originals = workflow.nodes.filter((node) => selectedIds.has(node.id));
      if (originals.length !== selectedIds.size) {
        const missingNodeId = command.nodeIds.find(
          (nodeId) => !workflow.nodes.some((node) => node.id === nodeId)
        );
        return failure("node_not_found", `Node "${missingNodeId ?? "unknown"}" does not exist.`);
      }

      const usedNodeIds = new Set(workflow.nodes.map((node) => node.id));
      const duplicatedNodeIds = new Map<string, string>();
      const duplicates = originals.map((node) => {
        const id = nextId(`${node.id}_copy`, usedNodeIds);
        usedNodeIds.add(id);
        duplicatedNodeIds.set(node.id, id);
        const duplicate = JSON.parse(JSON.stringify(node)) as WorkflowNode;
        duplicate.id = id;
        duplicate.position = {
          x: node.position.x + command.offset.x,
          y: node.position.y + command.offset.y,
        };
        if (duplicate.name) duplicate.name = `${duplicate.name} copy`.slice(0, 160);
        return duplicate;
      });
      workflow.nodes.push(...duplicates);

      const usedEdgeIds = new Set(workflow.edges.map((edge) => edge.id));
      const duplicatedEdges = workflow.edges
        .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
        .map((edge) => {
          const duplicate = JSON.parse(JSON.stringify(edge)) as (typeof workflow.edges)[number];
          duplicate.id = nextId(`${edge.id}_copy`, usedEdgeIds);
          usedEdgeIds.add(duplicate.id);
          duplicate.source = duplicatedNodeIds.get(edge.source)!;
          duplicate.target = duplicatedNodeIds.get(edge.target)!;
          return duplicate;
        });
      workflow.edges.push(...duplicatedEdges);
      return finish(workflow);
    }
    case "remove_nodes": {
      const selectedIds = new Set(command.nodeIds);
      if (selectedIds.size !== command.nodeIds.length) {
        return failure("invalid_result", "Node IDs must be unique.");
      }
      const missingNodeId = command.nodeIds.find(
        (nodeId) => !workflow.nodes.some((node) => node.id === nodeId)
      );
      if (missingNodeId) {
        return failure("node_not_found", `Node "${missingNodeId}" does not exist.`);
      }
      workflow.nodes = workflow.nodes.filter((node) => !selectedIds.has(node.id));
      workflow.edges = workflow.edges.filter(
        (edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)
      );
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
      if (node.operation === "trigger.api") {
        const parsed = parseFlowcordiaApiTriggerConfiguration(command.configuration);
        if (!parsed.success) {
          return failure(
            "invalid_result",
            parsed.issues[0]?.message ?? "The API trigger configuration is invalid."
          );
        }
        node.configuration = parsed.configuration;
      } else if (node.operation === "action.http") {
        const parsed = parseFlowcordiaHttpConfiguration(command.configuration);
        if (!parsed.success) {
          return failure(
            "invalid_result",
            parsed.issues[0]?.message ?? "The HTTP configuration is invalid."
          );
        }
        node.configuration = parsed.configuration;
      } else if (node.operation === "approval.human") {
        const parsed = parseFlowcordiaApprovalConfiguration(command.configuration);
        if (!parsed.success) {
          return failure(
            "invalid_result",
            parsed.issues[0]?.message ?? "The approval configuration is invalid."
          );
        }
        node.configuration = parsed.configuration;
      } else if (node.operation === "data.map") {
        const parsed = parseFlowcordiaMappingConfiguration(command.configuration);
        if (!parsed.success) {
          return failure(
            "invalid_result",
            parsed.issues[0]?.message ?? "The mapping configuration is invalid."
          );
        }
        node.configuration = parsed.configuration;
      } else if (node.operation === "subflow.invoke") {
        const parsed = parseFlowcordiaSubflowConfiguration(command.configuration);
        if (!parsed.success) {
          return failure(
            "invalid_result",
            parsed.issues[0]?.message ?? "The subflow configuration is invalid."
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
      const connectionFailure = connectNodesInWorkflow(workflow, {
        source: command.source,
        target: command.target,
        ...(command.condition === undefined ? {} : { condition: command.condition }),
      });
      if (connectionFailure) return connectionFailure;
      return finish(workflow);
    }
    case "replace_edge": {
      const index = workflow.edges.findIndex((candidate) => candidate.id === command.edgeId);
      if (index === -1)
        return failure("edge_not_found", `Edge "${command.edgeId}" does not exist.`);
      const current = workflow.edges[index]!;
      const source = workflow.nodes.find((candidate) => candidate.id === current.source);
      const target = workflow.nodes.find((candidate) => candidate.id === command.target);
      if (!source) return failure("node_not_found", `Node "${current.source}" does not exist.`);
      if (!target) return failure("node_not_found", `Node "${command.target}" does not exist.`);

      workflow.edges.splice(index, 1);
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
      if (
        isReachable(
          workflow.nodes.map((node) => node.id),
          workflow.edges,
          target.id,
          source.id
        )
      ) {
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
            edge.source === source.id &&
            (edge.target === target.id ||
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

      workflow.edges.splice(index, 0, {
        id: current.id,
        source: current.source,
        target: target.id,
        ...(current.sourceHandle === undefined ? {} : { sourceHandle: current.sourceHandle }),
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
