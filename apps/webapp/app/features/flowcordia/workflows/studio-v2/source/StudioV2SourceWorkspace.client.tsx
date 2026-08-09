import {
  SandpackCodeEditor,
  SandpackFileExplorer,
  SandpackLayout,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { StudioV2SourceWorkspaceProps } from "./StudioV2SourceWorkspace";
import { StudioV2SourceWorkspaceView } from "./StudioV2SourceWorkspaceView.client";
import {
  isWorkflowSourceFileReadOnly,
  mergeWorkflowSourceCodes,
  normalizeWorkflowSourcePath,
  normalizeWorkflowSourceWorkspace,
  resolveWorkflowSourceActiveFile,
  workflowSourceWorkspaceSignature,
} from "./workspace-model";

/**
 * Sandpack owns only the transient workspace model. The visible Source UI lives
 * in StudioV2SourceWorkspaceView and receives Flowcordia values/actions only.
 * This keeps CodeMirror and the product surface independent of Sandpack.
 */
function SandpackWorkspaceAdapter({
  workspace,
  readOnly = false,
  dirty: controlledDirty,
  onWorkspaceChange,
  ...viewProps
}: StudioV2SourceWorkspaceProps) {
  const { sandpack } = useSandpack();
  const baselineSignature = useMemo(() => workflowSourceWorkspaceSignature(workspace), [workspace]);
  const lastEmittedSignatureRef = useRef(baselineSignature);

  useEffect(() => {
    lastEmittedSignatureRef.current = baselineSignature;
  }, [baselineSignature]);

  const currentCodes = useMemo(
    () =>
      Object.fromEntries(Object.entries(sandpack.files).map(([path, file]) => [path, file.code])),
    [sandpack.files]
  );
  const currentWorkspace = useMemo(
    () => mergeWorkflowSourceCodes(workspace, currentCodes),
    [currentCodes, workspace]
  );
  const currentSignature = useMemo(
    () => workflowSourceWorkspaceSignature(currentWorkspace),
    [currentWorkspace]
  );
  const dirty = controlledDirty ?? currentSignature !== baselineSignature;

  useEffect(() => {
    if (readOnly || !onWorkspaceChange || currentSignature === lastEmittedSignatureRef.current) {
      return;
    }

    lastEmittedSignatureRef.current = currentSignature;
    onWorkspaceChange(currentWorkspace);
  }, [currentSignature, currentWorkspace, onWorkspaceChange, readOnly]);

  const activePath = normalizeWorkflowSourcePath(sandpack.activeFile || workspace.entrypoint);
  const activeCode = sandpack.files[activePath]?.code;
  const activeReadOnly = isWorkflowSourceFileReadOnly(workspace, activePath, readOnly);
  const files = useMemo(
    () =>
      Object.entries(currentWorkspace.files)
        .filter(([, file]) => !file.hidden)
        .map(([path, file]) => ({
          path,
          readOnly: Boolean(readOnly || file.readOnly),
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    [currentWorkspace.files, readOnly]
  );
  const dependencies = useMemo(
    () =>
      Object.entries(currentWorkspace.dependencies)
        .map(([name, version]) => ({ name, version }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentWorkspace.dependencies]
  );

  const openFile = useCallback(
    (rawPath: string) => {
      const path = normalizeWorkflowSourcePath(rawPath);
      if (!currentWorkspace.files[path] || currentWorkspace.files[path]?.hidden) return;
      sandpack.setActiveFile(path);
    },
    [currentWorkspace.files, sandpack]
  );

  return (
    <StudioV2SourceWorkspaceView
      {...viewProps}
      files={files}
      dependencies={dependencies}
      activePath={activePath}
      activeCode={activeCode}
      activeReadOnly={activeReadOnly}
      dirty={dirty}
      onOpenFile={openFile}
      renderEditor={({ extensions, onCreateEditor }) => (
        <SandpackLayout
          data-testid="flowcordia-sandpack-layout"
          className="h-full min-h-0 w-full min-w-0 !rounded-none !border-0 [&_.sp-editor]:h-full [&_.sp-stack]:h-full"
          style={{ height: "100%", minHeight: 0, border: 0, borderRadius: 0 }}
        >
          <SandpackFileExplorer
            autoHiddenFiles
            className="h-full min-h-0 border-r border-grid-dimmed bg-background-bright"
            style={{ height: "100%", minWidth: 180, maxWidth: 240 }}
          />
          <SandpackCodeEditor
            ref={(instance) => {
              if (!instance || typeof instance.getCodemirror !== "function") return;
              const view = instance.getCodemirror();
              if (view) onCreateEditor(view);
            }}
            className="h-full min-h-0 min-w-0 flex-1"
            style={{ height: "100%", minHeight: 0 }}
            extensions={extensions}
            readOnly={activeReadOnly}
            showReadOnly
            showTabs
            showLineNumbers
            showInlineErrors={false}
            showRunButton={false}
            wrapContent={false}
          />
        </SandpackLayout>
      )}
    />
  );
}

export function StudioV2SourceWorkspaceClient(props: StudioV2SourceWorkspaceProps) {
  const normalizedWorkspace = useMemo(
    () => normalizeWorkflowSourceWorkspace(props.workspace),
    [props.workspace]
  );
  const resolvedActiveFile = resolveWorkflowSourceActiveFile(normalizedWorkspace);
  const sandpackFiles = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(normalizedWorkspace.files).map(([path, file]) => [
          path,
          {
            code: file.code,
            hidden: file.hidden,
            active: path === resolvedActiveFile,
            readOnly: Boolean(props.readOnly || file.readOnly),
          },
        ])
      ),
    [normalizedWorkspace.files, props.readOnly, resolvedActiveFile]
  );

  return (
    <div
      data-testid="flowcordia-source-sandpack-host"
      className="h-full min-h-0 min-w-0 [&>.sp-wrapper]:h-full [&>.sp-wrapper]:min-h-0"
    >
      <SandpackProvider
        theme="dark"
        files={sandpackFiles}
        customSetup={{
          entry: normalizedWorkspace.entrypoint,
          dependencies: normalizedWorkspace.dependencies,
        }}
        options={{
          activeFile: resolvedActiveFile,
          autorun: false,
          autoReload: false,
          skipEval: true,
        }}
      >
        <SandpackWorkspaceAdapter {...props} workspace={normalizedWorkspace} />
      </SandpackProvider>
    </div>
  );
}
