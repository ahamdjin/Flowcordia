import {
  BranchExecutionType,
  BranchOperator,
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

type ConditionValue = {
  firstValue?: unknown;
  secondValue?: unknown;
};

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

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (clone(value) as JsonObject)
    : {};
}

function edgeHandle(edge: WorkflowEdge): string | undefined {
  return edge.sourceHandle ?? edge.condition;
}

function encodeSidecar(workflow: WorkflowDefinition): string {
  const sidecar: FlowcordiaBridgeSidecar = { version: 1, workflow: clone(workflow) };
  return JSON.stringify(sidecar);
}

function decodeSidecar(flow: PopulatedFlow): WorkflowDefinition {
  const raw = flow.version.backupFiles?.[FLOWCORDIA_BACKUP_FILE];
  if (!raw) {
    throw new FlowcordiaActivepiecesBridgeError(
      "missing_sidecar",
      "The Activepieces flow is missing its Flowcordia workflow sidecar."
    );
  }
  const sidecar = JSON.parse(raw) as Partial<FlowcordiaBridgeSidecar>;
  if (sidecar.version !== 1 || !sidecar.workflow) {
    throw new FlowcordiaActivepiecesBridgeError(
      "missing_sidecar",
      "The Flowcordia workflow sidecar has an unsupported version."
    );
  }
  return sidecar.workflow;
}

