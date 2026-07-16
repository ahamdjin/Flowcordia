export const CURRENT_WORKFLOW_SCHEMA_VERSION = "0.1" as const;

export type WorkflowSchemaVersion = typeof CURRENT_WORKFLOW_SCHEMA_VERSION;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type WorkflowNodeKind =
  | "trigger"
  | "action"
  | "control"
  | "code"
  | "subflow"
  | "approval"
  | "output";

export interface WorkflowPosition {
  x: number;
  y: number;
}

export interface WorkflowRetryPolicy {
  maxAttempts?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
  factor?: number;
}

export interface WorkflowRuntimePolicy {
  queue?: string;
  concurrencyKey?: string;
  machine?: string;
  maxDurationSeconds?: number;
  retry?: WorkflowRetryPolicy;
}

export interface WorkflowCodeReference {
  repository?: string;
  path: string;
  exportName: string;
  commit?: string;
}

export interface WorkflowNode {
  id: string;
  name?: string;
  kind: WorkflowNodeKind;
  operation: string;
  position: WorkflowPosition;
  configuration: JsonObject;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
  credentialReferences?: string[];
  runtime?: WorkflowRuntimePolicy;
  codeReference?: WorkflowCodeReference;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  condition?: string;
}

export interface WorkflowMetadata {
  createdBy?: string;
  updatedAt?: string;
  sourceRepository?: string;
  sourcePath?: string;
}

export interface WorkflowDefinition {
  schemaVersion: WorkflowSchemaVersion;
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  labels?: string[];
  metadata?: WorkflowMetadata;
}

export type WorkflowEntityReference =
  | { type: "workflow"; id?: string }
  | { type: "node"; id?: string }
  | { type: "edge"; id?: string };

export type WorkflowIssueCode =
  | "invalid_json"
  | "invalid_type"
  | "required"
  | "unknown_property"
  | "invalid_value"
  | "duplicate_id"
  | "duplicate_connection"
  | "missing_reference"
  | "identity_changed"
  | "migration_missing"
  | "migration_cycle"
  | "migration_failed";

export interface WorkflowIssue {
  code: WorkflowIssueCode;
  message: string;
  path: ReadonlyArray<string | number>;
  entity: WorkflowEntityReference;
}

export type WorkflowValidationResult =
  | { success: true; workflow: WorkflowDefinition; issues: [] }
  | { success: false; issues: WorkflowIssue[] };
