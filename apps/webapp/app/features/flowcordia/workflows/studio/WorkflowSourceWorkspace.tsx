import { javascript } from "@codemirror/lang-javascript";
import type { JsonObject } from "@flowcordia/workflow";
import { Link, useFetcher, useRevalidator, useSearchParams } from "@remix-run/react";
import CodeMirror from "@uiw/react-codemirror";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Code2Icon,
  FileCode2Icon,
  GitPullRequestIcon,
  RotateCcwIcon,
  SaveIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import type {
  WorkflowStudioDraft,
  WorkflowStudioDiff,
  WorkflowStudioGraph,
  WorkflowStudioNode,
} from "./presentation";
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
  const [lastProposal, setLastProposal] = useState<SourceCommandResponse["proposal"] | null>(null);
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

  const selectNode = (node: WorkflowStudioNode) => {
    const next = new URLSearchParams(searchParams);
    next.set("node", node.id);
    setSearchParams(next, { replace: true });
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
    if (!openedSource || !editable || !editorDirty) return;
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

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_300px] overflow-hidden rounded-lg border border-grid-bright bg-background-bright">
      <aside className="overflow-y-auto border-r border-grid-bright bg-background-dimmed p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-text-bright">Repository functions</div>
            <div className="mt-0.5 text-xxs text-text-dimmed">Existing typed-function nodes only</div>
          </div>
          <Badge variant="small">{sourceNodes.length}</Badge>
        </div>
        <div className="space-y-1.5">
          {sourceNodes.map((node) => {
            const buffer = sourceBufferForNode(sourceBuffers, node);
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => selectNode(node)}
                className={cn(
                  "w-full rounded border px-3 py-2 text-left transition",
                  selectedNode?.id === node.id
                    ? "border-indigo-400/50 bg-indigo-500/10"
                    : "border-grid-dimmed bg-background-bright hover:border-grid-bright"
                )}
              >
                <div className="truncate text-xs font-medium text-text-bright">{node.name}</div>
                <div className="mt-1 truncate font-mono text-xxs text-text-dimmed">
                  {node.codeReference?.path}
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xxs">
                  {buffer?.changed ? (
                    <span className="text-yellow-300">Changed</span>
                  ) : buffer ? (
                    <span className="text-emerald-300">Opened</span>
                  ) : (
                    <span className="text-text-dimmed">Not opened</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="min-w-0 bg-charcoal-950">
        <div className="flex h-12 items-center justify-between border-b border-grid-bright bg-background-bright px-4">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-text-bright">
              {selectedNode?.codeReference?.path ?? "Select a repository function"}
            </div>
            <div className="mt-0.5 truncate font-mono text-xxs text-text-dimmed">
              {selectedNode?.codeReference?.exportName ?? "No source selected"}
            </div>
          </div>
          <div className="flex items-center gap-2">
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
          <div className="m-5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangleIcon className="size-4" />
              Source workspace unavailable
            </div>
            <p className="mt-2 text-xs leading-5 text-rose-200/80">{loadError.message}</p>
          </div>
        ) : stale || draft?.stale ? (
          <div className="m-5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
            Repository source changed after this workspace was loaded. Inspect the draft, then
            restart from the latest commit before editing or publishing.
          </div>
        ) : openedSource ? (
          <div className="h-[616px] p-4">
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
              className="h-full overflow-hidden rounded-md border border-grid-bright bg-charcoal-900 text-xs [&_.cm-editor]:h-full [&_.cm-editor.cm-focused]:outline-none [&_.cm-gutters]:border-grid-bright [&_.cm-scroller]:font-mono"
            />
          </div>
        ) : (
          <div className="flex h-[616px] items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <FileCode2Icon className="mx-auto size-10 text-violet-300" />
              <div className="mt-4 text-sm font-medium text-text-bright">
                Open a reviewed repository function
              </div>
              <p className="mt-2 text-xs leading-5 text-text-dimmed">
                Flowcordia reads the file at the workflow draft&apos;s exact Git commit and keeps
                edits in a durable buffer. Structural Preview still does not execute this source.
              </p>
            </div>
          </div>
        )}
      </main>

      <aside className="border-l border-grid-bright bg-background-bright p-4">
        <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
          Combined proposal
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded border border-grid-dimmed bg-background-dimmed p-3">
            <div className="text-xxs text-text-dimmed">Workflow</div>
            <div className="mt-1 text-lg font-semibold text-text-bright">{workflowChanges}</div>
          </div>
          <div className="rounded border border-grid-dimmed bg-background-dimmed p-3">
            <div className="text-xxs text-text-dimmed">Source files</div>
            <div className="mt-1 text-lg font-semibold text-text-bright">{changedSourceCount}</div>
          </div>
        </div>

        {openedSource && (
          <div className="mt-4 space-y-3 rounded border border-grid-dimmed bg-background-dimmed p-3">
            <div>
              <div className="text-xxs text-text-dimmed">Current buffer</div>
              <div className="mt-1 break-all font-mono text-xs text-text-bright">
                {openedSource.sourceSha256.slice(0, 16)}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {openedSource.changed ? (
                <>
                  <AlertTriangleIcon className="size-4 text-yellow-300" />
                  <span className="text-yellow-200">Changed from exact base</span>
                </>
              ) : (
                <>
                  <CheckCircle2Icon className="size-4 text-emerald-300" />
                  <span className="text-emerald-200">Matches exact base</span>
                </>
              )}
            </div>
          </div>
        )}

        {fetcher.data && !fetcher.data.ok && (
          <div className="mt-4 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-5 text-rose-100">
            {fetcher.data.message ?? "The source operation failed safely."}
          </div>
        )}
        {editorDirty && (
          <div className="mt-4 rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs leading-5 text-yellow-100">
            Save this buffer before publishing. Unsaved browser text is never sent to GitHub.
          </div>
        )}

        <Button
          className="mt-4 w-full justify-center"
          variant="primary/small"
          disabled={
            !editable || busy || editorDirty || (workflowChanges === 0 && changedSourceCount === 0)
          }
          onClick={publish}
        >
          <GitPullRequestIcon className="mr-1.5 size-4" />
          Publish reviewed proposal
        </Button>

        {lastProposal && (
          <div className="mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100">
            <div className="font-medium">Proposal created</div>
            <div className="mt-1 font-mono">{lastProposal.proposalId}</div>
            <div className="mt-1">{lastProposal.sourcePatchCount} source file changes</div>
            <Link to={proposalPath} className="mt-2 inline-block underline underline-offset-2">
              Open proposal workspace
            </Link>
          </div>
        )}

        <div className="mt-5 border-t border-grid-dimmed pt-4">
          <Link
            to={workflowsPath}
            className="text-xs text-indigo-300 underline decoration-indigo-400/50 underline-offset-4 hover:text-indigo-200"
          >
            Return to workflow Studio
          </Link>
        </div>
      </aside>
    </div>
  );
}
