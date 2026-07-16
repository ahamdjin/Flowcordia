import { Link, useFetcher, useRevalidator, useSearchParams } from "@remix-run/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  GitBranchIcon,
  GitCommitIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/primitives/Resizable";
import { cn } from "~/utils/cn";
import type {
  WorkflowStudioGraph,
  WorkflowStudioListItem,
  WorkflowStudioNode,
  WorkflowStudioSyncStatus,
} from "./presentation";

interface SyncResponse {
  ok: boolean;
  status?: string;
  commitSha?: string;
  entryCount?: number;
  validCount?: number;
  invalidCount?: number;
  error?: string;
  message?: string;
  retryable?: boolean;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 112;
const CANVAS_PADDING = 80;

function shortSha(value: string | null): string {
  return value ? value.slice(0, 8) : "Not observed";
}

function selectedHref(basePath: string, current: URLSearchParams, workflowId: string): string {
  const next = new URLSearchParams(current);
  next.set("workflow", workflowId);
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function syncTone(state: WorkflowStudioSyncStatus["state"]): string {
  switch (state) {
    case "IDLE":
      return "border-green-500/35 bg-green-500/10 text-green-300";
    case "RUNNING":
    case "PENDING":
      return "border-blue-500/35 bg-blue-500/10 text-blue-300";
    case "FAILED":
      return "border-rose-500/35 bg-rose-500/10 text-rose-300";
    case "NOT_INDEXED":
      return "border-yellow-500/35 bg-yellow-500/10 text-yellow-300";
  }
}

function nodeTone(kind: WorkflowStudioNode["kind"]): string {
  switch (kind) {
    case "trigger":
      return "border-emerald-500/40 bg-emerald-500/10";
    case "action":
      return "border-blue-500/40 bg-blue-500/10";
    case "control":
      return "border-yellow-500/40 bg-yellow-500/10";
    case "code":
      return "border-violet-500/40 bg-violet-500/10";
    case "subflow":
      return "border-cyan-500/40 bg-cyan-500/10";
    case "approval":
      return "border-orange-500/40 bg-orange-500/10";
    case "output":
      return "border-pink-500/40 bg-pink-500/10";
  }
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-grid-dimmed bg-background-bright px-3 py-2">
      <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">{label}</div>
      <div className="mt-1 text-lg font-semibold text-text-bright">{value}</div>
    </div>
  );
}

function WorkflowListRow({
  workflow,
  selected,
  href,
}: {
  workflow: WorkflowStudioListItem;
  selected: boolean;
  href: string;
}) {
  return (
    <Link
      to={href}
      replace
      className={cn(
        "block border-l-2 px-3 py-3 transition focus-custom",
        selected
          ? "border-l-indigo-500 bg-charcoal-750"
          : "border-l-transparent hover:bg-charcoal-800"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-bright">{workflow.name}</div>
          <div className="mt-1 truncate font-mono text-xxs text-text-dimmed">
            {workflow.workflowId}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-xxs font-medium",
            workflow.status === "VALID"
              ? "border-green-500/35 bg-green-500/10 text-green-300"
              : "border-rose-500/35 bg-rose-500/10 text-rose-300"
          )}
        >
          {workflow.status === "VALID" ? "Valid" : "Invalid"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xxs text-text-dimmed">
        <span>{workflow.nodeCount ?? 0} nodes</span>
        <span>{workflow.edgeCount ?? 0} edges</span>
        <span className="font-mono">{shortSha(workflow.sourceCommitSha)}</span>
      </div>
      {workflow.failure && (
        <div className="mt-2 line-clamp-2 text-xxs leading-4 text-rose-300">
          {workflow.failure.message}
        </div>
      )}
    </Link>
  );
}

function Canvas({
  graph,
  selectedNodeId,
  onSelectNode,
}: {
  graph: WorkflowStudioGraph;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  const layout = useMemo(() => {
    const minX = Math.min(0, ...graph.nodes.map((node) => node.position.x));
    const minY = Math.min(0, ...graph.nodes.map((node) => node.position.y));
    const offsetX = CANVAS_PADDING - minX;
    const offsetY = CANVAS_PADDING - minY;
    const nodes = new Map(
      graph.nodes.map((node) => [
        node.id,
        {
          ...node,
          canvasX: node.position.x + offsetX,
          canvasY: node.position.y + offsetY,
        },
      ])
    );
    const width = Math.max(
      960,
      ...Array.from(nodes.values()).map((node) => node.canvasX + NODE_WIDTH + CANVAS_PADDING)
    );
    const height = Math.max(
      640,
      ...Array.from(nodes.values()).map((node) => node.canvasY + NODE_HEIGHT + CANVAS_PADDING)
    );
    return { nodes, width, height };
  }, [graph]);

  return (
    <div className="h-full overflow-auto bg-background-dimmed scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600">
      <div
        className="relative"
        style={{
          width: layout.width,
          height: layout.height,
          backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.14) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={layout.width}
          height={layout.height}
        >
          <defs>
            <marker
              id="flowcordia-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" className="fill-charcoal-500" />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const source = layout.nodes.get(edge.source);
            const target = layout.nodes.get(edge.target);
            if (!source || !target) return null;
            const x1 = source.canvasX + NODE_WIDTH;
            const y1 = source.canvasY + NODE_HEIGHT / 2;
            const x2 = target.canvasX;
            const y2 = target.canvasY + NODE_HEIGHT / 2;
            const curve = Math.max(60, Math.abs(x2 - x1) / 2);
            return (
              <path
                key={edge.id}
                d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                fill="none"
                className="stroke-charcoal-500"
                strokeWidth="2"
                markerEnd="url(#flowcordia-arrow)"
              />
            );
          })}
        </svg>

        {Array.from(layout.nodes.values()).map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode(node.id)}
            className={cn(
              "absolute rounded-lg border p-3 text-left shadow-lg shadow-black/10 transition focus-custom",
              nodeTone(node.kind),
              selectedNodeId === node.id
                ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-background-dimmed"
                : "hover:border-text-dimmed"
            )}
            style={{
              left: node.canvasX,
              top: node.canvasY,
              width: NODE_WIDTH,
              minHeight: NODE_HEIGHT,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded border border-grid-bright bg-background-dimmed px-1.5 py-0.5 text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                {node.kind}
              </span>
              <span className="truncate font-mono text-xxs text-text-dimmed">{node.id}</span>
            </div>
            <div className="mt-2 truncate text-sm font-medium text-text-bright">{node.name}</div>
            <div className="mt-1 truncate font-mono text-xs text-text-dimmed">{node.operation}</div>
            <div className="mt-2 flex gap-2 text-xxs text-text-dimmed">
              <span>{node.configurationKeys.length} settings</span>
              <span>{node.credentialReferences.length} credentials</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function NodeInspector({ node }: { node: WorkflowStudioNode | null }) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <ShieldCheckIcon className="mx-auto size-8 text-indigo-400" />
          <div className="mt-3 text-sm font-medium text-text-bright">Select a node</div>
          <p className="mt-2 text-xs leading-5 text-text-dimmed">
            Studio exposes structure and references, never credential values or hidden server
            identity.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600">
      <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
        {node.kind}
      </div>
      <h3 className="mt-1 text-base font-medium text-text-bright">{node.name}</h3>
      <div className="mt-1 break-all font-mono text-xs text-text-dimmed">{node.id}</div>

      <div className="mt-5 space-y-4">
        <InspectorSection label="Operation">
          <span className="font-mono">{node.operation}</span>
        </InspectorSection>
        <InspectorSection label="Configuration keys">
          {node.configurationKeys.length > 0 ? node.configurationKeys.join(", ") : "None"}
        </InspectorSection>
        <InspectorSection label="Credential references">
          {node.credentialReferences.length > 0 ? node.credentialReferences.join(", ") : "None"}
        </InspectorSection>
        <InspectorSection label="Runtime">
          {node.runtime ? (
            <div className="space-y-1">
              <div>Queue: {node.runtime.queue ?? "Default"}</div>
              <div>Machine: {node.runtime.machine ?? "Default"}</div>
              <div>Max duration: {node.runtime.maxDurationSeconds ?? "Default"}</div>
              <div>Concurrency key: {node.runtime.concurrencyKey ?? "None"}</div>
            </div>
          ) : (
            "Default runtime policy"
          )}
        </InspectorSection>
        {node.codeReference && (
          <InspectorSection label="Code reference">
            <div className="space-y-1 font-mono">
              <div>{node.codeReference.path}</div>
              <div>{node.codeReference.exportName}</div>
              <div>{node.codeReference.commit ?? "Repository revision"}</div>
            </div>
          </InspectorSection>
        )}
      </div>
    </div>
  );
}

function InspectorSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">{label}</div>
      <div className="mt-1 break-words text-xs leading-5 text-text-bright">{children}</div>
    </div>
  );
}

export function WorkflowStudio({
  workflows,
  selectedWorkflowId,
  graph,
  sync,
  repository,
  stale,
  loadError,
  basePath,
  commandPath,
  canWrite,
}: {
  workflows: WorkflowStudioListItem[];
  selectedWorkflowId: string | null;
  graph: WorkflowStudioGraph | null;
  sync: WorkflowStudioSyncStatus;
  repository: { owner: string; name: string; branch: string };
  stale: boolean;
  loadError: { code: string; message: string; retryable: boolean } | null;
  basePath: string;
  commandPath: string;
  canWrite: boolean;
}) {
  const [searchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const syncFetcher = useFetcher<SyncResponse>();
  const submitted = useRef(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph?.nodes[0]?.id ?? null);
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  useEffect(() => {
    setSelectedNodeId(graph?.nodes[0]?.id ?? null);
  }, [graph?.workflowId]);

  useEffect(() => {
    if (!submitted.current || syncFetcher.state !== "idle") return;
    submitted.current = false;
    revalidator.revalidate();
  }, [revalidator, syncFetcher.state]);

  const synchronize = () => {
    if (!canWrite || syncFetcher.state !== "idle") return;
    submitted.current = true;
    syncFetcher.submit(
      { operation: "synchronize" },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
  };

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full max-h-full">
      <ResizablePanel id="flowcordia-workflows" min="320px" default="360px" className="max-h-full">
        <div className="flex h-full min-h-0 flex-col border-r border-grid-bright bg-background-dimmed">
          <div className="border-b border-grid-bright p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-bright">
                  {repository.owner}/{repository.name}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xxs text-text-dimmed">
                  <GitBranchIcon className="size-3" />
                  {repository.branch}
                  <span>·</span>
                  <span className="font-mono">{shortSha(sync.observedCommitSha)}</span>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xxs font-medium",
                  syncTone(sync.state)
                )}
              >
                {sync.state.replace("_", " ")}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Metric label="Workflows" value={sync.entryCount} />
              <Metric label="Valid" value={sync.validCount} />
              <Metric label="Invalid" value={sync.invalidCount} />
            </div>
            <Button
              className="mt-3 w-full justify-center"
              variant="secondary/small"
              LeadingIcon={RefreshCwIcon}
              isLoading={syncFetcher.state !== "idle"}
              disabled={!canWrite || sync.state === "RUNNING"}
              onClick={synchronize}
            >
              Synchronize repository
            </Button>
            {syncFetcher.data && !syncFetcher.data.ok && (
              <div className="mt-2 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xxs leading-4 text-rose-300">
                {syncFetcher.data.message ?? "Synchronization failed safely."}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600">
            {workflows.length === 0 ? (
              <div className="flex h-full min-h-72 items-center justify-center p-8 text-center">
                <div className="max-w-xs">
                  <GitCommitIcon className="mx-auto size-8 text-indigo-400" />
                  <h2 className="mt-3 text-sm font-medium text-text-bright">
                    No indexed workflows
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-text-dimmed">
                    Synchronize the connected repository to discover validated files under
                    .flowcordia/workflows.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-grid-dimmed">
                {workflows.map((workflow) => (
                  <WorkflowListRow
                    key={workflow.workflowId}
                    workflow={workflow}
                    selected={workflow.workflowId === selectedWorkflowId}
                    href={selectedHref(basePath, searchParams, workflow.workflowId)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="flowcordia-canvas" min="520px" className="max-h-full">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-14 items-center justify-between gap-4 border-b border-grid-bright bg-background-bright px-4 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-bright">
                {graph?.name ?? selectedWorkflowId ?? "Workflow canvas"}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xxs text-text-dimmed">
                {graph ? (
                  <>
                    <span>{graph.nodes.length} nodes</span>
                    <span>{graph.edges.length} edges</span>
                    <span>Schema {graph.schemaVersion}</span>
                    <span className="font-mono">{shortSha(graph.source.commitSha)}</span>
                  </>
                ) : (
                  <span>Select a valid indexed workflow.</span>
                )}
              </div>
            </div>
            {stale && (
              <Badge className="border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                Index update pending
              </Badge>
            )}
          </div>

          {(sync.failure || loadError) && (
            <div className="flex items-start gap-2 border-b border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">{loadError?.code ?? sync.failure?.code}</div>
                <div className="mt-0.5 text-rose-300">
                  {loadError?.message ?? sync.failure?.message}
                </div>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1">
            {graph ? (
              <ResizablePanelGroup orientation="horizontal" className="h-full max-h-full">
                <ResizablePanel id="flowcordia-graph" min="420px" className="max-h-full">
                  <Canvas
                    graph={graph}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={setSelectedNodeId}
                  />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel id="flowcordia-node-inspector" min="260px" default="320px">
                  <NodeInspector node={selectedNode} />
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div className="max-w-sm">
                  {loadError ? (
                    <AlertTriangleIcon className="mx-auto size-10 text-rose-400" />
                  ) : (
                    <CheckCircle2Icon className="mx-auto size-10 text-indigo-400" />
                  )}
                  <h2 className="mt-4 text-base font-medium text-text-bright">
                    {loadError ? "Canvas blocked safely" : "Repository-backed Studio"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-text-dimmed">
                    {loadError
                      ? "Flowcordia will not render a workflow whose indexed identity cannot be proven against GitHub."
                      : "Choose a valid workflow or synchronize the connected production branch."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
