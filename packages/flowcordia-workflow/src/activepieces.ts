import type { JsonObject, WorkflowDefinition, WorkflowNode } from "./types.js";

export const FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION = "activepieces.piece.action";
export const FLOWCORDIA_ACTIVEPIECES_TRIGGER_OPERATION = "activepieces.piece.trigger";

export interface FlowcordiaActivepiecesPieceSettings extends JsonObject {
  pieceName: string;
  pieceVersion: string;
  input: JsonObject;
  propertySettings: JsonObject;
  actionName?: string;
  triggerName?: string;
}

export interface FlowcordiaActivepiecesPieceConfiguration {
  stepType: "action" | "trigger";
  settings: FlowcordiaActivepiecesPieceSettings;
}

export interface FlowcordiaActivepiecesPieceDependency {
  packageName: string;
  version: string;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

export function isFlowcordiaActivepiecesPieceNode(node: WorkflowNode): boolean {
  return (
    node.operation === FLOWCORDIA_ACTIVEPIECES_ACTION_OPERATION ||
    node.operation === FLOWCORDIA_ACTIVEPIECES_TRIGGER_OPERATION
  );
}

export function parseFlowcordiaActivepiecesPieceConfiguration(
  node: WorkflowNode
):
  | { success: true; configuration: FlowcordiaActivepiecesPieceConfiguration }
  | { success: false; message: string } {
  if (!isFlowcordiaActivepiecesPieceNode(node)) {
    return { success: false, message: "Node is not an Activepieces piece node." };
  }
  const activepieces = node.configuration.activepieces;
  if (!isObject(activepieces)) {
    return { success: false, message: "Activepieces piece nodes require preserved settings." };
  }
  const expectedStepType =
    node.operation === FLOWCORDIA_ACTIVEPIECES_TRIGGER_OPERATION ? "trigger" : "action";
  if (activepieces.stepType !== expectedStepType) {
    return {
      success: false,
      message: `Activepieces piece node stepType must be ${expectedStepType}.`,
    };
  }
  if (!isObject(activepieces.settings)) {
    return { success: false, message: "Activepieces piece settings must be an object." };
  }
  const settings = activepieces.settings;
  const pieceName = boundedString(settings.pieceName, 256);
  const pieceVersion = boundedString(settings.pieceVersion, 128);
  if (!pieceName || !pieceName.startsWith("@activepieces/piece-")) {
    return {
      success: false,
      message: "Activepieces piece nodes require an official @activepieces/piece-* package name.",
    };
  }
  if (!pieceVersion || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pieceVersion)) {
    return {
      success: false,
      message: "Activepieces piece nodes require an exact semantic piece version.",
    };
  }
  if (!isObject(settings.input) || !isObject(settings.propertySettings)) {
    return {
      success: false,
      message: "Activepieces piece input and property settings must be objects.",
    };
  }
  const actionName = boundedString(settings.actionName, 256) ?? undefined;
  const triggerName = boundedString(settings.triggerName, 256) ?? undefined;
  if (expectedStepType === "action" && !actionName) {
    return { success: false, message: "Activepieces action nodes require actionName." };
  }
  if (expectedStepType === "trigger" && !triggerName) {
    return { success: false, message: "Activepieces trigger nodes require triggerName." };
  }
  return {
    success: true,
    configuration: {
      stepType: expectedStepType,
      settings: {
        ...settings,
        pieceName,
        pieceVersion,
        input: settings.input,
        propertySettings: settings.propertySettings,
        ...(actionName ? { actionName } : {}),
        ...(triggerName ? { triggerName } : {}),
      } as FlowcordiaActivepiecesPieceSettings,
    },
  };
}

export function collectFlowcordiaActivepiecesPieceDependencies(
  workflow: WorkflowDefinition
): FlowcordiaActivepiecesPieceDependency[] {
  const versions = new Map<string, string>();
  for (const node of workflow.nodes) {
    if (!isFlowcordiaActivepiecesPieceNode(node)) continue;
    const parsed = parseFlowcordiaActivepiecesPieceConfiguration(node);
    if (!parsed.success) continue;
    const { pieceName, pieceVersion } = parsed.configuration.settings;
    const existing = versions.get(pieceName);
    if (existing && existing !== pieceVersion) {
      throw new Error(
        `Workflow uses conflicting versions of Activepieces package ${pieceName}: ${existing} and ${pieceVersion}.`
      );
    }
    versions.set(pieceName, pieceVersion);
  }
  return Array.from(versions, ([packageName, version]) => ({ packageName, version })).sort((a, b) =>
    a.packageName.localeCompare(b.packageName)
  );
}
