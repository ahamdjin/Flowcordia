import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { search, searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { TextEditor } from "~/components/code/TextEditor";
import { Button } from "~/components/primitives/Buttons";
import {
  ClientTabs,
  ClientTabsContent,
  ClientTabsList,
  ClientTabsTrigger,
} from "~/components/primitives/ClientTabs";
import { Paragraph } from "~/components/primitives/Paragraph";
import { isSourceEditorSaveShortcut } from "~/features/flowcordia/workflows/studio/source-editor-safety";
import { cn } from "~/utils/cn";
import type { StudioV2SourceWorkspaceProps } from "./StudioV2SourceWorkspace";
import type { WorkflowSourceProblem } from "./workspace-model";

export type StudioV2SourceWorkspaceViewFile = {
  path: string;
  readOnly: boolean;
};

export type StudioV2SourceWorkspaceViewProps = Pick<
  StudioV2SourceWorkspaceProps,
  | "conflict"
  | "logs"
  | "onExitSource"
  | "onSave"
  | "onTest"
  | "output"
  | "problems"
  | "saving"
  | "testStatus"
> & {
  files: readonly StudioV2SourceWorkspaceViewFile[];
  activePath: string;
  activeCode?: string;
  activeReadOnly: boolean;
  dirty: boolean;
  onOpenFile(path: string): void;
  onUpdateFile(path: string, code: string): void;
};

type SourcePanel = "problems" | "output" | "logs";

function sourceFileName(path: string | undefined): string {
  if (!path) return "No file";
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function sourceFileDirectory(path: string): string | undefined {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return undefined;
  return parts.slice(0, -1).join("/");
}

function sourceProblemDiagnostics(
  path: string,
  problems: readonly WorkflowSourceProblem[] | undefined
): Extension[] {
  const matchingProblems = (problems ?? []).filter(
    (problem) => !problem.file || problem.file === path
  );

  if (matchingProblems.length === 0) return [];

  return [
    linter(
      (view) =>
        matchingProblems.flatMap((problem): Diagnostic[] => {
          if (!problem.line) return [];

          const lineNumber = Math.min(Math.max(problem.line, 1), view.state.doc.lines);
          const line = view.state.doc.line(lineNumber);
          const column = Math.min(Math.max((problem.column ?? 1) - 1, 0), line.length);
          const from = line.from + column;
          const to = Math.min(from + 1, line.to);

          return [
            {
              from,
              to: Math.max(from, to),
              severity: problem.severity ?? "error",
              message: problem.message,
            },
          ];
        }),
      { delay: 0 }
    ),
    lintGutter(),
  ];
}

function sourceEditorExtensions(
  path: string,
  problems: readonly WorkflowSourceProblem[] | undefined
): Extension[] {
  const lowerPath = path.toLowerCase();
  const languageExtensions: Extension[] = [];

  if (lowerPath.endsWith(".json")) {
    languageExtensions.push(json());
  } else if (
    lowerPath.endsWith(".ts") ||
    lowerPath.endsWith(".tsx") ||
    lowerPath.endsWith(".js") ||
    lowerPath.endsWith(".jsx")
  ) {
    languageExtensions.push(
      javascript({
        typescript: lowerPath.endsWith(".ts") || lowerPath.endsWith(".tsx"),
        jsx: lowerPath.endsWith(".tsx") || lowerPath.endsWith(".jsx"),
      })
    );
  }

  return [
    search({ top: true }),
    keymap.of(searchKeymap),
    ...languageExtensions,
    ...sourceProblemDiagnostics(path, problems),
  ];
}

function testButtonLabel(status: StudioV2SourceWorkspaceProps["testStatus"]): string {
  if (status === "queued") return "Queued";
  if (status === "running") return "Testing...";
  return "Test";
}

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function formatLogTime(timestamp: string | undefined): string | undefined {
  if (!timestamp) return undefined;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function focusProblem(view: EditorView | undefined, problem: WorkflowSourceProblem): void {
  if (!view || !problem.line) return;

  const lineNumber = Math.min(Math.max(problem.line, 1), view.state.doc.lines);
  const line = view.state.doc.line(lineNumber);
  const column = Math.min(Math.max((problem.column ?? 1) - 1, 0), line.length);
  const position = line.from + column;

  view.dispatch({
    selection: { anchor: position },
    effects: EditorView.scrollIntoView(position, { y: "center" }),
  });
  view.focus();
}

function SourceFiles({
  files,
  activePath,
  onOpenFile,
}: Pick<StudioV2SourceWorkspaceViewProps, "files" | "activePath" | "onOpenFile">) {
  return (
    <aside
      id="studio-v2-source-files"
      aria-label="Workflow files"
      data-testid="flowcordia-source-files"
      className="h-full w-52 shrink-0 overflow-y-auto border-r border-grid-dimmed bg-background py-2"
    >
      <div className="px-3 pb-2 text-xxs font-medium uppercase tracking-wide text-text-dimmed">
        Files
      </div>
      <div className="space-y-0.5 px-1.5">
        {files.map((file) => {
          const active = file.path === activePath;
          const directory = sourceFileDirectory(file.path);

          return (
            <button
              key={file.path}
              type="button"
              aria-current={active ? "page" : undefined}
              title={file.path}
              onClick={() => onOpenFile(file.path)}
              className={cn(
                "group flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left transition focus-custom",
                active ? "bg-background-dimmed" : "hover:bg-background-dimmed/60"
              )}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  active ? "text-text-bright" : "text-text-dimmed group-hover:text-text-bright"
                )}
              >
                {sourceFileName(file.path)}
              </span>
              {file.readOnly ? (
                <span className="shrink-0 text-xxs text-text-dimmed">read only</span>
              ) : null}
              {directory ? <span className="sr-only">in {directory}</span> : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function SourcePanelContent({
  panel,
  output,
  logs,
  problems,
  onSelectProblem,
}: Pick<StudioV2SourceWorkspaceProps, "output" | "logs" | "problems"> & {
  panel: SourcePanel;
  onSelectProblem(problem: WorkflowSourceProblem): void;
}) {
  if (panel === "problems") {
    return problems?.length ? (
      <div className="divide-y divide-grid-dimmed">
        {problems.map((problem, index) => {
          const navigable = Boolean(problem.file || problem.line);
          return (
            <button
              key={`${problem.file ?? "problem"}-${problem.line ?? 0}-${index}`}
              type="button"
              disabled={!navigable}
              onClick={() => onSelectProblem(problem)}
              className={cn(
                "block w-full py-2 text-left first:pt-0 last:pb-0 focus-custom",
                navigable && "cursor-pointer hover:bg-background-dimmed/40"
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                {problem.severity ? (
                  <span className="shrink-0 uppercase text-text-dimmed">{problem.severity}</span>
                ) : null}
                {problem.file ? (
                  <span className="min-w-0 truncate font-mono text-text-bright">
                    {problem.file}
                  </span>
                ) : null}
                {problem.line ? (
                  <span className="shrink-0 font-mono text-text-dimmed">
                    {problem.line}:{problem.column ?? 1}
                  </span>
                ) : null}
              </div>
              <Paragraph variant="extra-small/bright" className="mt-1">
                {problem.message}
              </Paragraph>
            </button>
          );
        })}
      </div>
    ) : (
      <Paragraph variant="extra-small/dimmed">No problems.</Paragraph>
    );
  }

  if (panel === "output") {
    return output === undefined ? (
      <Paragraph variant="extra-small/dimmed">No output yet.</Paragraph>
    ) : (
      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text-bright">
        {stringifyOutput(output)}
      </pre>
    );
  }

  return logs?.length ? (
    <div className="space-y-1 font-mono text-xs text-text-bright">
      {logs.map((log, index) => {
        const timestamp = formatLogTime(log.timestamp);
        return (
          <div key={`${log.timestamp ?? "log"}-${index}`} className="flex min-w-0 gap-2">
            {timestamp ? <span className="shrink-0 text-text-dimmed">{timestamp}</span> : null}
            {log.level ? (
              <span className="w-11 shrink-0 uppercase text-text-dimmed">{log.level}</span>
            ) : null}
            <span className="min-w-0 whitespace-pre-wrap break-words">{log.message}</span>
          </div>
        );
      })}
    </div>
  ) : (
    <Paragraph variant="extra-small/dimmed">No logs yet.</Paragraph>
  );
}

function SourcePanelTabs({
  activePanel,
  open,
  problems,
  logs,
  onSelectPanel,
}: {
  activePanel: SourcePanel;
  open: boolean;
  problems: StudioV2SourceWorkspaceProps["problems"];
  logs: StudioV2SourceWorkspaceProps["logs"];
  onSelectPanel(panel: SourcePanel): void;
}) {
  return (
    <ClientTabs
      value={activePanel}
      onValueChange={(value) => onSelectPanel(value as SourcePanel)}
      className="h-9 shrink-0 overflow-hidden border-t border-grid-dimmed bg-background"
      data-testid="flowcordia-source-lower-panel"
      data-panel-state={open ? "open" : "closed"}
    >
      <ClientTabsList
        variant="underline"
        className="h-9 shrink-0 overflow-hidden border-b-0 px-3"
        aria-label="Source results"
      >
        <ClientTabsTrigger
          value="problems"
          variant="underline"
          aria-expanded={open && activePanel === "problems"}
          onClick={() => onSelectPanel("problems")}
        >
          Problems{problems?.length ? ` (${problems.length})` : ""}
        </ClientTabsTrigger>
        <ClientTabsTrigger
          value="output"
          variant="underline"
          aria-expanded={open && activePanel === "output"}
          onClick={() => onSelectPanel("output")}
        >
          Output
        </ClientTabsTrigger>
        <ClientTabsTrigger
          value="logs"
          variant="underline"
          aria-expanded={open && activePanel === "logs"}
          onClick={() => onSelectPanel("logs")}
        >
          Logs{logs?.length ? ` (${logs.length})` : ""}
        </ClientTabsTrigger>
      </ClientTabsList>
    </ClientTabs>
  );
}

export function StudioV2SourceWorkspaceView({
  files,
  activePath,
  activeCode,
  activeReadOnly,
  dirty,
  onOpenFile,
  onUpdateFile,
  onExitSource,
  onSave,
  saving = false,
  onTest,
  testStatus = "idle",
  output,
  logs,
  problems,
  conflict,
}: StudioV2SourceWorkspaceViewProps) {
  const [filesOpen, setFilesOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<SourcePanel>("problems");
  const [panelOpen, setPanelOpen] = useState(false);
  const lowerPanelRef = useRef<ImperativePanelHandle>(null);
  const editorViewRef = useRef<EditorView>();
  const pendingProblemRef = useRef<WorkflowSourceProblem>();
  const testing = testStatus === "queued" || testStatus === "running";
  const editorExtensions = useMemo(
    () => sourceEditorExtensions(activePath, problems),
    [activePath, problems]
  );
  const hasFileRail = files.length > 1;
  const hasActionableProblems = Boolean(
    problems?.some((problem) => problem.severity === "error" || problem.severity === "warning")
  );

  const openPanel = useCallback((panel: SourcePanel) => {
    setActivePanel(panel);
    setPanelOpen(true);
    lowerPanelRef.current?.expand();
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    lowerPanelRef.current?.collapse();
  }, []);

  const selectPanel = useCallback(
    (panel: SourcePanel) => {
      if (panelOpen && panel === activePanel) {
        closePanel();
        return;
      }
      openPanel(panel);
    },
    [activePanel, closePanel, openPanel, panelOpen]
  );

  useEffect(() => {
    if ((testStatus === "error" && problems?.length) || hasActionableProblems) {
      openPanel("problems");
      return;
    }
    if (testStatus === "success") {
      openPanel(output === undefined ? "logs" : "output");
    }
  }, [hasActionableProblems, openPanel, output, problems?.length, testStatus]);

  const handleProblemSelect = useCallback(
    (problem: WorkflowSourceProblem) => {
      pendingProblemRef.current = problem;
      if (problem.file && problem.file !== activePath) {
        onOpenFile(problem.file);
        return;
      }
      focusProblem(editorViewRef.current, problem);
    },
    [activePath, onOpenFile]
  );

  const handleEditorCreate = useCallback(
    (view: EditorView) => {
      editorViewRef.current = view;
      const pendingProblem = pendingProblemRef.current;
      if (!pendingProblem) return;
      if (pendingProblem.file && pendingProblem.file !== activePath) return;
      focusProblem(view, pendingProblem);
      pendingProblemRef.current = undefined;
    },
    [activePath]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (
        onSave &&
        dirty &&
        !saving &&
        isSourceEditorSaveShortcut({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
        })
      ) {
        event.preventDefault();
        event.stopPropagation();
        onSave();
        return;
      }

      if (
        onTest &&
        !testing &&
        !saving &&
        !event.altKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        event.stopPropagation();
        onTest();
      }
    },
    [dirty, onSave, onTest, saving, testing]
  );

  const editorSurface = (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
      {hasFileRail && filesOpen ? (
        <SourceFiles files={files} activePath={activePath} onOpenFile={onOpenFile} />
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        {activeCode !== undefined ? (
          <TextEditor
            key={activePath}
            className="h-full min-h-0 min-w-0 bg-background"
            defaultValue={activeCode}
            readOnly={activeReadOnly}
            showCopyButton={false}
            extensions={editorExtensions}
            onCreateEditor={handleEditorCreate}
            onChange={(code) => {
              if (!activeReadOnly) {
                onUpdateFile(activePath, code);
              }
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <Paragraph variant="extra-small/dimmed">Select a source file.</Paragraph>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section
      aria-label="Workflow source editor"
      data-testid="flowcordia-source-workspace"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      onKeyDown={handleKeyDown}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-grid-dimmed px-3">
        {onExitSource ? (
          <Button
            type="button"
            variant="minimal/small"
            aria-label="Return to visual editor"
            onClick={onExitSource}
          >
            Editor
          </Button>
        ) : null}
        {hasFileRail ? (
          <Button
            type="button"
            variant="minimal/small"
            aria-controls="studio-v2-source-files"
            aria-expanded={filesOpen}
            onClick={() => setFilesOpen((current) => !current)}
          >
            Files
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-xs font-medium text-text-bright" title={activePath}>
            {sourceFileName(activePath)}
          </span>
          {activeReadOnly ? (
            <span className="shrink-0 text-xxs text-text-dimmed">Read only</span>
          ) : dirty ? (
            <span className="shrink-0 text-xxs text-text-dimmed">Unsaved</span>
          ) : null}
        </div>
        {onTest ? (
          <Button
            type="button"
            variant="minimal/small"
            aria-label="Test workflow source"
            tooltip="Test source (⌘/Ctrl+Enter)"
            disabled={testing || saving || Boolean(conflict)}
            onClick={onTest}
          >
            {testButtonLabel(testStatus)}
          </Button>
        ) : null}
        {onSave ? (
          <Button
            type="button"
            variant="primary/small"
            aria-label="Save workflow source"
            tooltip="Save source (⌘/Ctrl+S)"
            disabled={saving || !dirty || Boolean(conflict)}
            onClick={onSave}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        ) : null}
      </header>

      {conflict ? (
        <div
          role="alert"
          data-testid="flowcordia-source-conflict"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warning/40 bg-warning/5 px-3 py-2"
        >
          <Paragraph variant="extra-small" className="min-w-0 flex-1 text-text-bright">
            {conflict.message}
          </Paragraph>
          <Button type="button" variant="minimal/small" onClick={conflict.onReloadLatest}>
            Reload latest
          </Button>
          <Button type="button" variant="secondary/small" onClick={conflict.onKeepLocalDraft}>
            Keep my draft
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <PanelGroup direction="vertical" className="h-full min-h-0 min-w-0">
          <Panel id="source-editor" order={1} minSize={35}>
            {editorSurface}
          </Panel>
          <PanelResizeHandle
            className={cn(
              "relative h-px shrink-0 bg-grid-dimmed transition-colors focus-custom",
              panelOpen
                ? "after:absolute after:inset-x-0 after:-top-1 after:h-2 hover:bg-text-dimmed"
                : "pointer-events-none opacity-0"
            )}
            disabled={!panelOpen}
          />
          <Panel
            ref={lowerPanelRef}
            id="source-results"
            order={2}
            defaultSize={0}
            minSize={12}
            maxSize={55}
            collapsedSize={0}
            collapsible
            onCollapse={() => setPanelOpen(false)}
            onExpand={() => setPanelOpen(true)}
          >
            <div className="h-full min-h-0 overflow-auto bg-background p-3">
              <ClientTabs value={activePanel} className="h-full">
                <ClientTabsContent value={activePanel} forceMount className="m-0 h-full">
                  <SourcePanelContent
                    panel={activePanel}
                    output={output}
                    logs={logs}
                    problems={problems}
                    onSelectProblem={handleProblemSelect}
                  />
                </ClientTabsContent>
              </ClientTabs>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <SourcePanelTabs
        activePanel={activePanel}
        open={panelOpen}
        problems={problems}
        logs={logs}
        onSelectPanel={selectPanel}
      />
    </section>
  );
}
