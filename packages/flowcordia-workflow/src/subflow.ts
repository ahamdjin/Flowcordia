import type { JsonObject } from "./types.js";

export const FLOWCORDIA_SUBFLOW_MODES = ["single", "batch"] as const;
export const FLOWCORDIA_SUBFLOW_MAX_BATCH_ITEMS = 100;
export const FLOWCORDIA_SUBFLOW_MAX_WORKFLOW_ID_LENGTH = 128;
export const FLOWCORDIA_SUBFLOW_MAX_ITEMS_PATH_LENGTH = 512;
export const FLOWCORDIA_SUBFLOW_MAX_ITEMS_PATH_SEGMENTS = 16;

export type FlowcordiaSubflowMode = (typeof FLOWCORDIA_SUBFLOW_MODES)[number];

export type FlowcordiaSubflowConfiguration =
  | {
      workflowId: string;
      mode: "single";
    }
  | {
      workflowId: string;
      mode: "batch";
      itemsPath: string;
      maxItems: number;
    };

export type FlowcordiaSubflowConfigurationResult =
  | { success: true; configuration: FlowcordiaSubflowConfiguration }
  | { success: false; issues: readonly { path: readonly string[]; message: string }[] };

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const ITEMS_PATH_SEGMENT = /^(?:[A-Za-z_][A-Za-z0-9_-]{0,63}|0|[1-9][0-9]{0,8})$/;
const UNSAFE_ITEMS_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function issue(path: readonly string[], message: string): FlowcordiaSubflowConfigurationResult {
  return { success: false, issues: [{ path, message }] };
}

function unknownKeys(configuration: JsonObject, allowed: readonly string[]): string[] {
  const known = new Set(allowed);
  return Object.keys(configuration).filter((key) => !known.has(key));
}

export function flowcordiaSubflowTaskId(workflowId: string): string {
  return `flowcordia-${workflowId}`;
}

export function parseFlowcordiaSubflowConfiguration(
  value: unknown
): FlowcordiaSubflowConfigurationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return issue([], "Subflow configuration must be a JSON object.");
  }
  const configuration = value as JsonObject;
  const workflowId =
    typeof configuration.workflowId === "string" ? configuration.workflowId.trim() : "";
  if (
    workflowId.length < 2 ||
    workflowId.length > FLOWCORDIA_SUBFLOW_MAX_WORKFLOW_ID_LENGTH ||
    !WORKFLOW_ID.test(workflowId)
  ) {
    return issue(
      ["workflowId"],
      "Subflow workflowId must match an indexed Flowcordia workflow ID."
    );
  }
  if (!FLOWCORDIA_SUBFLOW_MODES.includes(configuration.mode as FlowcordiaSubflowMode)) {
    return issue(["mode"], "Subflow mode must be single or batch.");
  }

  if (configuration.mode === "single") {
    const unknown = unknownKeys(configuration, ["workflowId", "mode"]);
    if (unknown.length > 0) {
      return issue([unknown[0]!], `Unknown single-subflow configuration field: ${unknown[0]}.`);
    }
    return { success: true, configuration: { workflowId, mode: "single" } };
  }

  const unknown = unknownKeys(configuration, ["workflowId", "mode", "itemsPath", "maxItems"]);
  if (unknown.length > 0) {
    return issue([unknown[0]!], `Unknown batch-subflow configuration field: ${unknown[0]}.`);
  }
  const itemsPath =
    typeof configuration.itemsPath === "string" ? configuration.itemsPath.trim() : "";
  const itemsPathSegments = itemsPath === "" ? [] : itemsPath.split(".");
  if (
    itemsPath.length > FLOWCORDIA_SUBFLOW_MAX_ITEMS_PATH_LENGTH ||
    itemsPathSegments.length > FLOWCORDIA_SUBFLOW_MAX_ITEMS_PATH_SEGMENTS ||
    itemsPathSegments.some((segment) => !ITEMS_PATH_SEGMENT.test(segment))
  ) {
    return issue(
      ["itemsPath"],
      `Subflow itemsPath must contain at most ${FLOWCORDIA_SUBFLOW_MAX_ITEMS_PATH_SEGMENTS} safe dot-separated segments.`
    );
  }
  if (itemsPathSegments.some((segment) => UNSAFE_ITEMS_PATH_SEGMENTS.has(segment))) {
    return issue(["itemsPath"], "Subflow itemsPath contains a reserved object segment.");
  }
  const maxItems = Number(configuration.maxItems);
  if (
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > FLOWCORDIA_SUBFLOW_MAX_BATCH_ITEMS
  ) {
    return issue(["maxItems"], "Subflow maxItems must be an integer from 1 to 100.");
  }
  return {
    success: true,
    configuration: { workflowId, mode: "batch", itemsPath, maxItems },
  };
}
