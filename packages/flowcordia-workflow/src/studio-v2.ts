import { workflowStudioNodeCatalogEntry, type WorkflowStudioTemplateId } from "./catalog.js";
import { createStudioV2SourceNode } from "./studio-v2-source.js";
import type {
  JsonObject,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowPosition,
} from "./types.js";

export const STUDIO_V2_FOUNDATION_NODE_IDS = [
  "manual_trigger",
  "webhook_trigger",
  "schedule_trigger",
  "http_action",
  "source",
  "condition",
  "loop",
  "delay",
  "data_map",
  "math",
  "text",
  "date",
  "store",
  "subflow",
] as const;

export type StudioV2FoundationNodeId = (typeof STUDIO_V2_FOUNDATION_NODE_IDS)[number];
export type StudioV2FoundationAvailability = "native" | "adapter_required";
export type StudioV2FoundationCategory =
  | "trigger"
  | "action"
  | "logic"
  | "data"
  | "utility"
  | "source";

export interface StudioV2FoundationNode {
  id: StudioV2FoundationNodeId;
  label: string;
  description: string;
  category: StudioV2FoundationCategory;
  kind: WorkflowNodeKind;
  operation: string;
  availability: StudioV2FoundationAvailability;
  availableInStudio: boolean;
  importedSource: string;
  templateId?: WorkflowStudioTemplateId;
  defaultConfiguration: JsonObject;
  supportsCredentials: boolean;
  supportsVariables: boolean;
  supportsTesting: boolean;
}

