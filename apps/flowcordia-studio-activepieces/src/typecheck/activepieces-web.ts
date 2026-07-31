import type {
  ComponentType,
  Context,
  Dispatch,
  MouseEventHandler,
  ReactNode,
  SetStateAction,
} from "react";
import type {
  FlowOperationRequest,
  FlowOperationType,
  FlowVersion,
  PopulatedFlow,
  SourceCode,
  StepSettings,
} from "./activepieces-shared";

export type PieceSelectorItem = Record<string, unknown>;

export type PieceSelectorOperation = {
  type: FlowOperationType;
  [key: string]: unknown;
};

export interface BuilderState {
  flow: PopulatedFlow;
  flowVersion: FlowVersion;
  readonly: boolean;
  saving: boolean;
  selectedStep: string | null;
  operationListeners: Array<
    (flowVersion: FlowVersion, operation: FlowOperationRequest) => void
  >;
  applyOperation(operation: FlowOperationRequest, onSuccess?: () => void): void;
  selectStepByName(name: string): void;
  openedPieceSelectorStepNameOrAddButtonId: string | null;
  setOpenedPieceSelectorStepNameOrAddButtonId(id: string | null): void;
  handleAddingOrUpdatingStep(input: {
    pieceSelectorItem: PieceSelectorItem;
    operation: PieceSelectorOperation;
    overrideSettings?: StepSettings;
    selectStepAfter?: boolean;
  }): void;
}

export interface BuilderStore {
  getState(): BuilderState;
  setState(
    partial:
      | Partial<BuilderState>
      | ((state: BuilderState) => Partial<BuilderState>)
  ): void;
}

export declare const BuilderStateContext: Context<BuilderStore>;

export declare function createBuilderStore(input: {
  flow: PopulatedFlow;
  flowVersion: FlowVersion;
  readonly: boolean;
  hideTestWidget: boolean;
  run: unknown;
  outputSampleData: Record<string, unknown>;
  inputSampleData: Record<string, unknown>;
  socket: unknown;
  queryClient: unknown;
}): BuilderStore;

export declare function useBuilderStateContext<T>(
  selector: (state: BuilderState) => T
): T;

export declare const FlowCanvas: ComponentType<{
  setHasCanvasBeenInitialised: Dispatch<SetStateAction<boolean>>;
}>;

export declare const CodeEditor: ComponentType<{
  sourceCode: SourceCode;
  onChange(sourceCode: SourceCode): void;
  readonly: boolean;
  minHeight: string;
}>;

export declare const CursorPositionProvider: ComponentType<{
  children?: ReactNode;
}>;

export declare const Popover: ComponentType<{
  children?: ReactNode;
  open?: boolean;
  modal?: boolean;
  onOpenChange?(open: boolean): void;
}>;

export declare const PopoverTrigger: ComponentType<{
  children?: ReactNode;
  asChild?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
}>;

export declare const PopoverContent: ComponentType<{
  children?: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
}>;
