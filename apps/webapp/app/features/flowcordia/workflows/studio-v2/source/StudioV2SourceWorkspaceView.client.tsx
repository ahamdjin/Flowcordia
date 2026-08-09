import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { search, searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  ArrowLeftIcon,
  BracesIcon,
  Code2Icon,
  CopyIcon,
  FileCode2Icon,
  PlayIcon,
  SaveIcon,
  VariableIcon,
  WorkflowIcon,
  XCircleIcon,
} from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TextEditor } from "~/components/code/TextEditor";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Button } from "~/components/primitives/Buttons";
import {
  ClientTabs,
  ClientTabsContent,
  ClientTabsList,
  ClientTabsTrigger,
} from "~/components/primitives/ClientTabs";
import { Paragraph } from "~/components/primitives/Paragraph";
import { NavBar, PageTitle } from "~/components/primitives/PageHeader";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/primitives/Resizable";
import { Spinner } from "~/components/primitives/Spinner";
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
  | "onExitStudio"
  | "onSave"
  | "onTest"
  | "onCancelTest"
  | "output"
  | "problems"
  | "saving"
  | "testInput"
  | "testStatus"
  | "onTestInputChange"
> & {
  files: readonly StudioV2SourceWorkspaceViewFile[];
  dependencies: readonly { name: string; version: string }[];
  activePath: string;
  activeCode?: string;
  activeReadOnly: boolean;
  dirty: boolean;
  onOpenFile(path: string): void;
  renderEditor(options: {
    extensions: Extension[];
    onCreateEditor(view: EditorView): void;
  }): ReactNode;
};

type SourcePanel = "problems" | "output" | "logs";