function graphFor(workflow: WorkflowDefinition) {
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
    if (node.kind !== "trigger" && (incoming.get(node.id)?.length ?? 0) > 1) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Node ${node.id} has multiple incoming edges. Activepieces cannot represent this graph join losslessly.`
      );
    }
  }

  const triggers = workflow.nodes.filter((node) => node.kind === "trigger");
  if (triggers.length !== 1) {
    throw new FlowcordiaActivepiecesBridgeError(
      "invalid_graph",
      "Activepieces Studio requires exactly one Flowcordia trigger."
    );
  }

  return { nodes, outgoing, trigger: triggers[0] };
}

function commonStep(node: WorkflowNode, now: string) {
  return {
    name: node.id,
    displayName: node.name ?? node.id,
    valid: true,
    lastUpdatedDate: now,
  };
}

function toManualTrigger(node: WorkflowNode, now: string): FlowTrigger {
  if (node.operation !== "trigger.manual") {
    throw new FlowcordiaActivepiecesBridgeError(
      "unsupported_operation",
      `Trigger operation ${node.operation} is not mapped to Activepieces yet.`
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

function toSourceAction(node: WorkflowNode, now: string): FlowAction {
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

function toHttpAction(node: WorkflowNode, now: string): FlowAction {
  const configuration = asJsonObject(node.configuration);
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
        ...(configuration.headers === undefined ? {} : { headers: configuration.headers }),
        ...(configuration.queryParams === undefined
          ? {}
          : { queryParams: configuration.queryParams }),
        authType: "NONE",
        ...(configuration.bodyMode === undefined ? {} : { body_type: configuration.bodyMode }),
        ...(configuration.body === undefined ? {} : { body: configuration.body }),
      },
      propertySettings: {},
      errorHandlingOptions: undefined,
      customLogoUrl: undefined,
    },
  };
}

function toConditionAction(
  node: WorkflowNode,
  trueChild: FlowAction | null,
  falseChild: FlowAction | null,
  now: string
): FlowAction {
  const path = typeof node.configuration.path === "string" ? node.configuration.path : "";
  const rawValue = node.configuration.value;
  const secondValue = rawValue === null || rawValue === undefined ? "" : String(rawValue);
  return {
    ...commonStep(node, now),
    type: FlowActionType.ROUTER,
    settings: {
      branches: [
        {
          branchType: BranchExecutionType.CONDITION,
          branchName: "true",
          conditions: [
            [
              {
                firstValue: path ? `{{${path}}}` : "",
                secondValue,
                operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                caseSensitive: true,
              },
            ],
          ],
        },
        { branchType: BranchExecutionType.FALLBACK, branchName: "false" },
      ],
      executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
    },
    children: [trueChild, falseChild],
  };
}

export function flowcordiaWorkflowToActivepieces({
  workflow,
  projectId,
  now = new Date().toISOString(),
}: FlowcordiaActivepiecesBridgeInput): PopulatedFlow {
  const graph = graphFor(workflow);
  const visited = new Set<string>();

  const build = (nodeId: string): FlowAction | undefined => {
    const node = graph.nodes.get(nodeId);
    if (!node || node.kind === "output") return undefined;
    if (visited.has(node.id)) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Workflow cycle or graph join detected at ${node.id}.`
      );
    }
    visited.add(node.id);
    const edges = graph.outgoing.get(node.id) ?? [];

    if (node.operation === "control.condition") {
      const trueEdge = edges.find((edge) => edgeHandle(edge) === "true");
      const falseEdge = edges.find((edge) => edgeHandle(edge) === "false");
      if (!trueEdge || !falseEdge || edges.length !== 2) {
        throw new FlowcordiaActivepiecesBridgeError(
          "invalid_graph",
          `Condition ${node.id} must contain exactly true and false branches.`
        );
      }
      return toConditionAction(
        node,
        build(trueEdge.target) ?? null,
        build(falseEdge.target) ?? null,
        now
      );
    }

    if (edges.length > 1) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Node ${node.id} has multiple outgoing edges without an explicit condition.`
      );
    }

    const action =
      node.operation === "code.typescript"
        ? toSourceAction(node, now)
        : node.operation === "action.http"
          ? toHttpAction(node, now)
          : (() => {
              throw new FlowcordiaActivepiecesBridgeError(
                "unsupported_operation",
                `Node operation ${node.operation} is not mapped to Activepieces yet.`
              );
            })();
    const next = edges[0] ? build(edges[0].target) : undefined;
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
  const trigger = toManualTrigger(graph.trigger, now);
  const next = triggerEdges[0] ? build(triggerEdges[0].target) : undefined;
  if (next) trigger.nextAction = next;

  const credentialIds = Array.from(
    new Set(workflow.nodes.flatMap((node) => node.credentialReferences ?? []))
  );

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
      id: `${workflow.id}-draft`,
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
      backupFiles: { [FLOWCORDIA_BACKUP_FILE]: encodeSidecar(workflow) },
      notes: [],
    },
    triggerSource: undefined,
  };
}

function originalNode(workflow: WorkflowDefinition, id: string): WorkflowNode | undefined {
  return workflow.nodes.find((node) => node.id === id);
}

function positionFor(original: WorkflowNode | undefined, depth: number, branch: number) {
  return original?.position ?? { x: 80 + depth * 280, y: 160 + branch * 220 };
}

function fromStep(
  step: Step,
  original: WorkflowNode | undefined,
  depth: number,
  branch: number
): WorkflowNode {
  const base = original
    ? { ...clone(original), id: step.name, name: step.displayName }
    : {
        id: step.name,
        name: step.displayName,
        position: positionFor(undefined, depth, branch),
      };

  if (step.type === FlowTriggerType.PIECE && "triggerName" in step.settings) {
    if (step.settings.pieceName !== MANUAL_TRIGGER_PIECE) {
      throw new FlowcordiaActivepiecesBridgeError(
        "unsupported_activepieces_step",
        `Activepieces trigger ${step.settings.pieceName} is not mapped to Flowcordia yet.`
      );
    }
    return {
      ...base,
      kind: "trigger",
      operation: "trigger.manual",
      configuration: original?.configuration ?? {},
    };
  }

  if (step.type === FlowActionType.CODE) {
    const credentialReferences = original?.credentialReferences ?? [];
    return {
      ...base,
      kind: "code",
      operation: "code.typescript",
      configuration: {
        ...(original?.configuration ?? {}),
        language: "typescript",
        entrypoint: "run",
        source: step.settings.sourceCode.code,
        credentialReferences,
      },
      credentialReferences,
    };
  }

  if (
    step.type === FlowActionType.PIECE &&
    "actionName" in step.settings &&
    step.settings.pieceName === HTTP_PIECE
  ) {
    const input = asJsonObject(step.settings.input);
    const originalConfiguration = asJsonObject(original?.configuration);
    const configuration: JsonObject = {
      ...originalConfiguration,
      method: input.method ?? originalConfiguration.method ?? "GET",
      url: input.url ?? originalConfiguration.url ?? "",
    };
    if (input.headers !== undefined || "headers" in originalConfiguration) {
      configuration.headers = asJsonObject(input.headers ?? originalConfiguration.headers);
    }
    if (input.queryParams !== undefined || "queryParams" in originalConfiguration) {
      configuration.queryParams = asJsonObject(
        input.queryParams ?? originalConfiguration.queryParams
      );
    }
    if (input.body_type !== undefined || "bodyMode" in originalConfiguration) {
      configuration.bodyMode = input.body_type ?? originalConfiguration.bodyMode ?? "none";
    }
    if (input.body !== undefined || "body" in originalConfiguration) {
      configuration.body = input.body ?? originalConfiguration.body ?? null;
    }
    return {
      ...base,
      kind: "action",
      operation: "action.http",
      configuration,
    };
  }

  if (step.type === FlowActionType.ROUTER) {
    const firstBranch = step.settings.branches[0];
    const condition =
      firstBranch?.branchType === BranchExecutionType.CONDITION
        ? (firstBranch.conditions?.[0]?.[0] as ConditionValue | undefined)
        : undefined;
    const rawPath = condition?.firstValue;
    const path = typeof rawPath === "string" ? rawPath.replace(/^{{|}}$/g, "") : "";
    const originalValue = original?.configuration.value;
    const rawSecondValue = condition?.secondValue;
    const value =
      typeof originalValue === "number" && rawSecondValue !== undefined
        ? Number(rawSecondValue)
        : ((rawSecondValue as JsonValue | undefined) ?? null);
    return {
      ...base,
      kind: "control",
      operation: "control.condition",
      configuration: {
        ...(original?.configuration ?? {}),
        path,
        operator: "equals",
        value,
      },
    };
  }

  throw new FlowcordiaActivepiecesBridgeError(
    "unsupported_activepieces_step",
    `Activepieces step ${step.name} is not mapped to Flowcordia yet.`
  );
}

function edgeFor(
  original: WorkflowDefinition,
  source: string,
  target: string,
  handle?: "true" | "false"
): WorkflowEdge {
  const existing = original.edges.find(
    (edge) => edge.source === source && edge.target === target && edgeHandle(edge) === handle
  );
  if (existing) return clone(existing);
  return {
    id: `${source}_to_${target}${handle ? `_${handle}` : ""}`,
    source,
    target,
    ...(handle ? { sourceHandle: handle, condition: handle } : {}),
  };
}

function countSteps(trigger: FlowTrigger): number {
  let count = 0;
  const visit = (step: Step | null | undefined) => {
    if (!step) return;
    count += 1;
    if (step.type === FlowActionType.ROUTER) step.children.forEach(visit);
    if (step.type === FlowActionType.LOOP_ON_ITEMS) visit(step.firstLoopAction);
    visit(step.nextAction);
  };
  visit(trigger);
  return count;
}

export function activepiecesFlowToFlowcordia(flow: PopulatedFlow): WorkflowDefinition {
  const original = decodeSidecar(flow);
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const seen = new Set<string>();

  const visit = (
    step: Step | null | undefined,
    parentId?: string,
    handle?: "true" | "false",
    depth = 0,
    branch = 0
  ) => {
    if (!step) {
      if (parentId && handle) {
        const originalEdge = original.edges.find(
          (edge) => edge.source === parentId && edgeHandle(edge) === handle
        );
        const output = originalEdge ? originalNode(original, originalEdge.target) : undefined;
        if (output?.kind === "output") {
          if (!seen.has(output.id)) {
            seen.add(output.id);
            nodes.push(clone(output));
          }
          edges.push(edgeFor(original, parentId, output.id, handle));
        }
      }
      return;
    }

    if (seen.has(step.name)) {
      throw new FlowcordiaActivepiecesBridgeError(
        "invalid_graph",
        `Activepieces step ${step.name} appears more than once.`
      );
    }
    seen.add(step.name);
    nodes.push(fromStep(step, originalNode(original, step.name), depth, branch));
    if (parentId) edges.push(edgeFor(original, parentId, step.name, handle));

    if (step.type === FlowActionType.ROUTER) {
      if (step.nextAction) {
        throw new FlowcordiaActivepiecesBridgeError(
          "invalid_graph",
          `Router ${step.name} has a post-router action that Flowcordia cannot preserve losslessly yet.`
        );
      }
      visit(step.children[0], step.name, "true", depth + 1, branch - 1);
      visit(step.children[1], step.name, "false", depth + 1, branch + 1);
      return;
    }

    visit(step.nextAction, step.name, undefined, depth + 1, branch);
  };

  visit(flow.version.trigger);
  if (countSteps(flow.version.trigger) !== nodes.filter((node) => node.kind !== "output").length) {
    throw new FlowcordiaActivepiecesBridgeError(
      "invalid_graph",
      "Not every Activepieces step was converted into the Flowcordia workflow."
    );
  }

  return {
    ...clone(original),
    name: flow.version.displayName,
    nodes,
    edges,
  };
}
