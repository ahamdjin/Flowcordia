import type { JsonObject, WorkflowNodeKind } from "./types.js";

export const WORKFLOW_STUDIO_CATALOG_SCHEMA_VERSION = "0.1" as const;

export const WORKFLOW_STUDIO_TEMPLATE_IDS = [
  "manual_trigger",
  "api_trigger",
  "schedule_trigger",
  "webhook_trigger",
  "http_action",
  "data_map",
  "subflow",
  "condition",
  "wait",
  "output",
] as const;

export type WorkflowStudioTemplateId = (typeof WORKFLOW_STUDIO_TEMPLATE_IDS)[number];
export type WorkflowStudioNodeCatalogCategory = "trigger" | "action" | "logic" | "output";
export type WorkflowStudioNodeCatalogReleaseStage = "approved" | "limited";
export type WorkflowStudioNodeCapability =
  | "structural_preview"
  | "live_execution"
  | "credential_references"
  | "governed_code_generation"
  | "production_binding";

export interface WorkflowStudioNodeTemplate {
  id: WorkflowStudioTemplateId;
  catalogId: string;
  catalogVersion: number;
  label: string;
  description: string;
  category: WorkflowStudioNodeCatalogCategory;
  releaseStage: WorkflowStudioNodeCatalogReleaseStage;
  capabilities: readonly WorkflowStudioNodeCapability[];
  kind: WorkflowNodeKind;
  operation: string;
  defaultName: string;
  defaultConfiguration: JsonObject;
  defaultInputSchema?: JsonObject;
  defaultOutputSchema?: JsonObject;
}

export const WORKFLOW_STUDIO_NODE_CATALOG: readonly WorkflowStudioNodeTemplate[] = [
  {
    id: "manual_trigger",
    catalogId: "flowcordia.trigger.manual",
    catalogVersion: 1,
    label: "Manual trigger",
    description: "Start a governed workflow manually from Trigger.dev.",
    category: "trigger",
    releaseStage: "approved",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "trigger",
    operation: "trigger.manual",
    defaultName: "Manual trigger",
    defaultConfiguration: {},
    defaultOutputSchema: { type: "object" },
  },
  {
    id: "api_trigger",
    catalogId: "flowcordia.trigger.authenticated-api",
    catalogVersion: 1,
    label: "API trigger",
    description: "Receive authenticated project-token requests through the native task endpoint.",
    category: "trigger",
    releaseStage: "approved",
    capabilities: [
      "structural_preview",
      "live_execution",
      "governed_code_generation",
      "production_binding",
    ],
    kind: "trigger",
    operation: "trigger.api",
    defaultName: "API trigger",
    defaultConfiguration: {},
    defaultOutputSchema: { type: "object" },
  },
  {
    id: "schedule_trigger",
    catalogId: "flowcordia.trigger.schedule",
    catalogVersion: 1,
    label: "Schedule trigger",
    description: "Run on a reviewed five-field cron schedule in production.",
    category: "trigger",
    releaseStage: "approved",
    capabilities: [
      "structural_preview",
      "live_execution",
      "governed_code_generation",
      "production_binding",
    ],
    kind: "trigger",
    operation: "trigger.schedule",
    defaultName: "Schedule",
    defaultConfiguration: { cron: "0 9 * * 1-5", timezone: "UTC" },
    defaultOutputSchema: { type: "object" },
  },
  {
    id: "webhook_trigger",
    catalogId: "flowcordia.trigger.webhook",
    catalogVersion: 1,
    label: "Webhook trigger",
    description:
      "Receive signed JSON through an immutable production endpoint with write-only HMAC credentials and replay protection.",
    category: "trigger",
    releaseStage: "approved",
    capabilities: [
      "structural_preview",
      "live_execution",
      "credential_references",
      "governed_code_generation",
      "production_binding",
    ],
    kind: "trigger",
    operation: "trigger.webhook",
    defaultName: "Webhook",
    defaultConfiguration: { method: "POST", path: "/" },
    defaultOutputSchema: { type: "object" },
  },
  {
    id: "http_action",
    catalogId: "flowcordia.action.http-request",
    catalogVersion: 1,
    label: "HTTP request",
    description: "Call an allowlisted HTTPS API with bounded input, response, and credentials.",
    category: "action",
    releaseStage: "approved",
    capabilities: [
      "structural_preview",
      "live_execution",
      "credential_references",
      "governed_code_generation",
    ],
    kind: "action",
    operation: "action.http",
    defaultName: "HTTP request",
    defaultConfiguration: {
      method: "GET",
      url: "",
      bodyMode: "none",
      responseMode: "auto",
      timeoutSeconds: 30,
      maxResponseBytes: 1_048_576,
    },
  },
  {
    id: "data_map",
    catalogId: "flowcordia.data.map",
    catalogVersion: 1,
    label: "Map data",
    description: "Reshape reviewed JSON through safe source paths and scalar literals.",
    category: "logic",
    releaseStage: "approved",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "control",
    operation: "data.map",
    defaultName: "Map data",
    defaultConfiguration: { mode: "replace", entries: [] },
  },
  {
    id: "subflow",
    catalogId: "flowcordia.subflow.invoke",
    catalogVersion: 1,
    label: "Call workflow",
    description: "Invoke one version-locked Flowcordia workflow or fan out a bounded JSON array.",
    category: "action",
    releaseStage: "limited",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "subflow",
    operation: "subflow.invoke",
    defaultName: "Call workflow",
    defaultConfiguration: { workflowId: "configure-child", mode: "single" },
    defaultInputSchema: { type: "object" },
    defaultOutputSchema: { type: "object" },
  },
  {
    id: "condition",
    catalogId: "flowcordia.logic.condition",
    catalogVersion: 1,
    label: "Condition",
    description: "Route scalar workflow data through explicit true and false branches.",
    category: "logic",
    releaseStage: "approved",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "control",
    operation: "control.condition",
    defaultName: "Condition",
    defaultConfiguration: { path: "", operator: "equals", value: null },
  },
  {
    id: "wait",
    catalogId: "flowcordia.logic.wait",
    catalogVersion: 1,
    label: "Wait",
    description: "Pause with the inherited Trigger.dev durable-wait primitive.",
    category: "logic",
    releaseStage: "approved",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "control",
    operation: "control.wait",
    defaultName: "Wait",
    defaultConfiguration: { durationSeconds: 60 },
  },
  {
    id: "output",
    catalogId: "flowcordia.output.return",
    catalogVersion: 1,
    label: "Output",
    description: "Return the selected workflow value from the generated task.",
    category: "output",
    releaseStage: "approved",
    capabilities: ["structural_preview", "live_execution", "governed_code_generation"],
    kind: "output",
    operation: "output.return",
    defaultName: "Output",
    defaultConfiguration: {},
    defaultInputSchema: { type: "object" },
  },
] as const;

export const WORKFLOW_STUDIO_NODE_TEMPLATES = WORKFLOW_STUDIO_NODE_CATALOG;

export function workflowStudioNodeCatalogEntry(
  templateId: WorkflowStudioTemplateId
): WorkflowStudioNodeTemplate {
  return WORKFLOW_STUDIO_NODE_CATALOG.find((entry) => entry.id === templateId)!;
}
