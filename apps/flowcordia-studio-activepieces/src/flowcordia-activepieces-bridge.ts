import {
  BranchExecutionType,
  FlowActionType,
  FlowOperationStatus,
  FlowStatus,
  FlowTriggerType,
  FlowVersionState,
  RouterExecutionType,
  type FlowAction,
  type FlowTrigger,
  type PopulatedFlow,
  type Step,
} from "@activepieces/shared";
import type {
  JsonObject,
  JsonValue,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@flowcordia/workflow";

export const FLOWCORDIA_BACKUP_FILE = "flowcordia/workflow-0.1.json";
export const ACTIVEPIECES_SCHEMA_VERSION = "22";

const MANUAL_TRIGGER_PIECE = "@activepieces/piece-manual-trigger";
const MANUAL_TRIGGER_VERSION = "0.0.5";
const HTTP_PIECE = "@activepieces/piece-http";
const HTTP_PIECE_VERSION = "0.11.13";
const HTTP_ACTION = "send_request";

interface FlowcordiaBridgeSidecar {
  version: 1;
  workflow: WorkflowDefinition;
}

export interface FlowcordiaActivepiecesBridgeInput {
  workflow: WorkflowDefinition;
  projectId: string;
  now?: string;
}

export class FlowcordiaActivepiecesBridgeError extends Error {
  constructor(
    readonly code:
      | "invalid_graph"
      | "missing_sidecar"
      | "unsupported_operation"
      | "unsupported_activepieces_step",
    message: string
  ) {
    super(message);
    this.name = "FlowcordiaActivepiecesBridgeError";
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return clone(value) as JsonObject;
}

function edgeHandle(edge: WorkflowEdge): string | undefined {
  return edge.sourceHandle ?? edge.condition;
}

function sidecar(workflow: WorkflowDefinition): string {
  const value: FlowcordiaBridgeSidecar = { version: 1, workflow: clone(workflow) };
  return JSON.stringify(value);
}

function parseSidecar(flow: PopulatedFlow): FlowcordiaBridgeSidecar {
  const raw = flow.version.backupFiles?.[FLOWCORDIA_BACKUP_FILE];
  if (!raw) {
    throw new FlowcordiaActivepiecesBridgeError(
      "missing_sidecar",
      "The Activepieces flow is missing its Flowcordia workflow sidecar."
    );
  }
  const value = JSON.parse(raw) as FlowcordiaBridgeSidecar;
  if (value.version !== 1 || !value.workflow) {
    throw new FlowcordiaActivepiecesBridgeError(
      "missing_sidecar",
      "The Flowcordia workflow sidecar has an unsupported version."
    );
  }
  return value;
}

function indexGraph(workflow: WorkflowDefinition) {
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  const incoming = new Map<string, WorkflowEdge[]>();

  for (const edge of workflow.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Edge ${edge.id} refers to a missing node.`
      );
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }

  for (const node of workflow.nodes) {
    const nodeIncoming = incoming.get(node.id) ?? [];
    if (node.kind !== "trigger" && nodeIncoming.length > 1) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Node ${node.id} has multiple incoming edges. Activepieces Studio cannot represent graph joins losslessly yet.`
      );
    }
  }

  const triggers = workflow.nodes.filter((node) => node.kind === "trigger");
  if (triggers.length !== 1) {
    throw new FlowcordiaActivepiecesBridgeError(
      "invalid_graph",
      "Activepieces Studio requires exactly one Flowcordia trigger node."
    );
  }

  return { nodes, outgoing, incoming, trigger: triggers[0] };
}

function commonStep(node: WorkflowNode, now: string) {
  return {
    name: node.id,
    displayName: node.name ?? node.id,
    valid: true,
    lastUpdatedDate: now,
  };
}

function sourceAction(node: WorkflowNode, now: string): FlowAction {
  const source = node.configuration.source;
  if (typeof source !== "string") {
    throw new FlowcordiaActivepiecesBridgeError(
      "invalid_graph",
      `Source node ${node.id} does not contain TypeScript source.`
    );
  }
  return {
    ...commonStep(node, now),
    type: FlowActionType.CODE,
    settings: {
      sourceCode: { packageJson: "{}", code: source },
      input: {},
      errorHandlingOptions: undefined,
    },
  };
}

