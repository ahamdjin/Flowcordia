import {
  flowOperations,
  type FlowOperationRequest,
  type PopulatedFlow,
} from "@activepieces/shared";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ReactFlowProvider } from "@xyflow/react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";

import { BuilderPage } from "@/app/builder";
import {
  BuilderStateContext,
  createBuilderStore,
  type BuilderStore,
} from "@/app/builder/builder-hooks";
import { queryClient } from "@/app/query-client";
import { ApErrorDialog } from "@/components/custom/ap-error-dialog/ap-error-dialog";
import { EmbeddingProvider } from "@/components/providers/embed-provider";
import { SocketProvider, useSocket } from "@/components/providers/socket-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  configureActivepiecesApiBackend,
  consumeActivepiecesStepRunResponse,
} from "./activepieces-api";
import { configureActivepiecesAuthenticationSession } from "./activepieces-authentication-session";
import {
  FLOWCORDIA_BACKUP_FILE,
  activepiecesFlowToFlowcordia,
  flowcordiaWorkflowToActivepieces,
} from "./flowcordia-activepieces-piece-bridge";

const MESSAGE_SOURCE = "flowcordia-studio-v2";
const HOST_SOURCE = "flowcordia-activepieces-studio";

export interface FlowcordiaStudioBootstrap {
  type: "bootstrap";
  source: typeof MESSAGE_SOURCE;
  projectId: string;
  expectedVersion: string;
  readonly: boolean;
  actionUrl: string;
  workflow: WorkflowDefinition;
}

type SaveResponse =
  | {
      ok: true;
      intent: "save";
      workspace: {
        document: WorkflowDefinition;
        version: string;
        testedVersion: string | null;
        lastTestSucceeded: boolean | null;
      };
    }
  | { ok: false; code: string; message: string };

interface FlowcordiaBuilderIntegration {
  store: BuilderStore;
}

function postToParent(message: Record<string, unknown>) {
  window.parent.postMessage({ source: HOST_SOURCE, ...message }, window.location.origin);
}

function isBootstrap(value: unknown): value is FlowcordiaStudioBootstrap {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<FlowcordiaStudioBootstrap>;
  return (
    input.type === "bootstrap" &&
    input.source === MESSAGE_SOURCE &&
    typeof input.projectId === "string" &&
    typeof input.expectedVersion === "string" &&
    typeof input.actionUrl === "string" &&
    typeof input.readonly === "boolean" &&
    !!input.workflow
  );
}

function sameBootstrap(
  current: FlowcordiaStudioBootstrap | null,
  incoming: FlowcordiaStudioBootstrap
): boolean {
  return (
    current?.projectId === incoming.projectId &&
    current.expectedVersion === incoming.expectedVersion &&
    current.readonly === incoming.readonly &&
    current.actionUrl === incoming.actionUrl
  );
}

