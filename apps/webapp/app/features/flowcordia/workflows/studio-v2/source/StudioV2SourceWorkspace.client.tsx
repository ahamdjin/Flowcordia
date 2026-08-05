import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import type { Extension } from "@codemirror/state";
import {
  SandpackFileExplorer,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TextEditor } from "~/components/code/TextEditor";
import { Button } from "~/components/primitives/Buttons";
import {
  ClientTabs,
  ClientTabsContent,
  ClientTabsList,
  ClientTabsTrigger,
} from "~/components/primitives/ClientTabs";
import { Paragraph } from "~/components/primitives/Paragraph";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/primitives/Resizable";
import { cn } from "~/utils/cn";
import type { StudioV2SourceWorkspaceProps } from "./StudioV2SourceWorkspace";
import {
  isWorkflowSourceFileReadOnly,
  mergeWorkflowSourceCodes,
  normalizeWorkflowSourceWorkspace,
  normalizeWorkflowSourcePath,
  resolveWorkflowSourceActiveFile,
  workflowSourceWorkspaceSignature,
} from "./workspace-model";

const FLOWCORDIA_SANDPACK_THEMES = {
  dark: {
    colors: {
      surface1: "#121317",
      surface2: "#181a20",
      surface3: "#21252b",
      disabled: "#596273",
      base: "#abb2bf",
      clickable: "#c9ced8",
      hover: "#ffffff",
      accent: "#9b99ff",
      error: "#e06c75",
      errorSurface: "#2a171b",
      warning: "#e5c07b",
      warningSurface: "#2a2417",
    },
    syntax: {
      plain: "#abb2bf",
      comment: "#7d8799",
      keyword: "#c678dd",
      definition: "#61afef",
      punctuation: "#abb2bf",
      property: "#9b99ff",
      tag: "#e06c75",
      static: "#d19a66",
      string: "#afec73",
    },
    font: {
      body: "Inter, ui-sans-serif, system-ui, sans-serif",
      mono: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
      size: "13px",
      lineHeight: "1.6",
    },
  },
  light: {
    colors: {
      surface1: "#ffffff",
      surface2: "#fafafa",
      surface3: "#f1f1f1",
      disabled: "#a3a3a3",
      base: "#404040",
      clickable: "#262626",
      hover: "#171717",
      accent: "#6366f1",
      error: "#be123c",
      errorSurface: "#fff1f2",
      warning: "#a16207",
      warningSurface: "#fefce8",
    },
    syntax: {
      plain: "#404040",
      comment: "#737373",
      keyword: "#7e22ce",
      definition: "#0369a1",
      punctuation: "#525252",
      property: "#4f46e5",
      tag: "#be123c",
      static: "#b45309",
      string: "#3f6212",
    },
    font: {
      body: "Inter, ui-sans-serif, system-ui, sans-serif",
      mono: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
      size: "13px",
      lineHeight: "1.6",
    },
  },
};

function useFlowcordiaColorScheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const explicitDark =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark");
      const explicitLight =
        document.documentElement.classList.contains("light") ||
        document.body.classList.contains("light");
      setTheme(explicitDark || (!explicitLight && media.matches) ? "dark" : "light");
    };

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    media.addEventListener("change", update);
    update();

    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);

  return theme;
}

function sourceFileName(path: string | undefined): string {
  if (!path) return "No file";
  return path.split("/").filter(Boolean).at(-1) ?? path;
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

function SourceLowerPanel({
  output,
  logs,
  problems,
}: Pick<StudioV2SourceWorkspaceProps, "output" | "logs" | "problems">) {
  return (
    <ClientTabs defaultValue="problems" className="grid h-full min-h-0 grid-rows-[auto_1fr]">
      <ClientTabsList
        variant="underline"
        className="h-9 shrink-0 overflow-hidden border-b border-grid-dimmed bg-background px-3"
        aria-label="Source results"
      >
        <ClientTabsTrigger value="problems" variant="underline">
          Problems{problems?.length ? ` (${problems.length})` : ""}
        </ClientTabsTrigger>
        <ClientTabsTrigger value="output" variant="underline">
          Output
        </ClientTabsTrigger>
        <ClientTabsTrigger value="logs" variant="underline">
          Logs
        </ClientTabsTrigger>
        <ClientTabsTrigger value="terminal" variant="underline">
          Terminal
        </ClientTabsTrigger>
      </ClientTabsList>

      <ClientTabsContent value="problems" className="m-0 min-h-0 overflow-auto p-3">
        {problems?.length ? (
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
              </div>
            ))}
          </div>
        ) : (
          <Paragraph variant="extra-small/dimmed">No problems.</Paragraph>
        )}
      </ClientTabsContent>

      <ClientTabsContent value="output" className="m-0 min-h-0 overflow-auto p-3">
        {output === undefined ? (
          <Paragraph variant="extra-small/dimmed">No output yet.</Paragraph>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text-bright">
            {stringifyOutput(output)}
          </pre>
        )}
      </ClientTabsContent>

      <ClientTabsContent value="logs" className="m-0 min-h-0 overflow-auto p-3">
        {logs?.length ? (
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
        )}
      </ClientTabsContent>

      <ClientTabsContent value="terminal" className="m-0 min-h-0 overflow-auto p-3">
        <Paragraph variant="extra-small/dimmed">
          Terminal becomes available when a Source execution workspace is attached.
        </Paragraph>
      </ClientTabsContent>
    </ClientTabs>
  );
}