function httpAction(node: WorkflowNode, now: string): FlowAction {
  const configuration = jsonObject(node.configuration);
  return {
    ...commonStep(node, now),
    type: FlowActionType.PIECE,
    settings: {
      pieceName: HTTP_PIECE,
      pieceVersion: HTTP_PIECE_VERSION,
      actionName: HTTP_ACTION,
      input: {
        method: configuration.method ?? "GET",
        url: configuration.url ?? "",
        headers: configuration.headers ?? {},
        queryParams: configuration.queryParams ?? {},
        authType: "NONE",
        body_type: configuration.bodyMode ?? "none",
        body: configuration.body ?? undefined,
      },
      propertySettings: {},
      errorHandlingOptions: undefined,
      customLogoUrl: undefined,
    },
  };
}

function conditionToBranch(node: WorkflowNode) {
  const configuration = node.configuration;
  const path = typeof configuration.path === "string" ? configuration.path : "";
  const value = configuration.value;
  const operator = configuration.operator === "equals" ? "TEXT_EXACTLY_MATCHES" : "TEXT_EXACTLY_MATCHES";
  return {
    conditions: [
      [
        {
          firstValue: path ? `{{${path}}}` : "",
          secondValue: value === null || value === undefined ? "" : String(value),
          operator,
          caseSensitive: true,
        },
      ],
    ],
    branchType: BranchExecutionType.CONDITION,
    branchName: "true",
  };
}

function edgeForHandle(edges: WorkflowEdge[], handle: "true" | "false"): WorkflowEdge | undefined {
  return edges.find((edge) => edgeHandle(edge) === handle);
}

function toTrigger(node: WorkflowNode, now: string): FlowTrigger {
  if (node.operation !== "trigger.manual") {
    throw new FlowcordiaActivepiecesBridgeError(
      "unsupported_operation",
      `Trigger operation ${node.operation} is not connected to the Activepieces builder yet.`
    );
  }
  return {
    ...commonStep(node, now),
    type: FlowTriggerType.PIECE,
    settings: {
      pieceName: MANUAL_TRIGGER_PIECE,
      pieceVersion: MANUAL_TRIGGER_VERSION,
      triggerName: "manual_trigger",
      input: {},
      propertySettings: {},
      customLogoUrl: undefined,
    },
  };
}

