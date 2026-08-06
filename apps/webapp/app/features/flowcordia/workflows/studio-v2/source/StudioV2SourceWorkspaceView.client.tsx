import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import type { Extension } from "@codemirror/state";
import { useMemo, useState } from "react";
import { TextEditor } from "~/components/code/TextEditor";
import { Button } from "~/components/primitives/Buttons";
import {
  ClientTabs,
  ClientTabsContent,
  ClientTabsList,
  ClientTabsTrigger,
} from "~/components/primitives/ClientTabs";
import { Paragraph } from "~/components/primitives/Paragraph";
import { cn } from "~/utils/cn";
import type { StudioV2SourceWorkspaceProps } from "./StudioV2SourceWorkspace";

export type StudioV2SourceWorkspaceViewFile = {
  path: string;
  readOnly: boolean;
};

export type StudioV2SourceWorkspaceViewProps = Pick<
  StudioV2SourceWorkspaceProps,
  "logs" | "onTest" | "output" | "problems" | "testStatus"
> & {
  files: readonly StudioV2SourceWorkspaceViewFile[];
  activePath: string;
  activeCode?: string;
  activeReadOnly: boolean;
  dirty: boolean;
  onOpenFile(path: string): void;
  onUpdateFile(path: string, code: string): void;
};

type SourcePanel = "problems" | "output" | "logs" | "terminal";

function sourceFileName(path: string | undefined): string {
  if (!path) return "No file";
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function sourceFileDirectory(path: string): string | undefined {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return undefined;
  return parts.slice(0, -1).join("/");
}

function sourceEditorExtensions(path: string): Extension[] {
  const lowerPath = path.toLowerCase();

  if (lowerPath.endsWith(".json")) {
    return [json()];
  }

  if (
    lowerPath.endsWith(".ts") ||
    lowerPath.endsWith(".tsx") ||
    lowerPath.endsWith(".js") ||
    lowerPath.endsWith(".jsx")
  ) {
    return [
      javascript({
        typescript: lowerPath.endsWith(".ts") || lowerPath.endsWith(".tsx"),
        jsx: lowerPath.endsWith(".tsx") || lowerPath.endsWith(".jsx"),
      }),
    ];
  }

  return [];
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
}: Pick<StudioV2SourceWorkspaceProps, "output" | "logs" | "problems"> & {
  panel: SourcePanel;
}) {
  if (panel === "problems") {
    return problems?.length ? (
      <div className="space-y-2">
        {problems.map((problem, index) => (
          <div
            key={`${problem.file ?? "problem"}-${problem.line ?? 0}-${index}`}
            className="border-b border-grid-dimmed pb-2 last:border-b-0"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
              {problem.severity ? (
                <span className="shrink-0 uppercase text-text-dimmed">{problem.severity}</span>
              ) : null}
              {problem.file ? (
                <span className="min-w-0 truncate font-mono text-text-bright">{problem.file}</span>
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
          </div>
        ))}
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

  if (panel === "logs") {
    return logs?.length ? (
      <div className="space-y-1 font-mono text-xs text-text-bright">
        {logs.map((log, index) => (
          <div key={`${log.timestamp ?? "log"}-${index}`} className="flex min-w-0 gap-2">
            {log.timestamp ? (
              <span className="shrink-0 text-text-dimmed">{log.timestamp}</span>
            ) : null}
            {log.level ? (
              <span className="w-11 shrink-0 uppercase text-text-dimmed">{log.level}</span>
            ) : null}
            <span className="min-w-0 whitespace-pre-wrap break-words">{log.message}</span>
          </div>
        ))}
      </div>
    ) : (
      <Paragraph variant="extra-small/dimmed">No logs yet.</Paragraph>
    );
  }

  return (
    <Paragraph variant="extra-small/dimmed">
      Terminal becomes available when a Source execution workspace is attached.
    </Paragraph>
  );
}

function SourceLowerPanel({
  output,
  logs,
  problems,
}: Pick<StudioV2SourceWorkspaceProps, "output" | "logs" | "problems">) {
  const [activePanel, setActivePanel] = useState<SourcePanel>("problems");
  const [open, setOpen] = useState(false);

  const selectPanel = (panel: SourcePanel) => {
    if (panel === activePanel) {
      setOpen((current) => !current);
      return;
    }

    setActivePanel(panel);
    setOpen(true);
  };

  return (
    <ClientTabs
      value={activePanel}
      onValueChange={(value) => {
        const panel = value as SourcePanel;
        if (panel !== activePanel) {
          setActivePanel(panel);
          setOpen(true);
        }
      }}
      className={cn(
        "shrink-0 overflow-hidden border-t border-grid-dimmed bg-background transition-[height] duration-150",
        open ? "h-44" : "h-9"
      )}
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
          onClick={() => selectPanel("problems")}
        >
          Problems{problems?.length ? ` (${problems.length})` : ""}
        </ClientTabsTrigger>
        <ClientTabsTrigger
          value="output"
          variant="underline"
          aria-expanded={open && activePanel === "output"}
          onClick={() => selectPanel("output")}
        >
          Output
        </ClientTabsTrigger>
        <ClientTabsTrigger
          value="logs"
          variant="underline"
          aria-expanded={open && activePanel === "logs"}
          onClick={() => selectPanel("logs")}
        >
          Logs
        </ClientTabsTrigger>
        <ClientTabsTrigger
          value="terminal"
          variant="underline"
          aria-expanded={open && activePanel === "terminal"}
          onClick={() => selectPanel("terminal")}
        >
          Terminal
        </ClientTabsTrigger>
      </ClientTabsList>

      {open ? (
        <div className="h-[calc(100%-2.25rem)] min-h-0 overflow-auto border-t border-grid-dimmed p-3">
          <ClientTabsContent value={activePanel} forceMount className="m-0">
            <SourcePanelContent
              panel={activePanel}
              output={output}
              logs={logs}
              problems={problems}
            />
          </ClientTabsContent>
        </div>
      ) : null}
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
  onTest,
  testStatus = "idle",
  output,
  logs,
  problems,
}: StudioV2SourceWorkspaceViewProps) {
  const [filesOpen, setFilesOpen] = useState(false);
  const testing = testStatus === "queued" || testStatus === "running";
  const editorExtensions = useMemo(() => sourceEditorExtensions(activePath), [activePath]);

  return (
    <section
      aria-label="Workflow source editor"
      data-testid="flowcordia-source-workspace"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-grid-dimmed px-3">
        <Button
          type="button"
          variant="minimal/small"
          aria-controls="studio-v2-source-files"
          aria-expanded={filesOpen}
          onClick={() => setFilesOpen((current) => !current)}
        >
          Files
        </Button>
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
            variant="primary/small"
            aria-label="Test workflow source"
            disabled={testing}
            onClick={onTest}
          >
            {testButtonLabel(testStatus)}
          </Button>
        ) : null}
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {filesOpen ? (
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

      <SourceLowerPanel output={output} logs={logs} problems={problems} />
    </section>
  );
}
