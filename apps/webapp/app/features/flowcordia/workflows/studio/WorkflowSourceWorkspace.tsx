import { javascript } from "@codemirror/lang-javascript";
import type { JsonObject } from "@flowcordia/workflow";
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "@remix-run/react";
import CodeMirror from "@uiw/react-codemirror";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  Code2Icon,
  FileCode2Icon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  LockIcon,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/primitives/Dialog";
import { cn } from "~/utils/cn";
import type {
  WorkflowStudioDraft,
  WorkflowStudioDiff,
  WorkflowStudioGraph,
  WorkflowStudioNode,
} from "./presentation";
import { isSourceEditorSaveShortcut, sourceEditorSelectionDecision } from "./source-editor-safety";
import type { WorkflowStudioSourceBuffer } from "./source-presentation";

interface SourceCommandResponse {
  ok: boolean;
  status?:
    | "started"
    | "resumed"
    | "source_started"
    | "source_resumed"
    | "source_saved"
    | "source_reset"
    | "published";
  draft?: {
    publicId: string;
    version: string;
    documentSha256: string;
    stale: boolean;
  };
  source?: {
    publicId: string;
    functionId: string;
    sourcePath: string;
    exportName: string;
    sourceText: string;
    sourceSha256: string;
    baseSourceSha256: string;
    version: string;
    changed: boolean;
    updatedAt: string;
  };
  proposal?: {
    proposalId: string;
    state: string;
    pullRequestNumber: number | null;
    headSha: string | null;
    sourcePatchCount: number;
    sourceDigest?: string;
    preview: {
      state: "READY" | "DISABLED" | "UNAVAILABLE";
      branchName?: string;
      message?: string;
    };
  };
  error?: string;
  message?: string;
  retryable?: boolean;
}