export function flowcordiaWorkflowToActivepieces({
  workflow,
  projectId,
  now = new Date().toISOString(),
}: FlowcordiaActivepiecesBridgeInput): PopulatedFlow {
  const graph = indexGraph(workflow);
  const visited = new Set<string>();

  const buildAction = (nodeId: string): FlowAction | undefined => {
    const node = graph.nodes.get(nodeId);
    if (!node) return undefined;
    if (node.kind === "output") return undefined;
    if (visited.has(node.id)) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Workflow cycle or graph join detected at ${node.id}.`
      );
    }
    visited.add(node.id);

    const edges = graph.outgoing.get(node.id) ?? [];
    if (node.operation === "control.condition") {
      const trueEdge = edgeForHandle(edges, "true");
      const falseEdge = edgeForHandle(edges, "false");
      if (!trueEdge || !falseEdge || edges.length !== 2) {
        throw new FlowcordiaActivepiecesBridgeError(
          "invalid_graph",
          `Condition ${node.id} must have exactly true and false branches.`
        );
      }
      return {
        ...commonStep(node, now),
        type: FlowActionType.ROUTER,
        settings: {
          branches: [
            conditionToBranch(node),
            { branchType: BranchExecutionType.FALLBACK, branchName: "false" },
          ],
          executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
        },
        children: [buildAction(trueEdge.target) ?? null, buildAction(falseEdge.target) ?? null],
      };
    }

    if (edges.length > 1) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Node ${node.id} has more than one outgoing edge without an explicit condition.`
      );
    }

    const action =
      node.operation === "code.typescript"
        ? sourceAction(node, now)
        : node.operation === "action.http"
          ? httpAction(node, now)
          : (() => {
              throw new FlowcordiaActivepiecesBridgeError(
                "unsupported_operation",
                `Node operation ${node.operation} is not connected to the Activepieces builder yet.`
              );
            })();

    const next = edges[0] ? buildAction(edges[0].target) : undefined;
    if (next) action.nextAction = next;
    return action;
  };

  const triggerEdges = graph.outgoing.get(graph.trigger.id) ?? [];
  if (triggerEdges.length > 1) {
    throw new FlowcordiaActivepiecesBridgeError(
      "invalid_graph",
      "The trigger must have at most one next step."
    );
  }
  const trigger = toTrigger(graph.trigger, now);
  const next = triggerEdges[0] ? buildAction(triggerEdges[0].target) : undefined;
  if (next) trigger.nextAction = next;

  const credentialIds = Array.from(
    new Set(workflow.nodes.flatMap((node) => node.credentialReferences ?? []))
  );
  const versionId = `${workflow.id}-draft`;

  return {
    id: workflow.id,
    created: now,
    updated: now,
    projectId,
    externalId: workflow.id,
    ownerId: null,
    folderId: null,
    status: FlowStatus.DISABLED,
    publishedVersionId: null,
    metadata: { flowcordiaSchemaVersion: workflow.schemaVersion },
    operationStatus: FlowOperationStatus.NONE,
    timeSavedPerRun: null,
    templateId: null,
    createdBy: null,
    version: {
      id: versionId,
      created: now,
      updated: now,
      flowId: workflow.id,
      displayName: workflow.name,
      trigger,
      updatedBy: null,
      valid: true,
      schemaVersion: ACTIVEPIECES_SCHEMA_VERSION,
      agentIds: [],
      state: FlowVersionState.DRAFT,
      connectionIds: credentialIds,
      backupFiles: { [FLOWCORDIA_BACKUP_FILE]: sidecar(workflow) },
      notes: [],
    },
    triggerSource: undefined,
  };
}

function allSteps(trigger: FlowTrigger): Step[] {
  const result: Step[] = [];
  const visit = (step: Step | undefined | null) => {
    if (!step) return;
    result.push(step);
    if (step.type === FlowActionType.ROUTER) {
      for (const child of step.children) visit(child);
    } else if (step.type === FlowActionType.LOOP_ON_ITEMS) {
      visit(step.firstLoopAction);
    }
    visit(step.nextAction);
  };
  visit(trigger);
  return result;
}

function originalNodeById(workflow: WorkflowDefinition, id: string): WorkflowNode | undefined {
  return workflow.nodes.find((node) => node.id === id);
}

function positionFor(original: WorkflowNode | undefined, depth: number, branch: number) {
  return original?.position ?? { x: 80 + depth * 280, y: 160 + branch * 220 };
}

function nodeFromStep(
  step: Step,
  original: WorkflowNode | undefined,
  depth: number,
  branch: number
): WorkflowNode {
  const base = {
    id: step.name,
    name: step.displayName,
    position: positionFor(original, depth, branch),
    credentialReferences: original?.credentialReferences,
    inputSchema: original?.inputSchema,
    outputSchema: original?.outputSchema,
    runtime: original?.runtime,
    codeReference: original?.codeReference,
  };

  if (step.type === FlowTriggerType.PIECE) {
    if (step.settings.pieceName !== MANUAL_TRIGGER_PIECE) {
      throw new FlowcordiaActivepiecesBridgeError(
        "unsupported_activepieces_step",
        `Activepieces trigger ${step.settings.pieceName} is not mapped to Flowcordia yet.`
      );
    }
    return { ...base, kind: "trigger", operation: "trigger.manual", configuration: {} };
  }

  if (step.type === FlowActionType.CODE) {
    return {
      ...base,
      kind: "code",
      operation: "code.typescript",
      configuration: {
        ...(original?.configuration ?? {}),
        language: "typescript",
        entrypoint: "run",
        source: step.settings.sourceCode.code,
        credentialReferences: original?.credentialReferences ?? [],
      },
    };
  }

  if (step.type === FlowActionType.PIECE && step.settings.pieceName === HTTP_PIECE) {
    const input = jsonObject(step.settings.input);
    return {
      ...base,
      kind: "action",
      operation: "action.http",
      configuration: {
        ...(original?.configuration ?? {}),
        method: input.method ?? "GET",
        url: input.url ?? "",
        headers: input.headers ?? {},
        queryParams: input.queryParams ?? {},
        bodyMode: input.body_type ?? "none",
        ...(input.body === undefined ? {} : { body: input.body }),
      },
    };
  }

  if (step.type === FlowActionType.ROUTER) {
    const condition = step.settings.branches[0]?.conditions?.[0]?.[0];
    const rawPath = condition?.firstValue;
    const path = typeof rawPath === "string" ? rawPath.replace(/^{{|}}$/g, "") : "";
    const originalValue = original?.configuration.value;
    return {
      ...base,
      kind: "control",
      operation: "control.condition",
      configuration: {
        path,
        operator: "equals",
        value:
          typeof originalValue === "number" && condition?.secondValue !== undefined
            ? Number(condition.secondValue)
            : (condition?.secondValue as JsonValue | undefined) ?? null,
      },
    };
  }

  throw new FlowcordiaActivepiecesBridgeError(
    "unsupported_activepieces_step",
    `Activepieces step ${step.name} cannot be represented by the Flowcordia contract yet.`
  );
}