function createFlowcordiaBuilderStore(
  bootstrap: FlowcordiaStudioBootstrap,
  activepiecesQueryClient: QueryClient,
  socket: ReturnType<typeof useSocket>
): FlowcordiaBuilderIntegration {
  const flow = flowcordiaWorkflowToActivepieces({
    workflow: bootstrap.workflow,
    projectId: bootstrap.projectId,
  });
  const store = createBuilderStore({
    flow,
    flowVersion: flow.version,
    readonly: bootstrap.readonly,
    hideTestWidget: false,
    run: null,
    outputSampleData: {},
    inputSampleData: {},
    socket,
    queryClient: activepiecesQueryClient,
  });
  const activepiecesAddActionTestListener = store.getState().addActionTestListener;

  let expectedVersion = bootstrap.expectedVersion;
  let pending = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let successCallbacks: Array<() => void> = [];

  const saveLatest = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    postToParent({ type: "saving", saving: true });
    try {
      do {
        pending = false;
        const state = store.getState();
        const document = activepiecesFlowToFlowcordia({
          ...(state.flow as PopulatedFlow),
          version: state.flowVersion,
        });
        const response = await fetch(bootstrap.actionUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intent: "save",
            expectedVersion,
            document,
          }),
        });
        const result = (await response.json()) as SaveResponse;
        if (!response.ok || !result.ok) {
          const saveError = new Error(
            result.ok ? "Flowcordia rejected the workspace save." : result.message
          );
          if (!result.ok) Object.assign(saveError, { code: result.code });
          throw saveError;
        }

        expectedVersion = result.workspace.version;
        const current = store.getState().flowVersion;
        store.setState({
          flowVersion: {
            ...current,
            backupFiles: {
              ...(current.backupFiles ?? {}),
              [FLOWCORDIA_BACKUP_FILE]: JSON.stringify({
                version: 1,
                workflow: result.workspace.document,
              }),
            },
          },
        });
        const callbacks = successCallbacks;
        successCallbacks = [];
        callbacks.forEach((callback) => callback());
        postToParent({
          type: "saved",
          version: result.workspace.version,
          workspace: result.workspace,
        });
      } while (pending);
      store.setState({ saving: false });
    } catch (error) {
      store.setState({ saving: false });
      successCallbacks = [];
      postToParent({
        type: "error",
        code:
          error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
        message:
          error instanceof Error ? error.message : "Flowcordia could not save this workflow.",
      });
    } finally {
      running = false;
      if (!pending) postToParent({ type: "saving", saving: false });
      if (pending) void saveLatest();
    }
  };

  const scheduleSave = (onSuccess?: () => void) => {
    if (onSuccess) successCallbacks.push(onSuccess);
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveLatest(), 450);
  };

  store.setState({
    applyOperation: (operation: FlowOperationRequest, onSuccess?: () => void) => {
      const state = store.getState();
      if (state.readonly) return;
      const nextVersion = flowOperations.apply(state.flowVersion, operation);
      state.operationListeners.forEach((listener) => listener(state.flowVersion, operation));
      store.setState({ flowVersion: nextVersion, saving: true });
      postToParent({ type: "saving", saving: true });
      scheduleSave(onSuccess);
    },
    addActionTestListener: ({ runId, stepName }) => {
      activepiecesAddActionTestListener({ runId, stepName });
      const listener = store.getState().stepTestListeners[stepName];
      const response = consumeActivepiecesStepRunResponse(runId);
      if (!listener) return;
      if (!response) {
        listener.error(
          new Error("The Trigger.dev test completed without an Activepieces StepRunResponse.")
        );
        return;
      }
      listener.onFinish(response);
    },
  });

  return { store };
}

function ActivepiecesBuilder({ bootstrap }: { bootstrap: FlowcordiaStudioBootstrap }) {
  const socket = useSocket();
  const integration = useMemo(
    () => createFlowcordiaBuilderStore(bootstrap, queryClient, socket),
    [bootstrap, socket]
  );

  return (
    <ReactFlowProvider>
      <BuilderStateContext.Provider value={integration.store}>
        <BuilderPage />
      </BuilderStateContext.Provider>
    </ReactFlowProvider>
  );
}

function Studio({ bootstrap }: { bootstrap: FlowcordiaStudioBootstrap }) {
  configureActivepiecesAuthenticationSession(bootstrap.projectId);
  configureActivepiecesApiBackend(bootstrap.actionUrl);

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EmbeddingProvider>
          <SocketProvider>
            <TooltipProvider>
              <ThemeProvider storageKey="vite-ui-theme">
                <Suspense fallback={null}>
                  <ActivepiecesBuilder bootstrap={bootstrap} />
                </Suspense>
                <Toaster position="bottom-right" />
                <ApErrorDialog />
              </ThemeProvider>
            </TooltipProvider>
          </SocketProvider>
        </EmbeddingProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export function FlowcordiaActivepiecesStudioHost() {
  const [bootstrap, setBootstrap] = useState<FlowcordiaStudioBootstrap | null>(null);

  useEffect(() => {
    let readyTimer: ReturnType<typeof setInterval> | undefined;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isBootstrap(event.data)) return;
      if (readyTimer) clearInterval(readyTimer);
      setBootstrap((current) => (sameBootstrap(current, event.data) ? current : event.data));
    };
    window.addEventListener("message", receive);
    postToParent({ type: "ready" });
    readyTimer = setInterval(() => postToParent({ type: "ready" }), 250);
    return () => {
      if (readyTimer) clearInterval(readyTimer);
      window.removeEventListener("message", receive);
    };
  }, []);

  return bootstrap ? <Studio bootstrap={bootstrap} /> : null;
}
