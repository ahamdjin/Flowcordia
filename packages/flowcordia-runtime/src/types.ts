import type {
  FlowcordiaActivepiecesPieceConfiguration,
  FlowcordiaApprovalConfiguration,
  FlowcordiaApprovalResult,
  JsonObject,
  JsonValue,
  StudioV2SourceContext,
  StudioV2SourceDocument,
  WorkflowCodeReference,
  WorkflowDefinition,
  WorkflowNode,
} from "@flowcordia/workflow";
import type {
  FlowcordiaActivepiecesFormulaEvaluator,
  FlowcordiaActivepiecesRuntimeServices,
} from "./activepieces.js";

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

export type FlowcordiaSourceContext = Omit<StudioV2SourceContext, "credentials">;

export interface FlowcordiaRuntimeAdapters {
  mode: FlowcordiaRuntimeMode;
  activepieces(input: {
    node: WorkflowNode;
    configuration: FlowcordiaActivepiecesPieceConfiguration;
    workflowInput: JsonValue;
    outputs: Readonly<Record<string, JsonValue>>;
  }): Promise<JsonValue>;
  http(input: {
    node: WorkflowNode;
    configuration: JsonObject;
    value: JsonValue;
    signal?: AbortSignal;
  }): Promise<JsonValue>;
  code(input: {
    node: WorkflowNode;
    reference: WorkflowCodeReference;
    value: JsonValue;
  }): Promise<JsonValue>;
  source(input: {
    node: WorkflowNode;
    document: StudioV2SourceDocument;
    context: FlowcordiaSourceContext;
  }): Promise<JsonValue>;
  wait(input: { node: WorkflowNode; durationSeconds: number }): Promise<void>;
  approval(input: {
    node: WorkflowNode;
    configuration: FlowcordiaApprovalConfiguration;
    value: JsonValue;
  }): Promise<FlowcordiaApprovalResult>;
  subflow(input: {
    node: WorkflowNode;
    workflowId: string;
    payloads: JsonValue[];
  }): Promise<JsonValue[]>;
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
  validationTaskId: string | null;
  exportName: string;
  source: string;
  orderedNodeIds: string[];
  triggerOperations: string[];
  triggerBinding: {
    kind: "authenticated_api";
    method: "POST";
    path: string;
    authentication: "project_access_token";
    request: {
      payloadField: "payload";
      optionsField: "options";
      idempotency: {
        keyPath: "options.idempotencyKey";
        required: boolean;
        ttlPath: "options.idempotencyKeyTTL";
        ttl: string;
        scope: "task_environment";
      };
      queueTTL: {
        path: "options.ttl";
        value: string;
        semantics: "expire_before_start";
      };
    };
  } | null;
  warnings: string[];
}

export type FlowcordiaCompilationResult =
  | { success: true; artifact: FlowcordiaCompilationArtifact }
  | { success: false; issues: FlowcordiaCompileIssue[] };

export type FlowcordiaCodeHandler = (value: JsonValue) => Promise<JsonValue> | JsonValue;

export interface FlowcordiaPreviewRuntimeOptions {
  codeMocks?: Readonly<Record<string, JsonValue>>;
  sourceMocks?: Readonly<Record<string, JsonValue>>;
  activepiecesMocks?: Readonly<Record<string, JsonValue>>;
  subflowOutputs?: Readonly<Record<string, JsonValue | JsonValue[]>>;
  approvalDecision?: FlowcordiaApprovalResult;
  variables?: Readonly<Record<string, JsonValue>>;
}

export interface FlowcordiaTriggerRuntimeOptions {
  codeHandlers?: Record<string, FlowcordiaCodeHandler>;
  fetch?: typeof globalThis.fetch;
  wait(durationSeconds: number): Promise<void>;
  approval?(input: {
    node: WorkflowNode;
    configuration: FlowcordiaApprovalConfiguration;
    value: JsonValue;
  }): Promise<FlowcordiaApprovalResult>;
  authorizeHttp(url: URL): Promise<boolean> | boolean;
  resolveCredential?(reference: string): Promise<JsonObject> | JsonObject;
  resolveActivepiecesConnection?(externalId: string): Promise<unknown> | unknown;
  loadActivepiecesPiece?(packageName: string): Promise<Record<string, unknown>>;
  activepiecesFormulaEvaluator?: FlowcordiaActivepiecesFormulaEvaluator;
  activepiecesProjectId?: string;
  activepiecesProjectExternalId?: string;
  activepiecesRunId?: string;
  activepiecesServerApiUrl?: string;
  activepiecesServerPublicUrl?: string;
  activepiecesRuntimeServices?: Partial<FlowcordiaActivepiecesRuntimeServices>;
  invokeSubflow?(input: { taskId: string; payloads: JsonValue[] }): Promise<JsonValue[]>;
}

export interface FlowcordiaExecuteOptions {
  maxNodes?: number;
  signal?: AbortSignal;
  variables?: Readonly<Record<string, JsonValue>>;
  environment?: "test" | "staging" | "production";
  runId?: string;
  attempt?: number;
  onTrace?(trace: FlowcordiaNodeTrace): Promise<void> | void;
}

export interface FlowcordiaSourceExecutionInput {
  document: StudioV2SourceDocument;
  context: FlowcordiaSourceContext;
  credentials: Readonly<Record<string, JsonValue>>;
  timeoutMs?: number;
}

export interface FlowcordiaCompiledWorkflowModule {
  workflow: WorkflowDefinition;
  execute(payload: JsonValue): Promise<FlowcordiaExecutionResult>;
}