export const STUDIO_V2_FOUNDATION_NODES: readonly StudioV2FoundationNode[] = [
  {
    id: "manual_trigger",
    label: "Manual trigger",
    description: "Start a workflow manually while designing or testing it.",
    category: "trigger",
    kind: "trigger",
    operation: "trigger.manual",
    availability: "native",
    availableInStudio: true,
    importedSource: "packages/pieces/core/manual-trigger",
    templateId: "manual_trigger",
    defaultConfiguration: {},
    supportsCredentials: false,
    supportsVariables: false,
    supportsTesting: true,
  },
  {
    id: "webhook_trigger",
    label: "Webhook trigger",
    description: "Receive signed webhook requests through Flowcordia trigger bindings.",
    category: "trigger",
    kind: "trigger",
    operation: "trigger.webhook",
    availability: "native",
    availableInStudio: true,
    importedSource: "packages/pieces/core/webhook",
    templateId: "webhook_trigger",
    defaultConfiguration: { method: "POST", path: "/" },
    supportsCredentials: true,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "schedule_trigger",
    label: "Schedule trigger",
    description: "Start a workflow from a reviewed cron schedule.",
    category: "trigger",
    kind: "trigger",
    operation: "trigger.schedule",
    availability: "native",
    availableInStudio: true,
    importedSource: "packages/pieces/core/schedule",
    templateId: "schedule_trigger",
    defaultConfiguration: { cron: "0 9 * * 1-5", timezone: "UTC" },
    supportsCredentials: false,
    supportsVariables: false,
    supportsTesting: true,
  },
  {
    id: "http_action",
    label: "HTTP request",
    description: "Call an allowlisted HTTPS endpoint with bounded credentials and output.",
    category: "action",
    kind: "action",
    operation: "action.http",
    availability: "native",
    availableInStudio: true,
    importedSource: "packages/pieces/core/http",
    templateId: "http_action",
    defaultConfiguration: {
      method: "GET",
      url: "",
      bodyMode: "none",
      responseMode: "auto",
      timeoutSeconds: 30,
      maxResponseBytes: 1_048_576,
    },
    supportsCredentials: true,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "source",
    label: "Source",
    description:
      "Run TypeScript with typed workflow input, step outputs, variables, and opaque credentials.",
    category: "source",
    kind: "code",
    operation: "code.typescript",
    availability: "adapter_required",
    availableInStudio: false,
    importedSource: "packages/core/execution and Windmill TypeScript editor reference",
    defaultConfiguration: {},
    supportsCredentials: true,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "condition",
    label: "Condition",
    description: "Route data through explicit true and false branches.",
    category: "logic",
    kind: "control",
    operation: "control.condition",
    availability: "native",
    availableInStudio: true,
    importedSource: "packages/core/execution flow actions and router executor",
    templateId: "condition",
    defaultConfiguration: { path: "", operator: "equals", value: null },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "loop",
    label: "Loop over items",
    description: "Iterate over a bounded array while exposing the current item and index.",
    category: "logic",
    kind: "control",
    operation: "control.loop",
    availability: "adapter_required",
    availableInStudio: false,
    importedSource: "packages/core/execution flow actions and loop executor",
    defaultConfiguration: { itemsPath: "items", maxIterations: 1_000 },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "delay",
    label: "Wait",
    description: "Pause with Flowcordia's durable wait primitive.",
    category: "logic",
    kind: "control",
    operation: "control.wait",
    availability: "native",
    availableInStudio: true,
    importedSource: "packages/pieces/core/delay",
    templateId: "wait",
    defaultConfiguration: { durationSeconds: 60 },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "data_map",
    label: "Map data",
    description: "Reshape JSON using reviewed source paths and scalar values.",
    category: "data",
    kind: "control",
    operation: "data.map",
    availability: "native",
    availableInStudio: true,
    importedSource: "packages/pieces/core/data-mapper",
    templateId: "data_map",
    defaultConfiguration: { mode: "replace", entries: [] },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "math",
    label: "Math helper",
    description: "Perform deterministic arithmetic operations.",
    category: "utility",
    kind: "action",
    operation: "utility.math",
    availability: "adapter_required",
    availableInStudio: false,
    importedSource: "packages/pieces/core/math-helper",
    defaultConfiguration: { operation: "add", operands: [] },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "text",
    label: "Text helper",
    description: "Transform and inspect text values.",
    category: "utility",
    kind: "action",
    operation: "utility.text",
    availability: "adapter_required",
    availableInStudio: false,
    importedSource: "packages/pieces/core/text-helper",
    defaultConfiguration: { operation: "trim", value: "" },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "date",
    label: "Date helper",
    description: "Format and calculate dates with an explicit timezone.",
    category: "utility",
    kind: "action",
    operation: "utility.date",
    availability: "adapter_required",
    availableInStudio: false,
    importedSource: "packages/pieces/core/date-helper",
    defaultConfiguration: { operation: "format", timezone: "UTC" },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "store",
    label: "Store",
    description: "Read and write scoped workflow state through Flowcordia persistence.",
    category: "data",
    kind: "action",
    operation: "data.store",
    availability: "adapter_required",
    availableInStudio: false,
    importedSource: "packages/pieces/core/store",
    defaultConfiguration: { operation: "get", key: "" },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
  {
    id: "subflow",
    label: "Call workflow",
    description: "Invoke a version-locked Flowcordia workflow.",
    category: "action",
    kind: "subflow",
    operation: "subflow.invoke",
    availability: "native",
    availableInStudio: true,
    importedSource: "packages/pieces/core/subflows",
    templateId: "subflow",
    defaultConfiguration: { workflowId: "configure-child", mode: "single" },
    supportsCredentials: false,
    supportsVariables: true,
    supportsTesting: true,
  },
] as const;

export function studioV2FoundationNode(id: StudioV2FoundationNodeId): StudioV2FoundationNode {
  return STUDIO_V2_FOUNDATION_NODES.find((entry) => entry.id === id)!;
}

export interface CreateStudioV2FoundationNodeInput {
  foundationId: StudioV2FoundationNodeId;
  id: string;
  position: WorkflowPosition;
  name?: string;
  configuration?: JsonObject;
  credentialReferences?: readonly string[];
}

export function createStudioV2FoundationNode(
  input: CreateStudioV2FoundationNodeInput
): WorkflowNode {
  const foundation = studioV2FoundationNode(input.foundationId);
  if (foundation.id === "source") {
    return createStudioV2SourceNode({
      id: input.id,
      position: input.position,
      name: input.name,
      source:
        typeof input.configuration?.source === "string" ? input.configuration.source : undefined,
      credentialReferences: input.credentialReferences,
    });
  }

  const canonicalTemplate = foundation.templateId
    ? workflowStudioNodeCatalogEntry(foundation.templateId)
    : undefined;

  return {
    id: input.id,
    name: input.name ?? canonicalTemplate?.defaultName ?? foundation.label,
    kind: canonicalTemplate?.kind ?? foundation.kind,
    operation: canonicalTemplate?.operation ?? foundation.operation,
    position: input.position,
    configuration: {
      ...(canonicalTemplate?.defaultConfiguration ?? foundation.defaultConfiguration),
      ...(input.configuration ?? {}),
    },
    credentialReferences:
      input.credentialReferences === undefined ? undefined : [...input.credentialReferences],
    inputSchema: canonicalTemplate?.defaultInputSchema,
    outputSchema: canonicalTemplate?.defaultOutputSchema,
  };
}

function createOutputNode(id: string, name: string, position: WorkflowPosition): WorkflowNode {
  const output = workflowStudioNodeCatalogEntry("output");
  return {
    id,
    name,
    kind: output.kind,
    operation: output.operation,
    position,
    configuration: { ...output.defaultConfiguration },
    inputSchema: output.defaultInputSchema,
  };
}

export function createStudioV2VerticalSliceWorkflow(): WorkflowDefinition {
  const manual = createStudioV2FoundationNode({
    foundationId: "manual_trigger",
    id: "manual_trigger",
    position: { x: 80, y: 160 },
  });
  const source = createStudioV2FoundationNode({
    foundationId: "source",
    id: "source",
    position: { x: 360, y: 160 },
    configuration: {
      source: `export default async function run(ctx: FlowcordiaContext) {
  return { requestId: ctx.input.requestId, endpoint: ctx.variables.endpoint };
}`,
    },
  });
  const http = createStudioV2FoundationNode({
    foundationId: "http_action",
    id: "http_request",
    position: { x: 640, y: 160 },
    configuration: {
      method: "GET",
      url: "{{steps.source.endpoint}}",
    },
    credentialReferences: ["api-token"],
  });
  const condition = createStudioV2FoundationNode({
    foundationId: "condition",
    id: "condition",
    position: { x: 920, y: 160 },
    configuration: {
      path: "status",
      operator: "equals",
      value: 200,
    },
  });

  return {
    schemaVersion: "0.1",
    id: "studio_v2_vertical_slice",
    name: "Studio V2 vertical slice",
    description: "Manual trigger to TypeScript Source, HTTP request, and explicit branch outputs.",
    labels: ["studio-v2", "local-first"],
    nodes: [
      manual,
      source,
      http,
      condition,
      createOutputNode("success_output", "Success output", { x: 1_200, y: 80 }),
      createOutputNode("failure_output", "Failure output", { x: 1_200, y: 280 }),
    ],
    edges: [
      { id: "manual_to_source", source: manual.id, target: source.id },
      { id: "source_to_http", source: source.id, target: http.id },
      { id: "http_to_condition", source: http.id, target: condition.id },
      {
        id: "condition_to_success",
        source: condition.id,
        target: "success_output",
        sourceHandle: "true",
        condition: "true",
      },
      {
        id: "condition_to_failure",
        source: condition.id,
        target: "failure_output",
        sourceHandle: "false",
        condition: "false",
      },
    ],
  };
}