function SandpackWorkspaceAdapter({
  workspace,
  readOnly = false,
  onWorkspaceChange,
  onTest,
  testStatus = "idle",
  output,
  logs,
  problems,
}: StudioV2SourceWorkspaceProps) {
  const { sandpack } = useSandpack();
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const baselineSignature = useMemo(() => workflowSourceWorkspaceSignature(workspace), [workspace]);
  const lastEmittedSignatureRef = useRef(baselineSignature);

  useEffect(() => {
    lastEmittedSignatureRef.current = baselineSignature;
  }, [baselineSignature]);

  useEffect(() => {
    setMobileFilesOpen(false);
  }, [sandpack.activeFile]);

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
  const dirty = currentSignature !== baselineSignature;

  useEffect(() => {
    if (readOnly || !onWorkspaceChange || currentSignature === lastEmittedSignatureRef.current) {
      return;
    }

    lastEmittedSignatureRef.current = currentSignature;
    onWorkspaceChange(currentWorkspace);
  }, [currentSignature, currentWorkspace, onWorkspaceChange, readOnly]);

  const activePath = normalizeWorkflowSourcePath(sandpack.activeFile || workspace.entrypoint);
  const activeFile = sandpack.files[activePath];
  const activeReadOnly = isWorkflowSourceFileReadOnly(workspace, activePath, readOnly);
  const testing = testStatus === "queued" || testStatus === "running";
  const editorExtensions = useMemo(() => sourceEditorExtensions(activePath), [activePath]);

  return (
    <section
      aria-label="Workflow source editor"
      data-testid="flowcordia-source-workspace"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-grid-dimmed bg-background px-3">
        <Button
          type="button"
          variant="minimal/small"
          className="sm:hidden"
          aria-controls="studio-v2-source-files"
          aria-expanded={mobileFilesOpen}
          onClick={() => setMobileFilesOpen((open) => !open)}
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

      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        <ResizablePanel
          id="flowcordia-source-editor"
          min="220px"
          default="78%"
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <div className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background">
            <SandpackFileExplorer
              id="studio-v2-source-files"
              autoHiddenFiles
              aria-label="Workflow files"
              className={cn(
                "!h-full !min-h-0 !w-52 !min-w-[13rem] !max-w-[13rem] !basis-52 !grow-0 !shrink-0 !overflow-auto !rounded-none !border-0 border-r border-grid-dimmed !bg-background",
                mobileFilesOpen ? "!flex sm:!flex" : "!hidden sm:!flex"
              )}
            />
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
              {activeFile ? (
                <TextEditor
                  key={activePath}
                  className="h-full min-h-0 min-w-0 bg-background"
                  defaultValue={activeFile.code}
                  readOnly={activeReadOnly}
                  showCopyButton={false}
                  extensions={editorExtensions}
                  onChange={(code) => {
                    if (!activeReadOnly) {
                      sandpack.updateFile(activePath, code);
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
        </ResizablePanel>
        <ResizableHandle
          id="flowcordia-source-output-handle"
          aria-label="Resize source results panel"
        />
        <ResizablePanel
          id="flowcordia-source-output"
          min="96px"
          default="160px"
          className="min-h-0 min-w-0 overflow-hidden bg-background"
        >
          <SourceLowerPanel output={output} logs={logs} problems={problems} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  );
}

export function StudioV2SourceWorkspaceClient(props: StudioV2SourceWorkspaceProps) {
  const normalizedWorkspace = useMemo(
    () => normalizeWorkflowSourceWorkspace(props.workspace),
    [props.workspace]
  );
  const resolvedActiveFile = resolveWorkflowSourceActiveFile(normalizedWorkspace);
  const colorScheme = useFlowcordiaColorScheme();
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
    <SandpackProvider
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
      theme={FLOWCORDIA_SANDPACK_THEMES[colorScheme]}
    >
      <SandpackWorkspaceAdapter {...props} workspace={normalizedWorkspace} />
    </SandpackProvider>
  );
}
