export enum FlowActionType {
  CODE = "CODE",
  PIECE = "PIECE",
  LOOP_ON_ITEMS = "LOOP_ON_ITEMS",
  ROUTER = "ROUTER",
}

export enum FlowTriggerType {
  EMPTY = "EMPTY",
  PIECE = "PIECE_TRIGGER",
}

export enum RouterExecutionType {
  EXECUTE_ALL_MATCH = "EXECUTE_ALL_MATCH",
  EXECUTE_FIRST_MATCH = "EXECUTE_FIRST_MATCH",
}

export enum BranchExecutionType {
  FALLBACK = "FALLBACK",
  CONDITION = "CONDITION",
}

export enum BranchOperator {
  TEXT_EXACTLY_MATCHES = "TEXT_EXACTLY_MATCHES",
}

export enum FlowStatus {
  ENABLED = "ENABLED",
  DISABLED = "DISABLED",
}

export enum FlowOperationStatus {
  NONE = "NONE",
  DELETING = "DELETING",
}

export enum FlowVersionState {
  LOCKED = "LOCKED",
  DRAFT = "DRAFT",
}

export enum FlowOperationType {
  UPDATE_TRIGGER = "UPDATE_TRIGGER",
  ADD_ACTION = "ADD_ACTION",
  UPDATE_ACTION = "UPDATE_ACTION",
}

export enum PackageType {
  REGISTRY = "REGISTRY",
}

export enum PieceType {
  OFFICIAL = "OFFICIAL",
}

export type SourceCode = {
  packageJson: string;
  code: string;
};

export type ActionErrorHandlingOptions =
  | {
      continueOnFailure?: { value?: boolean };
      retryOnFailure?: { value?: boolean };
    }
  | undefined;

interface BaseStep {
  name: string;
  valid: boolean;
  displayName: string;
  skip?: boolean;
  lastUpdatedDate: string;
}

export type CodeActionSettings = {
  sampleData?: unknown;
  customLogoUrl?: string;
  sourceCode: SourceCode;
  input: Record<string, unknown>;
  errorHandlingOptions?: ActionErrorHandlingOptions;
};

export type PieceActionSettings = {
  sampleData?: unknown;
  customLogoUrl?: string;
  propertySettings: Record<string, unknown>;
  pieceName: string;
  pieceVersion: string;
  actionName?: string;
  input: Record<string, unknown>;
  errorHandlingOptions?: ActionErrorHandlingOptions;
};

export type LoopOnItemsActionSettings = {
  sampleData?: unknown;
  customLogoUrl?: string;
  items: string;
};

export type BranchCondition = {
  firstValue: string;
  secondValue?: string;
  caseSensitive?: boolean;
  operator?: BranchOperator;
};

export type RouterBranch =
  | {
      conditions: BranchCondition[][];
      branchType: BranchExecutionType.CONDITION;
      branchName: string;
    }
  | {
      branchType: BranchExecutionType.FALLBACK;
      branchName: string;
    };

export type RouterActionSettings = {
  sampleData?: unknown;
  customLogoUrl?: string;
  branches: RouterBranch[];
  executionType: RouterExecutionType;
};

export type ContinueOnFailureBranches = {
  onSuccess?: FlowAction;
  onFailure?: FlowAction;
};

export type CodeAction = BaseStep & {
  type: FlowActionType.CODE;
  settings: CodeActionSettings;
  nextAction?: FlowAction;
  continueOnFailureBranches?: ContinueOnFailureBranches;
};

export type PieceAction = BaseStep & {
  type: FlowActionType.PIECE;
  settings: PieceActionSettings;
  nextAction?: FlowAction;
  continueOnFailureBranches?: ContinueOnFailureBranches;
};

export type LoopOnItemsAction = BaseStep & {
  type: FlowActionType.LOOP_ON_ITEMS;
  settings: LoopOnItemsActionSettings;
  nextAction?: FlowAction;
  firstLoopAction?: FlowAction;
};

export type RouterAction = BaseStep & {
  type: FlowActionType.ROUTER;
  settings: RouterActionSettings;
  nextAction?: FlowAction;
  children: Array<FlowAction | null>;
};

export type FlowAction = CodeAction | PieceAction | LoopOnItemsAction | RouterAction;

export type PieceTriggerSettings = {
  sampleData?: unknown;
  propertySettings: Record<string, unknown>;
  customLogoUrl?: string;
  pieceName: string;
  pieceVersion: string;
  triggerName?: string;
  input: Record<string, unknown>;
};

export type PieceTrigger = BaseStep & {
  type: FlowTriggerType.PIECE;
  settings: PieceTriggerSettings;
  nextAction?: FlowAction;
};

export type EmptyTrigger = BaseStep & {
  type: FlowTriggerType.EMPTY;
  settings: unknown;
  nextAction?: FlowAction;
};

export type FlowTrigger = PieceTrigger | EmptyTrigger;
export type Step = FlowAction | FlowTrigger;

export type StepSettings =
  | CodeActionSettings
  | PieceActionSettings
  | PieceTriggerSettings
  | RouterActionSettings
  | LoopOnItemsActionSettings;

export interface FlowVersion {
  id: string;
  created: string;
  updated: string;
  flowId: string;
  displayName: string;
  trigger: FlowTrigger;
  updatedBy: string | null;
  valid: boolean;
  schemaVersion: string | null;
  agentIds: string[];
  state: FlowVersionState;
  connectionIds: string[];
  backupFiles: Record<string, string> | null;
  notes: unknown[];
}

export interface PopulatedFlow {
  id: string;
  created: string;
  updated: string;
  projectId: string;
  externalId: string;
  ownerId: string | null;
  folderId: string | null;
  status: FlowStatus;
  publishedVersionId: string | null;
  metadata: Record<string, unknown> | null;
  operationStatus: FlowOperationStatus;
  timeSavedPerRun: number | null;
  templateId: string | null;
  createdBy: unknown | null;
  version: FlowVersion;
  triggerSource?: unknown;
}

export type StepRunResponse = {
  runId: string;
  success: boolean;
  input?: unknown;
  output?: unknown;
  standardError: string;
  standardOutput: string;
};

export declare const PopulatedFlow: {
  safeParse(value: unknown): { success: boolean };
};

export type FlowOperationRequest = {
  type: FlowOperationType;
  request: unknown;
};

export declare const flowOperations: {
  apply(flowVersion: FlowVersion, operation: FlowOperationRequest): FlowVersion;
};

export declare const flowStructureUtil: {
  getStep(name: string, trigger: FlowTrigger): Step | undefined;
  isAction(type: Step["type"]): type is FlowAction["type"];
};