function normalizeSourcePath(path: string | undefined): string {
  return path?.replace(/^\.\//, "") ?? "";
}

function sourceBufferForNode(
  sourceBuffers: WorkflowStudioSourceBuffer[],
  node: WorkflowStudioNode | null
): WorkflowStudioSourceBuffer | null {
  const sourcePath = normalizeSourcePath(node?.codeReference?.path);
  if (!sourcePath) return null;
  return (
    sourceBuffers.find((source) => normalizeSourcePath(source.sourcePath) === sourcePath) ?? null
  );
}

function workflowChangeCount(diff: WorkflowStudioDiff | null): number {
  if (!diff) return 0;
  return (
    diff.nodes.added.length +
    diff.nodes.modified.length +
    diff.nodes.removed.length +
    diff.edges.added.length +
    diff.edges.modified.length +
    diff.edges.removed.length +
    (diff.detailsChanged ? 1 : 0)
  );
}

export function WorkflowSourceWorkspace({
  workflowId,
  graph,
  draft,
  diff,
  sourceBuffers,
  commandPath,
  workflowsPath,
  proposalPath,
  canWrite,
  stale,
  loadError,
}: {
  workflowId: string | null;
  graph: WorkflowStudioGraph | null;
  draft: WorkflowStudioDraft | null;
  diff: WorkflowStudioDiff | null;
  sourceBuffers: WorkflowStudioSourceBuffer[];
  commandPath: string;
  workflowsPath: string;
  proposalPath: string;
  canWrite: boolean;
  stale: boolean;
  loadError: { code: string; message: string; retryable: boolean } | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<SourceCommandResponse>();
  const revalidator = useRevalidator();
  const submitted = useRef(false);
  const pendingOpenNodeId = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);
  const sourceNodes = useMemo(
    () =>
      (graph?.nodes ?? []).filter(
        (node) =>
          node.operation === "code.task" &&
          node.ownership === "developer" &&
          Boolean(node.functionId && node.codeReference)
      ),
    [graph?.nodes]
  );
  const requestedNodeId = searchParams.get("node");
  const selectedNode =
    sourceNodes.find((node) => node.id === requestedNodeId) ?? sourceNodes[0] ?? null;
  const selectedBuffer = sourceBufferForNode(sourceBuffers, selectedNode);
  const [openedSource, setOpenedSource] = useState<SourceCommandResponse["source"] | null>(null);
  const [editorText, setEditorText] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [lastProposal, setLastProposal] = useState<SourceCommandResponse["proposal"] | null>(null);
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);
  const editorExtensions = useMemo(() => {
    const path = openedSource?.sourcePath ?? selectedNode?.codeReference?.path ?? "";
    return [
      javascript({
        typescript: /\.tsx?$/.test(path),
        jsx: /\.[jt]sx$/.test(path),
      }),
    ];
  }, [openedSource?.sourcePath, selectedNode?.codeReference?.path]);
  const busy = fetcher.state !== "idle";
  const editable = Boolean(canWrite && draft && !draft.stale && !stale && !loadError);
  const editorDirty = Boolean(openedSource && editorText !== openedSource.sourceText);
  const changedSources = sourceBuffers.filter((source) => source.changed);
  const changedSourceCount = changedSources.length;
  const workflowChanges = workflowChangeCount(diff);
  const filteredSourceNodes = useMemo(() => {
    const query = sourceQuery.trim().toLowerCase();
    if (!query) return sourceNodes;
    return sourceNodes.filter((node) =>
      [node.name, node.id, node.codeReference?.path, node.codeReference?.exportName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [sourceNodes, sourceQuery]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowNavigationRef.current) {
      allowNavigationRef.current = false;
      return false;
    }
    return (
      editorDirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search)
    );
  });
  const pendingNode = sourceNodes.find((node) => node.id === pendingNodeId) ?? null;
  const guardOpen = Boolean(pendingNodeId || blocker.state === "blocked");

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!editorDirty) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [editorDirty]
    )
  );

  useEffect(() => {
    if (!selectedNode && requestedNodeId) {
      const next = new URLSearchParams(searchParams);
      next.delete("node");
      setSearchParams(next, { replace: true });
    }
  }, [requestedNodeId, searchParams, selectedNode, setSearchParams]);

  useEffect(() => {
    setOpenedSource(null);
    setEditorText("");
  }, [selectedNode?.id]);

  useEffect(() => {
    if (!submitted.current || fetcher.state !== "idle") return;
    submitted.current = false;
    if (fetcher.data?.source) {
      setOpenedSource({ ...fetcher.data.source });
      setEditorText(fetcher.data.source.sourceText);
    }
    if (fetcher.data?.proposal) setLastProposal({ ...fetcher.data.proposal });
    revalidator.revalidate();
  }, [fetcher.data, fetcher.state, revalidator]);

  useEffect(() => {
    const nodeId = pendingOpenNodeId.current;
    if (!nodeId || !draft || busy) return;
    pendingOpenNodeId.current = null;
    submitted.current = true;
    fetcher.submit(
      { operation: "start_source", draftId: draft.publicId, nodeId },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
  }, [busy, commandPath, draft, fetcher]);

  const submit = (payload: JsonObject) => {
    if (!canWrite || busy) return;
    submitted.current = true;
    fetcher.submit(payload, {
      method: "POST",
      action: commandPath,
      encType: "application/json",
    });
  };

  const commitNodeSelection = (nodeId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("node", nodeId);
    setSearchParams(next, { replace: true });
  };

  const selectNode = (node: WorkflowStudioNode) => {
    if (busy) return;
    const decision = sourceEditorSelectionDecision({
      currentNodeId: selectedNode?.id ?? null,
      nextNodeId: node.id,
      dirty: editorDirty,
    });
    if (decision === "noop") return;
    if (decision === "confirm") {
      setPendingNodeId(node.id);
      return;
    }
    commitNodeSelection(node.id);
  };

  const openSource = () => {
    if (!selectedNode || !workflowId || !canWrite || busy) return;
    if (!draft) {
      pendingOpenNodeId.current = selectedNode.id;
      submit({ operation: "start", workflowId });
      return;
    }
    submit({ operation: "start_source", draftId: draft.publicId, nodeId: selectedNode.id });
  };

  const saveSource = () => {
    if (!openedSource || !editable || !editorDirty || busy) return;
    submit({
      operation: "edit_source",
      sourceId: openedSource.publicId,
      expectedVersion: openedSource.version,
      sourceText: editorText,
    });
  };

  const resetSource = () => {
    if (!openedSource || !editable) return;
    submit({
      operation: "reset_source",
      sourceId: openedSource.publicId,
      expectedVersion: openedSource.version,
    });
  };

  const publish = () => {
    if (!draft || !editable || editorDirty) return;
    submit({
      operation: "publish",
      draftId: draft.publicId,
      expectedVersion: draft.version,
      expectedSources: changedSources.map((source) => ({
        publicId: source.publicId,
        version: source.version,
        sourceSha256: source.sourceSha256,
      })),
    });
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      !isSourceEditorSaveShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    saveSource();
  };

  const cancelGuard = () => {
    setPendingNodeId(null);
    if (blocker.state === "blocked") blocker.reset();
  };

  const discardAndContinue = () => {
    if (pendingNodeId) {
      const nextNodeId = pendingNodeId;
      setPendingNodeId(null);
      setOpenedSource(null);
      setEditorText("");
      allowNavigationRef.current = true;
      commitNodeSelection(nextNodeId);
      queueMicrotask(() => {
        allowNavigationRef.current = false;
      });
      return;
    }
    if (blocker.state === "blocked") blocker.proceed();
  };

  return (
    <>
      <section
        className="flex min-h-[620px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#2b2b31] bg-[#101012] shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
        data-testid="flowcordia-source-workspace"
      >
        <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-[#29292f] bg-[#141416] px-3.5 py-2.5 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-indigo-400/25 bg-indigo-500/10 text-indigo-300">
              <Code2Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xxs font-semibold uppercase tracking-[0.12em] text-text-dimmed">
                  Source workbench
                </span>
                {draft && <Badge variant="small">Draft {draft.version}</Badge>}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-text-bright">
                {graph?.name ?? workflowId ?? "Repository workflow"}
              </div>
            </div>
          </div>

          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xxs font-medium",
              loadError
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : stale || draft?.stale
                  ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                  : busy && openedSource
                    ? "border-indigo-400/30 bg-indigo-400/10 text-indigo-200"
                    : editorDirty
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                      : openedSource?.changed || selectedBuffer?.changed
                        ? "border-blue-400/30 bg-blue-400/10 text-blue-200"
                        : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
            )}
          >
            {loadError || stale || draft?.stale || editorDirty || openedSource?.changed ? (
              <AlertTriangleIcon className="size-3.5" />
            ) : (
              <CheckCircle2Icon className="size-3.5" />
            )}
            {loadError
              ? "Unavailable"
              : stale || draft?.stale
                ? "Repository moved"
                : busy && openedSource
                  ? "Saving source"
                  : editorDirty
                    ? "Unsaved browser text"
                    : openedSource?.changed || selectedBuffer?.changed
                      ? "Durable source changes"
                      : "Exact base"}
          </div>

          <Link
            to={workflowsPath}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#34343b] bg-[#19191c] px-2.5 text-xxs font-medium text-text-dimmed transition hover:border-[#4a4a55] hover:text-text-bright"
          >
            <ArrowLeftIcon className="size-3.5" />
            Studio
          </Link>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_292px]">
          <aside className="min-h-0 border-b border-[#29292f] bg-[#141416] lg:border-b-0 lg:border-r">
            <div className="border-b border-[#29292f] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-text-bright">Repository functions</div>
                  <div className="mt-0.5 text-xxs text-text-dimmed">Exact indexed code nodes</div>
                </div>
                <Badge variant="small">{sourceNodes.length}</Badge>
              </div>
              <label className="mt-3 flex h-8 items-center gap-2 rounded-md border border-[#303037] bg-[#101012] px-2.5 text-text-dimmed transition focus-within:border-indigo-400/60 focus-within:ring-2 focus-within:ring-indigo-500/10">
                <SearchIcon className="size-3.5 shrink-0" />
                <input
                  value={sourceQuery}
                  onChange={(event) => setSourceQuery(event.target.value)}
                  placeholder="Search functions"
                  className="min-w-0 flex-1 border-0 bg-transparent text-xs text-text-bright outline-none placeholder:text-text-dimmed"
                  aria-label="Search repository functions"
                />
              </label>
            </div>

            <div className="max-h-72 space-y-1.5 overflow-y-auto p-2.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600 lg:max-h-none lg:h-[548px]">
              {filteredSourceNodes.map((node) => {
                const buffer = sourceBufferForNode(sourceBuffers, node);
                const active = selectedNode?.id === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    disabled={busy}
                    onClick={() => selectNode(node)}
                    className={cn(
                      "group w-full rounded-lg border p-2.5 text-left transition disabled:cursor-wait disabled:opacity-60",
                      active
                        ? "border-indigo-400/45 bg-indigo-500/10 shadow-[inset_2px_0_0_#818cf8]"
                        : "border-transparent bg-transparent hover:border-[#303037] hover:bg-[#19191c]"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border",
                          active
                            ? "border-indigo-400/25 bg-indigo-500/10 text-indigo-300"
                            : "border-[#34343b] bg-[#19191c] text-text-dimmed group-hover:text-text-bright"
                        )}
                      >
                        <FileCode2Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-text-bright">
                          {node.name}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] text-text-dimmed">
                          {node.codeReference?.path}
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px]",
                              buffer?.changed
                                ? "text-amber-300"
                                : buffer
                                  ? "text-emerald-300"
                                  : "text-text-dimmed"
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                buffer?.changed
                                  ? "bg-amber-300"
                                  : buffer
                                    ? "bg-emerald-300"
                                    : "bg-zinc-600"
                              )}
                            />
                            {buffer?.changed ? "Changed" : buffer ? "Opened" : "Not opened"}
                          </span>
                          <span className="truncate font-mono text-[9px] text-zinc-600">
                            {node.codeReference?.exportName}
                          </span>
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}

              {filteredSourceNodes.length === 0 && (
                <div className="rounded-lg border border-dashed border-[#34343b] px-3 py-8 text-center">
                  <SearchIcon className="mx-auto size-5 text-zinc-600" />
                  <div className="mt-2 text-xs font-medium text-text-bright">
                    No functions found
                  </div>
                  <div className="mt-1 text-xxs text-text-dimmed">
                    Try another name or source path.
                  </div>
                </div>
              )}
            </div>
          </aside>

          <main className="flex min-h-[560px] min-w-0 flex-col bg-[#0f0f11]">
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-[#29292f] bg-[#141416] px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md border border-[#34343b] bg-[#19191c] text-text-dimmed">
                  <FileCode2Icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs text-text-bright">
                    {openedSource?.sourcePath ??
                      selectedNode?.codeReference?.path ??
                      "Select a repository function"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 truncate text-[10px] text-text-dimmed">
                    <span>
                      {openedSource?.exportName ?? selectedNode?.codeReference?.exportName}
                    </span>
                    {openedSource && (
                      <>
                        <span className="text-zinc-700">•</span>
                        <span>buffer v{openedSource.version}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {!openedSource && selectedNode && (
                  <Button
                    variant="secondary/small"
                    LeadingIcon={Code2Icon}
                    disabled={!canWrite || busy || stale || Boolean(loadError)}
                    onClick={openSource}
                  >
                    Open exact source
                  </Button>
                )}
                {openedSource && (
                  <>
                    <Button
                      variant="minimal/small"
                      LeadingIcon={RotateCcwIcon}
                      disabled={!editable || busy || !openedSource.changed}
                      onClick={resetSource}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="primary/small"
                      LeadingIcon={SaveIcon}
                      disabled={!editable || busy || !editorDirty}
                      onClick={saveSource}
                    >
                      Save buffer
                    </Button>
                  </>
                )}
              </div>
            </div>

            {loadError ? (
              <div className="m-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangleIcon className="size-4" />
                  Source workspace unavailable
                </div>
                <p className="mt-2 text-xs leading-5 text-rose-200/80">{loadError.message}</p>
              </div>
            ) : stale || draft?.stale ? (
              <div className="m-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
                <div className="flex items-center gap-2 font-medium">
                  <GitCommitIcon className="size-4" />
                  The repository revision moved
                </div>
                <p className="mt-2 text-xs leading-5 text-yellow-100/75">
                  Inspect the draft, then restart from the latest commit before editing or
                  publishing. Flowcordia will not silently rebase source buffers.
                </p>
              </div>
            ) : openedSource ? (
              <div
                className="min-h-[500px] flex-1 p-2.5 sm:p-3"
                onKeyDownCapture={handleEditorKeyDown}
              >
                <CodeMirror
                  value={editorText}
                  height="100%"
                  extensions={editorExtensions}
                  editable={editable && !busy}
                  readOnly={!editable || busy}
                  theme="dark"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                    highlightActiveLineGutter: true,
                    bracketMatching: true,
                    autocompletion: true,
                    closeBrackets: true,
                    searchKeymap: true,
                  }}
                  onChange={setEditorText}
                  aria-label={`Source for ${openedSource.sourcePath}`}
                  className="h-full min-h-[500px] overflow-hidden rounded-lg border border-[#2f2f36] bg-[#111113] text-xs shadow-inner [&_.cm-activeLine]:bg-indigo-500/[0.06] [&_.cm-activeLineGutter]:bg-indigo-500/[0.08] [&_.cm-editor]:h-full [&_.cm-editor.cm-focused]:outline-none [&_.cm-gutters]:border-[#29292f] [&_.cm-gutters]:bg-[#111113] [&_.cm-scroller]:font-mono"
                />
              </div>
            ) : (
              <div className="flex min-h-[500px] flex-1 items-center justify-center p-8 text-center">
                <div className="max-w-md rounded-xl border border-dashed border-[#34343b] bg-[#141416] px-7 py-9">
                  <span className="mx-auto grid size-11 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                    <FileCode2Icon className="size-5" />
                  </span>
                  <div className="mt-4 text-sm font-semibold text-text-bright">
                    Open a reviewed repository function
                  </div>
                  <p className="mt-2 text-xs leading-5 text-text-dimmed">
                    Flowcordia reads the file at the draft&apos;s exact Git commit and keeps edits
                    in a durable buffer. Structural Preview never executes this source.
                  </p>
                  {selectedNode && (
                    <Button
                      className="mt-4"
                      variant="secondary/small"
                      LeadingIcon={Code2Icon}
                      disabled={!canWrite || busy}
                      onClick={openSource}
                    >
                      Open exact source
                    </Button>
                  )}
                </div>
              </div>
            )}

            <footer className="flex min-h-8 flex-wrap items-center justify-between gap-2 border-t border-[#29292f] bg-[#141416] px-3 py-1.5 font-mono text-[10px] text-text-dimmed sm:px-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <GitBranchIcon className="size-3" />
                  exact repository base
                </span>
                {openedSource && (
                  <span className="inline-flex items-center gap-1.5">
                    <GitCommitIcon className="size-3" />
                    {openedSource.baseSourceSha256.slice(0, 12)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span>{editable ? "Editable draft" : "Read only"}</span>
                {busy && openedSource ? (
                  <span className="text-indigo-300">Saving</span>
                ) : editorDirty ? (
                  <span className="text-amber-300">Unsaved</span>
                ) : openedSource ? (
                  <span className="text-emerald-300">Saved</span>
                ) : null}
              </div>
            </footer>
          </main>

          <aside className="border-t border-[#29292f] bg-[#141416] lg:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
            <div className="border-b border-[#29292f] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xxs font-semibold uppercase tracking-[0.12em] text-text-dimmed">
                    Review package
                  </div>
                  <div className="mt-1 text-xs font-semibold text-text-bright">
                    Combined proposal
                  </div>
                </div>
                <span className="grid size-8 place-items-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                  <GitPullRequestIcon className="size-4" />
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#303037] bg-[#19191c] p-3">
                  <div className="text-[10px] text-text-dimmed">Workflow changes</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-text-bright">
                    {workflowChanges}
                  </div>
                </div>
                <div className="rounded-lg border border-[#303037] bg-[#19191c] p-3">
                  <div className="text-[10px] text-text-dimmed">Source files</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-text-bright">
                    {changedSourceCount}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-3.5">
              <div className="rounded-lg border border-[#303037] bg-[#19191c] p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-text-bright">
                  <ShieldCheckIcon className="size-4 text-indigo-300" />
                  Repository boundary
                </div>
                <p className="mt-2 text-xxs leading-4 text-text-dimmed">
                  Browser text is never published directly. Save a durable buffer first; Flowcordia
                  then creates one reviewed proposal against the exact base revision.
                </p>
              </div>

              {openedSource && (
                <div className="rounded-lg border border-[#303037] bg-[#19191c] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xxs font-medium text-text-dimmed">Current buffer</div>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px]",
                        openedSource.changed
                          ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                      )}
                    >
                      {openedSource.changed ? "Changed" : "Exact base"}
                    </span>
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-text-bright">
                    {openedSource.sourceSha256.slice(0, 16)}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xxs text-text-dimmed">
                    <LockIcon className="size-3.5" />
                    Durable source buffer
                  </div>
                </div>
              )}

              {fetcher.data && !fetcher.data.ok && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-5 text-rose-100">
                  {fetcher.data.message ?? "The source operation failed safely."}
                </div>
              )}
              {editorDirty && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                  Save this buffer before publishing. Unsaved browser text is never sent to GitHub.
                </div>
              )}

              <Button
                className="w-full justify-center"
                variant="primary/small"
                disabled={
                  !editable ||
                  busy ||
                  editorDirty ||
                  (workflowChanges === 0 && changedSourceCount === 0)
                }
                onClick={publish}
              >
                <GitPullRequestIcon className="mr-1.5 size-4" />
                Publish reviewed proposal
              </Button>

              {lastProposal && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2Icon className="size-4" />
                    Proposal created
                  </div>
                  <div className="mt-2 font-mono">{lastProposal.proposalId}</div>
                  <div className="mt-1 text-emerald-100/75">
                    {lastProposal.sourcePatchCount} source file changes
                  </div>
                  <Link
                    to={proposalPath}
                    className="mt-2 inline-block underline underline-offset-2"
                  >
                    Open proposal workspace
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
      <Dialog
        open={guardOpen}
        onOpenChange={(open) => {
          if (!open) cancelGuard();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved source changes?</DialogTitle>
            <DialogDescription>
              {pendingNode
                ? `Switching to ${pendingNode.name} will discard the browser-only text in this editor.`
                : "Leaving this source workspace will discard the browser-only text in this editor."}{" "}
              Unsaved browser text is never sent to GitHub.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary/small" onClick={cancelGuard}>
              Keep editing
            </Button>
            <Button variant="danger/small" onClick={discardAndContinue}>
              Discard and continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
