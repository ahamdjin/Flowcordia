import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType, Context, ReactNode } from "react";
import type {
  FlowAction,
  FlowOperationRequest,
  FlowVersion,
  PopulatedFlow,
  StepRunResponse,
} from "./activepieces-shared";

export interface BuilderState {
  flow: PopulatedFlow;
  flowVersion: FlowVersion;
  readonly: boolean;
  saving: boolean;
  selectedStep: string | null;
  operationListeners: Array<(flowVersion: FlowVersion, operation: FlowOperationRequest) => void>;
  applyOperation(operation: FlowOperationRequest, onSuccess?: () => void): void;
  selectStepByName(name: string): void;
  addActionTestListener(input: { runId: string; stepName: string }): void;
  stepTestListeners: Record<
    string,
    | {
        onFinish(response: StepRunResponse): void;
        error(error: unknown): void;
      }
    | null
    | undefined
  >;
  beforeStepTestPreparation(step: FlowAction): void;
  updateSampleData(input: { stepName: string; input?: unknown; output?: unknown }): void;
  setErrorLogs(stepName: string, error: string | null): void;
}

export interface BuilderStore {
  getState(): BuilderState;
  setState(partial: Partial<BuilderState> | ((state: BuilderState) => Partial<BuilderState>)): void;
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

export declare const BuilderPage: ComponentType;
export declare const queryClient: QueryClient;

export declare const ApErrorDialog: ComponentType;
export declare const EmbeddingProvider: ComponentType<{ children?: ReactNode }>;
export declare const SocketProvider: ComponentType<{ children?: ReactNode }>;
export declare function useSocket(): unknown;
export declare const ThemeProvider: ComponentType<{
  children?: ReactNode;
  defaultTheme?: "dark" | "light" | "system";
  storageKey?: string;
}>;
export declare const TooltipProvider: ComponentType<{ children?: ReactNode }>;
export declare const Toaster: ComponentType<{
  position?:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "top-center"
    | "bottom-center";
}>;