import {
  FlowActionType,
  FlowOperationType,
  FlowTriggerType,
  flowOperations,
  flowStructureUtil,
  type FlowAction,
  type FlowOperationRequest,
  type FlowTrigger,
  type PopulatedFlow,
} from "@activepieces/shared";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactFlowProvider } from "@xyflow/react";
import { Braces, Maximize2, Minimize2, Save, ShieldCheck, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import type { Socket } from "socket.io-client";

import {
  BuilderStateContext,
  createBuilderStore,
  useBuilderStateContext,
  type BuilderStore,
} from "@/app/builder/builder-hooks";
import { FlowCanvas } from "@/app/builder/flow-canvas";
import { CodeEditor } from "@/app/builder/step-settings/code-settings/code-editor";
import { CursorPositionProvider } from "@/app/builder/state/cursor-position-context";

import {
  FLOWCORDIA_BACKUP_FILE,
  activepiecesFlowToFlowcordia,
  flowcordiaWorkflowToActivepieces,
} from "./flowcordia-activepieces-bridge";
import { WorkflowCodeView } from "./workflow-code-view";

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
  replaceWorkflow(workflow: WorkflowDefinition): void;
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

function fakeSocket(): Socket {
  const socket = {
    on: () => socket,
    off: () => socket,
    once: () => socket,
    emit: () => true,
    connect: () => socket,
    disconnect: () => socket,
    connected: false,
  };
  return socket as unknown as Socket;
}

function requestWithoutTimestamp<T extends FlowAction | FlowTrigger>(
  step: T
): Omit<T, "lastUpdatedDate"> {
  const { lastUpdatedDate: _lastUpdatedDate, ...request } = step;
  return request;
}

function createFlowcordiaBuilderStore(
  bootstrap: FlowcordiaStudioBootstrap,
  queryClient: QueryClient
): FlowcordiaBuilderIntegration {
  const flow = flowcordiaWorkflowToActivepieces({
    workflow: bootstrap.workflow,
    projectId: bootstrap.projectId,
  });
  const store = createBuilderStore({
    flow,
    flowVersion: flow.version,
    readonly: bootstrap.readonly,
    hideTestWidget: true,
    run: null,
    outputSampleData: {},
    inputSampleData: {},
    socket: fakeSocket(),
    queryClient,
  });

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
    try {
      do {
        pending = false;
        const state = store.getState();
        const snapshot = state.flowVersion;
        const document = activepiecesFlowToFlowcordia({
          ...(state.flow as PopulatedFlow),
          version: snapshot,
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
          throw new Error(result.ok ? "Flowcordia rejected the workspace save." : result.message);
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
        message:
          error instanceof Error ? error.message : "Flowcordia could not save this workflow.",
      });
    } finally {
      running = false;
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
      scheduleSave(onSuccess);
    },
  });

  const replaceWorkflow = (workflow: WorkflowDefinition) => {
    const state = store.getState();
    if (state.readonly) throw new Error("This Studio environment is read only.");
    const nextFlow = flowcordiaWorkflowToActivepieces({
      workflow,
      projectId: bootstrap.projectId,
    });
    store.setState({
      flow: nextFlow,
      flowVersion: nextFlow.version,
      selectedStep: null,
      saving: true,
    });
    scheduleSave();
  };

  return { store, replaceWorkflow };
}

function StatusPill() {
  const [saving, readonly] = useBuilderStateContext((state) => [state.saving, state.readonly]);
  return (
    <div className="flowcordia-status-pill">
      {readonly ? <ShieldCheck size={13} /> : <Save size={13} />}
      {readonly ? "Read only" : saving ? "Saving…" : "Saved"}
    </div>
  );
}

function SourceInspector({ step }: { step: Extract<FlowAction, { type: FlowActionType.CODE }> }) {
  const [applyOperation, readonly] = useBuilderStateContext((state) => [
    state.applyOperation,
    state.readonly,
  ]);
  const [expanded, setExpanded] = useState(false);

  const update = (sourceCode: typeof step.settings.sourceCode) => {
    const updated = {
      ...step,
      settings: { ...step.settings, sourceCode },
    };
    applyOperation({
      type: FlowOperationType.UPDATE_ACTION,
      request: requestWithoutTimestamp(updated),
    });
  };

  return (
    <section className={expanded ? "flowcordia-inspector expanded" : "flowcordia-inspector"}>
      <div className="flowcordia-inspector-heading">
        <div>
          <span>Source node</span>
          <strong>{step.displayName}</strong>
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          {expanded ? "Close full view" : "Open full view"}
        </button>
      </div>
      <div className="flowcordia-code-editor">
        <CodeEditor
          sourceCode={step.settings.sourceCode}
          onChange={update}
          readonly={readonly}
          minHeight={expanded ? "calc(100vh - 170px)" : "520px"}
        />
      </div>
    </section>
  );
}