function sourceFileName(path: string | undefined): string {
  if (!path) return "No file";
  return path.split("/").filter(Boolean).at(-1) ?? path;
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

const SOURCE_CONTEXT_REFERENCES = [
  { label: "Input", value: "ctx.input", icon: BracesIcon },
  { label: "Previous steps", value: "ctx.steps", icon: Code2Icon },
  { label: "Variables", value: "ctx.variables", icon: VariableIcon },
  { label: "Credentials", value: "ctx.credentials", icon: FileCode2Icon },
] as const;

function SourceUtilitySidebar({
  dependencies,
  testInput = "",
  onTestInputChange,
  onInsertReference,
}: Pick<StudioV2SourceWorkspaceViewProps, "dependencies" | "testInput" | "onTestInputChange"> & {
  onInsertReference(value: string): void;
}) {
  const [tab, setTab] = useState("input");

  return (
    <div
      data-testid="flowcordia-source-utility"
      className="grid h-full max-h-full grid-rows-[auto_1fr] overflow-hidden bg-background-bright"
    >
      <ClientTabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-col overflow-hidden pt-1"
      >
        <ClientTabsList variant="underline" className="mx-3 shrink-0" aria-label="Source tools">
          <ClientTabsTrigger value="input" variant="underline" layoutId="source-tools-tabs">
            Input
          </ClientTabsTrigger>
          <ClientTabsTrigger value="context" variant="underline" layoutId="source-tools-tabs">
            Context
          </ClientTabsTrigger>
          <ClientTabsTrigger value="packages" variant="underline" layoutId="source-tools-tabs">
            Packages
          </ClientTabsTrigger>
        </ClientTabsList>

        <ClientTabsContent value="input" className="m-0 min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
            <div className="border-b border-grid-dimmed px-3 py-2 text-xs text-text-dimmed">
              Test payload
            </div>
            <TextEditor
              className="h-full min-h-0 bg-background-bright"
              defaultValue={testInput}
              showCopyButton
              extensions={[json()]}
              onChange={onTestInputChange}
            />
          </div>
        </ClientTabsContent>

        <ClientTabsContent value="context" className="m-0 min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {SOURCE_CONTEXT_REFERENCES.map(({ label, value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onInsertReference(value)}
                className="group flex w-full items-center gap-3 rounded px-2 py-2 text-left transition hover:bg-background-dimmed focus-custom"
              >
                <Icon className="size-4 shrink-0 text-text-dimmed group-hover:text-text-bright" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-text-bright">{label}</span>
                  <span className="block truncate font-mono text-xxs text-text-dimmed">
                    {value}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </ClientTabsContent>

        <ClientTabsContent value="packages" className="m-0 min-h-0 flex-1 overflow-y-auto p-3">
          <div data-testid="flowcordia-source-packages">
            <div className="mb-3 text-xxs font-medium uppercase text-text-dimmed">Dependencies</div>
            {dependencies.length ? (
              <div className="space-y-2">
                {dependencies.map((dependency) => (
                  <div
                    key={dependency.name}
                    className="flex min-w-0 items-center justify-between gap-3 border-b border-grid-dimmed pb-2 font-mono text-xxs last:border-b-0"
                  >
                    <span className="truncate text-text-bright">{dependency.name}</span>
                    <span className="shrink-0 text-text-dimmed">{dependency.version}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Paragraph variant="extra-small/dimmed">No package dependencies.</Paragraph>
            )}
          </div>
        </ClientTabsContent>
      </ClientTabs>
    </div>
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
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center">
        <Code2Icon className="size-8 text-charcoal-650" />
        <Paragraph variant="extra-small/dimmed">No problems.</Paragraph>
      </div>
    );
  }

  if (panel === "output") {
    return output === undefined ? (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center">
        <BracesIcon className="size-8 text-charcoal-650" />
        <Paragraph variant="extra-small/dimmed">Run the workflow to inspect its output.</Paragraph>
      </div>
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
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center">
      <FileCode2Icon className="size-8 text-charcoal-650" />
      <Paragraph variant="extra-small/dimmed">No logs yet.</Paragraph>
    </div>
  );
}

function SourcePanelTabs({
  activePanel,
  problems,
  logs,
  testStatus,
  onSelectPanel,
}: {
  activePanel: SourcePanel;
  problems: StudioV2SourceWorkspaceProps["problems"];
  logs: StudioV2SourceWorkspaceProps["logs"];
  testStatus: StudioV2SourceWorkspaceProps["testStatus"];
  onSelectPanel(panel: SourcePanel): void;
}) {
  return (
    <ClientTabs
      value={activePanel}
      onValueChange={(value) => onSelectPanel(value as SourcePanel)}
      className="h-9 shrink-0 overflow-hidden bg-background-bright"
      data-testid="flowcordia-source-lower-panel"
    >
      <ClientTabsList
        variant="underline"
        className="h-9 shrink-0 overflow-hidden px-3"
        aria-label="Source results"
      >
        <ClientTabsTrigger value="output" variant="underline" layoutId="source-results-tabs">
          Output
        </ClientTabsTrigger>
        <ClientTabsTrigger value="logs" variant="underline" layoutId="source-results-tabs">
          Logs{logs?.length ? ` (${logs.length})` : ""}
        </ClientTabsTrigger>
        <ClientTabsTrigger value="problems" variant="underline" layoutId="source-results-tabs">
          Problems{problems?.length ? ` (${problems.length})` : ""}
        </ClientTabsTrigger>
        <div className="flex flex-1 items-center justify-end border-b border-grid-dimmed px-2 text-xs text-text-dimmed">
          {testStatus === "queued" || testStatus === "running" ? (
            <span className="inline-flex items-center gap-2">
              <Spinner className="size-3.5" /> {testButtonLabel(testStatus)}
            </span>
          ) : testStatus === "success" ? (
            "Test completed"
          ) : testStatus === "error" ? (
            "Test failed"
          ) : (
            "Not tested"
          )}
        </div>
      </ClientTabsList>
    </ClientTabs>
  );
}

export function StudioV2SourceWorkspaceView({
  dependencies,
  activePath,
  activeCode,
  activeReadOnly,
  dirty,
  testInput,
  onOpenFile,
  renderEditor,
  onTestInputChange,
  onExitSource,
  onExitStudio,
  onSave,
  saving = false,
  onTest,
  onCancelTest,
  testStatus = "idle",
  output,
  logs,
  problems,
  conflict,
}: StudioV2SourceWorkspaceViewProps) {
  const [activePanel, setActivePanel] = useState<SourcePanel>("output");
  const editorViewRef = useRef<EditorView>();
  const pendingProblemRef = useRef<WorkflowSourceProblem>();
  const testing = testStatus === "queued" || testStatus === "running";
  const editorExtensions = useMemo(
    () => sourceEditorExtensions(activePath, problems),
    [activePath, problems]
  );
  const hasActionableProblems = Boolean(
    problems?.some((problem) => problem.severity === "error" || problem.severity === "warning")
  );

  const openPanel = useCallback((panel: SourcePanel) => {
    setActivePanel(panel);
  }, []);

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

  const insertReference = useCallback(
    (value: string) => {
      const view = editorViewRef.current;
      if (!view || activeReadOnly) return;
      const selection = view.state.selection.main;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: value },
        selection: { anchor: selection.from + value.length },
      });
      view.focus();
    },
    [activeReadOnly]
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
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        {activeCode !== undefined ? (
          renderEditor({ extensions: editorExtensions, onCreateEditor: handleEditorCreate })
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
      className="h-full min-h-0 min-w-0 overflow-hidden bg-background"
      onKeyDown={handleKeyDown}
    >
      <PageContainer>
        <NavBar>
          {onExitStudio ? (
            <Button
              type="button"
              variant="minimal/small"
              LeadingIcon={ArrowLeftIcon}
              onClick={onExitStudio}
            >
              Workflows
            </Button>
          ) : null}
          <PageTitle title="Source" />
          {onExitSource ? (
            <Button
              type="button"
              variant="secondary/small"
              LeadingIcon={WorkflowIcon}
              aria-label="Return to visual editor"
              onClick={onExitSource}
            >
              Editor
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
              variant="secondary/small"
              LeadingIcon={testing ? XCircleIcon : PlayIcon}
              aria-label={testing ? "Cancel workflow test" : "Test workflow"}
              tooltip={testing ? "Cancel workflow test" : "Test workflow (Cmd/Ctrl+Enter)"}
              disabled={(testing && !onCancelTest) || saving || Boolean(conflict)}
              onClick={testing ? onCancelTest : onTest}
            >
              {testing && onCancelTest ? "Cancel" : testButtonLabel(testStatus)}
            </Button>
          ) : null}
          {onSave ? (
            <Button
              type="button"
              variant="primary/small"
              LeadingIcon={SaveIcon}
              aria-label="Save workflow source"
              tooltip="Save source (⌘/Ctrl+S)"
              disabled={saving || !dirty || Boolean(conflict)}
              onClick={onSave}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          ) : null}
        </NavBar>
        <PageBody scrollable={false} className="min-h-0">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
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

            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1 bg-charcoal-800"
            >
              <ResizablePanel id="source-main" className="h-full min-w-0">
                <ResizablePanelGroup orientation="vertical" className="h-full overflow-hidden">
                  <ResizablePanel
                    id="source-editor"
                    min="220px"
                    default="56%"
                    className="overflow-hidden"
                  >
                    <div className="grid h-full min-h-0 grid-rows-[1fr_auto] bg-background">
                      {editorSurface}
                      <div className="flex min-h-10 items-center justify-between gap-2 border-t border-grid-dimmed bg-charcoal-900 px-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileCode2Icon className="size-3.5 shrink-0 text-text-dimmed" />
                          <span className="truncate text-xs text-text-dimmed">
                            {sourceFileName(activePath)}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            variant="minimal/small"
                            LeadingIcon={CopyIcon}
                            aria-label="Copy active source file"
                            tooltip="Copy source"
                            onClick={() => navigator.clipboard.writeText(activeCode ?? "")}
                          />
                          <span className="text-xxs text-text-dimmed">
                            {activeReadOnly ? "Read only" : dirty ? "Unsaved changes" : "Saved"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle id="source-editor-handle" />

                  <ResizablePanel
                    id="source-results"
                    min="180px"
                    className="overflow-hidden bg-background-bright"
                  >
                    <ClientTabs
                      value={activePanel}
                      onValueChange={(value) => openPanel(value as SourcePanel)}
                      className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden"
                    >
                      <SourcePanelTabs
                        activePanel={activePanel}
                        problems={problems}
                        logs={logs}
                        testStatus={testStatus}
                        onSelectPanel={openPanel}
                      />
                      <ClientTabsContent
                        value={activePanel}
                        forceMount
                        className="m-0 min-h-0 overflow-auto bg-background-bright p-3"
                      >
                        <SourcePanelContent
                          panel={activePanel}
                          output={output}
                          logs={logs}
                          problems={problems}
                          onSelectProblem={handleProblemSelect}
                        />
                      </ClientTabsContent>
                    </ClientTabs>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>

              <ResizableHandle id="source-utility-handle" />

              <ResizablePanel
                id="source-utility"
                min="280px"
                default="360px"
                max="560px"
                className="h-full"
              >
                <SourceUtilitySidebar
                  dependencies={dependencies}
                  testInput={testInput}
                  onTestInputChange={onTestInputChange}
                  onInsertReference={insertReference}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </PageBody>
      </PageContainer>
    </section>
  );
}
