import type { EditorNodeInstance } from "@flyde/core";
import {
  DebuggerContextProvider,
  FlowEditor,
  PortsContext,
  defaultBoardData,
  type EditorPorts,
  type FlowEditorState,
} from "@flyde/editor";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Paragraph } from "~/components/primitives/Paragraph";
import { projectStudioV2WorkflowToFlyde } from "./flyde-workflow-adapter";

function ownedByFlowcordia(name: string): Promise<never> {
  return Promise.reject(new Error(`${name} is owned by Flowcordia.`));
}

function StudioV2FlydeGraphCanvas({
  node,
}: {
  node: NonNullable<FlowEditorState["flow"]>["node"];
}) {
  const projectedState = useMemo<FlowEditorState>(
    () => ({ flow: { node }, boardData: { ...defaultBoardData } }),
    [node]
  );
  const [state, setState] = useState(projectedState);

  useEffect(() => setState(projectedState), [projectedState]);

  const ports = useMemo<EditorPorts>(
    () => ({
      prompt: async () => null,
      confirm: async () => false,
      openFile: async () => undefined,
      readFlow: () => ownedByFlowcordia("Reading Flyde files"),
      setFlow: async () => undefined,
      onExternalFlowChange: () => () => undefined,
      onRunFlow: () => ownedByFlowcordia("Workflow execution"),
      onStopFlow: async () => undefined,
      reportEvent: () => undefined,
      generateNodeFromPrompt: () => ownedByFlowcordia("AI node generation"),
      getLibraryData: async () => ({ groups: [] }),
      onRequestSiblingNodes: async () => [],
      onRequestNodeSource: async () => "",
      onCreateCustomNode: () => ownedByFlowcordia("Custom Flyde nodes"),
      createAiCompletion: undefined,
      resolveInstance: async ({ instance }) => instance as EditorNodeInstance,
      getAvailableSecrets: async () => [],
      addNewSecret: async () => [],
    }),
    []
  );

  const onChangeEditorState = useCallback<Dispatch<SetStateAction<FlowEditorState>>>(
    (action) => {
      setState((current) => {
        const requested = typeof action === "function" ? action(current) : action;
        return { ...requested, flow: { node } };
      });
    },
    [node]
  );

  return (
    <PortsContext.Provider value={ports}>
      <DebuggerContextProvider
        value={{ onRequestHistory: async () => ({ total: 0, lastSamples: [] }) }}
      >
        <FlowEditor
          state={state}
          onChangeEditorState={onChangeEditorState}
          darkMode
          requireModifierForZoom
          initialPadding={[72, 56]}
        />
      </DebuggerContextProvider>
    </PortsContext.Provider>
  );
}

export function StudioV2FlydeGraph({ document }: { document: unknown }) {
  const projection = useMemo(() => projectStudioV2WorkflowToFlyde(document), [document]);

  return (
    <div
      data-testid="flowcordia-source-flyde-graph"
      data-editor-foundation="flyde-1.0.46"
      aria-label="Workflow graph"
      className="relative h-full min-h-0 min-w-0 overflow-hidden bg-charcoal-900 [&>.flyde-flow-editor]:h-full [&>.flyde-flow-editor]:w-full"
    >
      {projection.success ? (
        <StudioV2FlydeGraphCanvas node={projection.node} />
      ) : (
        <div className="flex h-full items-center justify-center p-5">
          <Paragraph variant="extra-small/dimmed">{projection.message}</Paragraph>
        </div>
      )}
      <span className="pointer-events-none absolute left-2 top-2 rounded border border-grid-bright bg-background/90 px-2 py-1 text-xxs text-text-dimmed">
        Workflow graph
      </span>
    </div>
  );
}