function reusableEdge(
  original: WorkflowDefinition,
  source: string,
  target: string,
  handle?: string
): WorkflowEdge {
  const found = original.edges.find(
    (edge) => edge.source === source && edge.target === target && edgeHandle(edge) === handle
  );
  if (found) return clone(found);
  return {
    id: `${source}_to_${target}${handle ? `_${handle}` : ""}`,
    source,
    target,
    ...(handle ? { sourceHandle: handle, condition: handle } : {}),
  };
}

export function activepiecesFlowToFlowcordia(flow: PopulatedFlow): WorkflowDefinition {
  const original = parseSidecar(flow).workflow;
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const seen = new Set<string>();

  const addNode = (step: Step, depth: number, branch: number) => {
    if (seen.has(step.name)) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Activepieces step ${step.name} occurs more than once.`
      );
    }
    seen.add(step.name);
    nodes.push(nodeFromStep(step, originalNodeById(original, step.name), depth, branch));
  };

  const visit = (
    step: Step | undefined | null,
    parentId?: string,
    handle?: "true" | "false",
    depth = 0,
    branch = 0
  ) => {
    if (!step) {
      if (parentId && handle) {
        const outputEdge = original.edges.find(
          (edge) => edge.source === parentId && edgeHandle(edge) === handle
        );
        const output = outputEdge ? originalNodeById(original, outputEdge.target) : undefined;
        if (output?.kind === "output") {
          if (!seen.has(output.id)) {
            seen.add(output.id);
            nodes.push(clone(output));
          }
          edges.push(reusableEdge(original, parentId, output.id, handle));
        }
      }
      return;
    }

    addNode(step, depth, branch);
    if (parentId) edges.push(reusableEdge(original, parentId, step.name, handle));

    if (step.type === FlowActionType.ROUTER) {
      if (step.nextAction) {
        throw new FlowcordiaActivepiecesBridgeError(
          "invalid_graph",
          `Router ${step.name} has a post-router action, which Flowcordia cannot represent losslessly yet.`
        );
      }
      visit(step.children[0], step.name, "true", depth + 1, branch - 1);
      visit(step.children[1], step.name, "false", depth + 1, branch + 1);
      return;
    }

    visit(step.nextAction, step.name, undefined, depth + 1, branch);
  };

  visit(flow.version.trigger);

  const result: WorkflowDefinition = {
    ...clone(original),
    name: flow.version.displayName,
    nodes,
    edges,
    metadata: {
      ...(original.metadata ?? {}),
      updatedAt: flow.version.updated,
    },
  };

  const sidecarSteps = allSteps(flow.version.trigger);
  if (sidecarSteps.length !== nodes.filter((node) => node.kind !== "output").length) {
    throw new FlowcordiaActivepiecesBridgeError(
      "invalid_graph",
      "Not every Activepieces step was represented in the Flowcordia workflow."
    );
  }
  return result;
}
