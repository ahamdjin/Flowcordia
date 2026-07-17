import type {
  JsonObject,
  JsonValue,
  WorkflowCodeReference,
  WorkflowDefinition,
  WorkflowNode,
} from "@flowcordia/workflow";

export type FlowcordiaRuntimeMode = "preview" | "live";

export type FlowcordiaFunction<
  Input extends JsonObject = JsonObject,
  Output extends JsonObject = JsonObject,
> = (input: Input) => Output | Promise<Output>;

export type FlowcordiaFunctionContract<T> = T extends (...args: infer Arguments) => infer Output
  ? Arguments extends [infer Input]
    ? Input extends JsonObject
      ? Awaited<Output> extends JsonObject
        ? T
        : never
      : never
    : never
  : never;

export interface FlowcordiaNodeTrace {
  nodeId: string;
  operation: string;
  status: "SUCCEEDED" | "SKIPPED" | "FAILED";
  output?: JsonValue;
  message?: string;
}

export interface FlowcordiaExecutionResult {
  success: boolean;
  workflowId: string;
  mode: FlowcordiaRuntimeMode;
  output: JsonValue;
  traces: FlowcordiaNodeTrace[];
  failedNodeId?: string;
}

export interface FlowcordiaRuntimeAdapters {
  mode: FlowcordiaRuntimeMode;
  http(input: {
    node: WorkflowNode;
    configuration: JsonObject;
    value: JsonValue;
  }): Promise<JsonValue>;
  code(input: {
    node: WorkflowNode;
    reference: WorkflowCodeReference;
    value: JsonValue;
  }): Promise<JsonValue>;
  wait(input: { node: WorkflowNode; durationSeconds: number }): Promise<void>;
}

export interface FlowcordiaCompileIssue {
  code:
    | "invalid_workflow"
    | "unsupported_operation"
    | "invalid_configuration"
    | "cycle_detected"
    | "unreachable_node"
    | "missing_trigger"
    | "multiple_triggers"
    | "missing_code_reference";
  message: string;
  nodeId?: string;
}

export interface FlowcordiaCompilationArtifact {
  workflowId: string;
  taskId: string;
  exportName: string;
  source: string;
  orderedNodeIds: string[];
  triggerOperations: string[];
  warnings: string[];
}

export type FlowcordiaCompilationResult =
  | { success: true; artifact: FlowcordiaCompilationArtifact }
  | { success: false; issues: FlowcordiaCompileIssue[] };

export type FlowcordiaCodeHandler = (value: JsonValue) => Promise<JsonValue> | JsonValue;

export interface FlowcordiaPreviewRuntimeOptions {
  codeMocks?: Readonly<Record<string, JsonValue>>;
}

export interface FlowcordiaTriggerRuntimeOptions {
  codeHandlers?: Record<string, FlowcordiaCodeHandler>;
  fetch?: typeof globalThis.fetch;
  wait(durationSeconds: number): Promise<void>;
  authorizeHttp(url: URL): Promise<boolean> | boolean;
  resolveCredential?(reference: string): Promise<JsonObject> | JsonObject;
}

export interface FlowcordiaExecuteOptions {
  maxNodes?: number;
  signal?: AbortSignal;
  onTrace?(trace: FlowcordiaNodeTrace): Promise<void> | void;
}

export interface FlowcordiaCompiledWorkflowModule {
  workflow: WorkflowDefinition;
  execute(payload: JsonValue): Promise<FlowcordiaExecutionResult>;
}
