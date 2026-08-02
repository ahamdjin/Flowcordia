import {
  FlowActionType,
  FlowTriggerType,
  type FlowAction,
  type FlowTrigger,
  type PopulatedFlow,
  type Step,
} from "@activepieces/shared";
import type { JsonObject, WorkflowDefinition, WorkflowNode } from "@flowcordia/workflow";

import {
  FLOWCORDIA_BACKUP_FILE,
  activepiecesFlowToFlowcordia as legacyActivepiecesFlowToFlowcordia,
  flowcordiaWorkflowToActivepieces as legacyFlowcordiaWorkflowToActivepieces,
} from "./flowcordia-activepieces-bridge";

const MANUAL_TRIGGER_PIECE = "@activepieces/piece-manual-trigger";
const MANUAL_TRIGGER_VERSION = "0.0.5";
const HTTP_PIECE = "@activepieces/piece-http";
const HTTP_PIECE_VERSION = "0.11.13";

export const ACTIVEPIECES_GENERIC_ACTION_OPERATION = "activepieces.piece.action";
export const ACTIVEPIECES_GENERIC_TRIGGER_OPERATION = "activepieces.piece.trigger";

interface GenericPieceConfiguration extends JsonObject {
  stepType: "action" | "trigger";
  settings: JsonObject;
}

type GenericPieceStep = {
  stepType: "action" | "trigger";
  settings: JsonObject;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (clone(value) as JsonObject)
    : {};
}

function genericConfiguration(stepType: "action" | "trigger", settings: unknown): JsonObject {
  return {
    activepieces: {
      stepType,
      settings: asJsonObject(settings),
    },
  };
}

function readGenericConfiguration(node: WorkflowNode): GenericPieceConfiguration | null {
  const value = node.configuration.activepieces;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as JsonObject;
  if (record.stepType !== "action" && record.stepType !== "trigger") return null;
  if (!record.settings || typeof record.settings !== "object" || Array.isArray(record.settings)) {
    return null;
  }
  return record as unknown as GenericPieceConfiguration;
}

function isGenericActionNode(node: WorkflowNode): boolean {
  return node.operation === ACTIVEPIECES_GENERIC_ACTION_OPERATION;
}

function isGenericTriggerNode(node: WorkflowNode): boolean {
  return node.operation === ACTIVEPIECES_GENERIC_TRIGGER_OPERATION;
}

function placeholderWorkflow(workflow: WorkflowDefinition) {
  const generic = new Map<string, GenericPieceStep>();
  const placeholder = clone(workflow);

  placeholder.nodes = placeholder.nodes.map((node) => {
    const configuration = readGenericConfiguration(node);
    if (isGenericActionNode(node)) {
      if (!configuration || configuration.stepType !== "action") {
        throw new Error(
          `Generic Activepieces action ${node.id} is missing its preserved settings.`
        );
      }
      generic.set(node.id, { stepType: "action", settings: clone(configuration.settings) });
      return {
        ...node,
        kind: "action" as const,
        operation: "action.http",
        configuration: { method: "GET", url: "https://example.com" },
      };
    }
    if (isGenericTriggerNode(node)) {
      if (!configuration || configuration.stepType !== "trigger") {
        throw new Error(
          `Generic Activepieces trigger ${node.id} is missing its preserved settings.`
        );
      }
      generic.set(node.id, { stepType: "trigger", settings: clone(configuration.settings) });
      return {
        ...node,
        kind: "trigger" as const,
        operation: "trigger.manual",
        configuration: {},
      };
    }
    return node;
  });

  return { placeholder, generic };
}

function walkSteps(step: Step | null | undefined, visit: (step: Step) => void): void {
  if (!step) return;
  visit(step);
  if (step.type === FlowActionType.ROUTER) {
    step.children.forEach((child) => walkSteps(child, visit));
  }
  if (step.type === FlowActionType.LOOP_ON_ITEMS) {
    walkSteps(step.firstLoopAction, visit);
  }
  walkSteps(step.nextAction, visit);
}

function restoreGenericSteps(flow: PopulatedFlow, generic: Map<string, GenericPieceStep>): void {
  walkSteps(flow.version.trigger, (step) => {
    const preserved = generic.get(step.name);
    if (!preserved) return;
    if (preserved.stepType === "trigger") {
      Object.assign(step, {
        type: FlowTriggerType.PIECE,
        settings: clone(preserved.settings),
      });
      return;
    }
    Object.assign(step, {
      type: FlowActionType.PIECE,
      settings: clone(preserved.settings),
    });
  });
}

function sanitizeGenericPieces(flow: PopulatedFlow) {
  const sanitized = clone(flow);
  const generic = new Map<string, GenericPieceStep>();

  walkSteps(sanitized.version.trigger, (step) => {
    if (step.type === FlowTriggerType.PIECE && "triggerName" in step.settings) {
      if (step.settings.pieceName === MANUAL_TRIGGER_PIECE) return;
      generic.set(step.name, {
        stepType: "trigger",
        settings: asJsonObject(step.settings),
      });
      Object.assign(step, {
        settings: {
          pieceName: MANUAL_TRIGGER_PIECE,
          pieceVersion: MANUAL_TRIGGER_VERSION,
          triggerName: "manual_trigger",
          input: {},
          propertySettings: {},
        },
      });
      return;
    }

    if (step.type === FlowActionType.PIECE && "actionName" in step.settings) {
      if (step.settings.pieceName === HTTP_PIECE) return;
      generic.set(step.name, {
        stepType: "action",
        settings: asJsonObject(step.settings),
      });
      Object.assign(step, {
        settings: {
          pieceName: HTTP_PIECE,
          pieceVersion: HTTP_PIECE_VERSION,
          actionName: "send_request",
          input: { method: "GET", url: "https://example.com", authType: "NONE" },
          propertySettings: {},
        },
      });
    }
  });

  return { sanitized, generic };
}

export function flowcordiaWorkflowToActivepieces(input: {
  workflow: WorkflowDefinition;
  projectId: string;
  now?: string;
}): PopulatedFlow {
  const { placeholder, generic } = placeholderWorkflow(input.workflow);
  const flow = legacyFlowcordiaWorkflowToActivepieces({
    ...input,
    workflow: placeholder,
  });
  restoreGenericSteps(flow, generic);
  flow.version.backupFiles = {
    ...(flow.version.backupFiles ?? {}),
    [FLOWCORDIA_BACKUP_FILE]: JSON.stringify({ version: 1, workflow: clone(input.workflow) }),
  };
  return flow;
}

export function activepiecesFlowToFlowcordia(flow: PopulatedFlow): WorkflowDefinition {
  const { sanitized, generic } = sanitizeGenericPieces(flow);
  const workflow = legacyActivepiecesFlowToFlowcordia(sanitized);
  const connectionIds = [...flow.version.connectionIds];

  workflow.nodes = workflow.nodes.map((node) => {
    const preserved = generic.get(node.id);
    if (!preserved) return node;
    return {
      ...node,
      kind: preserved.stepType === "trigger" ? "trigger" : "action",
      operation:
        preserved.stepType === "trigger"
          ? ACTIVEPIECES_GENERIC_TRIGGER_OPERATION
          : ACTIVEPIECES_GENERIC_ACTION_OPERATION,
      configuration: genericConfiguration(preserved.stepType, preserved.settings),
      credentialReferences: connectionIds,
    };
  });

  return workflow;
}

export { FLOWCORDIA_BACKUP_FILE };