function HttpInspector({ step }: { step: Extract<FlowAction, { type: FlowActionType.PIECE }> }) {
  const [applyOperation, readonly] = useBuilderStateContext((state) => [
    state.applyOperation,
    state.readonly,
  ]);
  const input = (step.settings.input ?? {}) as Record<string, unknown>;

  const updateInput = (name: string, value: unknown) => {
    const updated = {
      ...step,
      settings: {
        ...step.settings,
        input: { ...input, [name]: value },
      },
    };
    applyOperation({
      type: FlowOperationType.UPDATE_ACTION,
      request: requestWithoutTimestamp(updated),
    });
  };

  return (
    <section className="flowcordia-inspector">
      <div className="flowcordia-inspector-heading">
        <div>
          <span>HTTP node</span>
          <strong>{step.displayName}</strong>
        </div>
      </div>
      <label>
        <span>Method</span>
        <select
          disabled={readonly}
          value={String(input.method ?? "GET")}
          onChange={(event) => updateInput("method", event.target.value)}
        >
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>URL</span>
        <input
          disabled={readonly}
          value={String(input.url ?? "")}
          onChange={(event) => updateInput("url", event.target.value)}
          placeholder="https://api.example.com"
        />
      </label>
      <p className="flowcordia-help">
        This panel writes through Activepieces operations and is persisted as Flowcordia’s
        canonical HTTP node. Credential values remain outside the workflow document.
      </p>
    </section>
  );
}

function GenericInspector({ step }: { step: FlowAction | FlowTrigger }) {
  const type = step.type === FlowActionType.ROUTER ? "Condition" : "Node";
  return (
    <section className="flowcordia-inspector">
      <div className="flowcordia-inspector-heading">
        <div>
          <span>{type}</span>
          <strong>{step.displayName}</strong>
        </div>
      </div>
      <pre>{JSON.stringify(step.settings, null, 2)}</pre>
    </section>
  );
}

function SelectedNodeInspector() {
  const [selectedStepName, flowVersion] = useBuilderStateContext((state) => [
    state.selectedStep,
    state.flowVersion,
  ]);
  const step = selectedStepName
    ? flowStructureUtil.getStep(selectedStepName, flowVersion.trigger)
    : undefined;

  if (!step) {
    return (
      <aside className="flowcordia-empty-inspector">
        <strong>Select a node</strong>
        <p>Open a node to edit it while the real Activepieces canvas stays in sync.</p>
      </aside>
    );
  }
  if (step.type === FlowActionType.CODE) return <SourceInspector step={step} />;
  if (
    step.type === FlowActionType.PIECE &&
    step.settings.pieceName === "@activepieces/piece-http"
  ) {
    return <HttpInspector step={step} />;
  }
  return <GenericInspector step={step} />;
}

function Studio({ bootstrap }: { bootstrap: FlowcordiaStudioBootstrap }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
          mutations: { retry: false },
        },
      }),
    []
  );
  const integration = useMemo(
    () => createFlowcordiaBuilderStore(bootstrap, queryClient),
    [bootstrap, queryClient]
  );
  const [view, setView] = useState<"canvas" | "code">("canvas");
  const [hasCanvasBeenInitialised, setHasCanvasBeenInitialised] = useState(false);

  const openNode = (nodeId: string) => {
    integration.store.getState().selectStepByName(nodeId);
    setView("canvas");
  };

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BuilderStateContext.Provider value={integration.store}>
          <div className="flowcordia-studio-shell">
            <header className="flowcordia-studio-header">
              <div>
                <strong>Flowcordia Studio</strong>
                <span>Activepieces builder · Flowcordia contracts and permissions</span>
              </div>
              <div className="flowcordia-studio-header-actions">
                <div className="flowcordia-studio-view-switch" aria-label="Studio view">
                  <button
                    type="button"
                    aria-pressed={view === "canvas"}
                    onClick={() => setView("canvas")}
                  >
                    <Workflow size={14} /> Canvas
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === "code"}
                    onClick={() => setView("code")}
                  >
                    <Braces size={14} /> Code
                  </button>
                </div>
                <StatusPill />
              </div>
            </header>
            {view === "canvas" ? (
              <div className="flowcordia-studio-grid">
                <main className="flowcordia-canvas-panel">
                  <ReactFlowProvider>
                    <CursorPositionProvider>
                      <FlowCanvas setHasCanvasBeenInitialised={setHasCanvasBeenInitialised} />
                    </CursorPositionProvider>
                  </ReactFlowProvider>
                  {!hasCanvasBeenInitialised && (
                    <div className="flowcordia-canvas-loading">Preparing workflow canvas…</div>
                  )}
                </main>
                <SelectedNodeInspector />
              </div>
            ) : (
              <WorkflowCodeView
                onReplace={integration.replaceWorkflow}
                onOpenNode={openNode}
              />
            )}
          </div>
        </BuilderStateContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export function FlowcordiaActivepiecesStudioHost() {
  const [bootstrap, setBootstrap] = useState<FlowcordiaStudioBootstrap | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isBootstrap(event.data)) return;
      setBootstrap(event.data);
    };
    window.addEventListener("message", receive);
    postToParent({ type: "ready" });
    return () => window.removeEventListener("message", receive);
  }, []);

  if (!bootstrap) {
    return (
      <main className="flowcordia-bootstrap-screen">
        <div className="flowcordia-bootstrap-mark">F</div>
        <strong>Opening Flowcordia Studio</strong>
        <span>Loading the Activepieces builder with Flowcordia permissions…</span>
      </main>
    );
  }

  return <Studio bootstrap={bootstrap} />;
}
