import {
  WORKFLOW_STUDIO_NODE_TEMPLATES,
  type WorkflowEditCommand,
  type WorkflowStudioTemplateId,
} from "@flowcordia/workflow";
import { Link, useFetcher, useRevalidator, useSearchParams } from "@remix-run/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  GitBranchIcon,
  GitCommitIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/primitives/Resizable";
import { cn } from "~/utils/cn";
import type { FlowcordiaLiveNodeState, FlowcordiaPreviewProjection } from "../preview/presentation";
import type { WorkflowDraftAddFunctionNodeCommand } from "../drafts/types";
import type { WorkflowFunctionCatalogProjection } from "../functions/presentation";
import type {
  WorkflowStudioDraft,
  WorkflowStudioDiff,
  WorkflowStudioGraph,
  WorkflowStudioListItem,
  WorkflowStudioNode,
  WorkflowStudioSyncStatus,
} from "./presentation";
import { WorkflowStudioNodeConfigurationEditor } from "./WorkflowStudioNodeConfigurationEditor";

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

interface DraftResponse {
  ok: boolean;
  status?: "started" | "resumed" | "saved" | "discarded" | "published";
  draft?: {
    publicId: string;
    version: string;
    documentSha256: string;
    stale: boolean;
  };
  proposal?: {
    proposalId: string;
    state: string;
    pullRequestNumber: number | null;
    headSha: string | null;
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

type WorkflowStudioEditCommand = WorkflowEditCommand | WorkflowDraftAddFunctionNodeCommand;

const NODE_WIDTH = 240;
const NODE_HEIGHT = 112;
const CANVAS_PADDING = 80;
const GRID_SIZE = 20;
const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

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

function previewTone(state: FlowcordiaPreviewProjection["state"]): string {
  switch (state) {
    case "READY":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
    case "DEPLOYING":
    case "WAITING_FOR_DEPLOYMENT":
      return "border-blue-500/25 bg-blue-500/10 text-blue-200";
    case "FAILED":
      return "border-rose-500/25 bg-rose-500/10 text-rose-200";
    case "DISABLED":
    case "UNAVAILABLE":
    case "CLOSED":
    case "NOT_REQUESTED":
      return "border-grid-bright bg-background-bright text-text-dimmed";
  }
}

function liveNodeTone(status: FlowcordiaLiveNodeState["status"]): string {
  switch (status) {
    case "SUCCEEDED":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-300";
    case "SKIPPED":
      return "border-yellow-500/35 bg-yellow-500/10 text-yellow-300";
    case "FAILED":
      return "border-rose-500/35 bg-rose-500/10 text-rose-300";
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

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function Canvas({
  graph,
  liveNodes,
  selectedNodeId,
  editable,
  onSelectNode,
  onMoveNode,
}: {
  graph: WorkflowStudioGraph;
  liveNodes: FlowcordiaLiveNodeState[];
  selectedNodeId: string | null;
  editable: boolean;
  onSelectNode: (id: string) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
}) {
  const liveNodesById = useMemo(
    () => new Map(liveNodes.map((node) => [node.nodeId, node])),
    [liveNodes]
  );
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(graph.nodes.map((node) => [node.id, node.position]))
  );
  const [drag, setDrag] = useState<{
    nodeId: string;
    pointerId: number;
    startPointer: { x: number; y: number };
    startPosition: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    setPositions(Object.fromEntries(graph.nodes.map((node) => [node.id, node.position])));
    setDrag(null);
  }, [graph]);

  const layout = useMemo(() => {
    const nodesWithPositions = graph.nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
    }));
    const minX = Math.min(0, ...nodesWithPositions.map((node) => node.position.x));
    const minY = Math.min(0, ...nodesWithPositions.map((node) => node.position.y));
    const offsetX = CANVAS_PADDING - minX;
    const offsetY = CANVAS_PADDING - minY;
    const nodes = new Map(
      nodesWithPositions.map((node) => [
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
  }, [graph.nodes, positions]);

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowStudioNode) => {
    onSelectNode(node.id);
    if (!editable || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      nodeId: node.id,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startPosition: positions[node.id] ?? node.position,
    });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPositions((current) => ({
      ...current,
      [drag.nodeId]: {
        x: drag.startPosition.x + event.clientX - drag.startPointer.x,
        y: drag.startPosition.y + event.clientY - drag.startPointer.y,
      },
    }));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = positions[drag.nodeId] ?? drag.startPosition;
    const position = { x: snap(current.x), y: snap(current.y) };
    setPositions((values) => ({ ...values, [drag.nodeId]: position }));
    setDrag(null);
    if (position.x !== drag.startPosition.x || position.y !== drag.startPosition.y) {
      onMoveNode(drag.nodeId, position);
    }
  };

  return (
    <div className="h-full overflow-auto bg-background-dimmed scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600">
      <div
        className="relative"
        style={{
          width: layout.width,
          height: layout.height,
          backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.14) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
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
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  className="stroke-charcoal-500"
                  strokeWidth="2"
                  markerEnd="url(#flowcordia-arrow)"
                />
                {edge.condition && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 8}
                    textAnchor="middle"
                    className="fill-text-dimmed text-[10px] font-medium uppercase"
                  >
                    {edge.condition}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {Array.from(layout.nodes.values()).map((node) => {
          const liveNode = liveNodesById.get(node.id);
          return (
            <button
              key={node.id}
              type="button"
              onPointerDown={(event) => beginDrag(event, node)}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={() => setDrag(null)}
              className={cn(
                "absolute touch-none select-none rounded-lg border p-3 text-left shadow-lg shadow-black/10 transition focus-custom",
                editable ? "cursor-move" : "cursor-default",
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
                <div className="flex items-center gap-1.5">
                  <span className="rounded border border-grid-bright bg-background-dimmed px-1.5 py-0.5 text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                    {node.kind}
                  </span>
                  {liveNode && (
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-xxs font-medium uppercase tracking-wide",
                        liveNodeTone(liveNode.status)
                      )}
                      title={liveNode.message ?? `${liveNode.operation}: ${liveNode.status}`}
                    >
                      {liveNode.status.toLowerCase()}
                    </span>
                  )}
                </div>
                <span className="truncate font-mono text-xxs text-text-dimmed">{node.id}</span>
              </div>
              <div className="mt-2 truncate text-sm font-medium text-text-bright">{node.name}</div>
              <div className="mt-1 truncate font-mono text-xs text-text-dimmed">
                {node.operation}
              </div>
              <div className="mt-2 flex gap-2 text-xxs text-text-dimmed">
                <span>{node.configurationKeys.length} settings</span>
                <span>{node.credentialReferences.length} credentials</span>
              </div>
            </button>
          );
        })}
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

function WorkflowInspector({
  graph,
  editable,
  busy,
  onSave,
}: {
  graph: WorkflowStudioGraph;
  editable: boolean;
  busy: boolean;
  onSave: (command: WorkflowEditCommand) => void;
}) {
  const [name, setName] = useState(graph.name);
  const [description, setDescription] = useState(graph.description ?? "");
  const [labels, setLabels] = useState(graph.labels.join(", "));

  useEffect(() => {
    setName(graph.name);
    setDescription(graph.description ?? "");
    setLabels(graph.labels.join(", "));
  }, [graph]);

  return (
    <div className="border-b border-grid-bright p-4">
      <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
        Workflow details
      </div>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xxs text-text-dimmed">Name</span>
          <input
            className={inputClassName}
            value={name}
            disabled={!editable || busy}
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xxs text-text-dimmed">Description</span>
          <textarea
            className={cn(inputClassName, "min-h-20 resize-y")}
            value={description}
            disabled={!editable || busy}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xxs text-text-dimmed">Labels, comma separated</span>
          <input
            className={inputClassName}
            value={labels}
            disabled={!editable || busy}
            onChange={(event) => setLabels(event.target.value)}
          />
        </label>
        {editable && (
          <Button
            className="w-full justify-center"
            variant="secondary/small"
            disabled={busy || name.trim().length === 0}
            onClick={() =>
              onSave({
                type: "set_workflow_details",
                name: name.trim(),
                description: description.trim() || null,
                labels: Array.from(
                  new Set(
                    labels
                      .split(",")
                      .map((label) => label.trim())
                      .filter(Boolean)
                  )
                ),
              })
            }
          >
            Save workflow details
          </Button>
        )}
      </div>
    </div>
  );
}

function NodeInspector({
  graph,
  node,
  editable,
  busy,
  onCommand,
}: {
  graph: WorkflowStudioGraph;
  node: WorkflowStudioNode | null;
  editable: boolean;
  busy: boolean;
  onCommand: (command: WorkflowEditCommand) => void;
}) {
  const [name, setName] = useState(node?.name ?? "");
  const [target, setTarget] = useState("");
  const [branch, setBranch] = useState<"true" | "false">("true");

  useEffect(() => {
    setName(node?.name ?? "");
    setTarget("");
    setBranch("true");
  }, [node?.editableConfiguration, node?.id, node?.name]);

  if (!node) {
    return (
      <div className="flex min-h-64 items-center justify-center p-6 text-center">
        <div>
          <ShieldCheckIcon className="mx-auto size-8 text-indigo-400" />
          <div className="mt-3 text-sm font-medium text-text-bright">Select a node</div>
          <p className="mt-2 text-xs leading-5 text-text-dimmed">
            Studio exposes structure and references, never configuration values, credentials, or
            hidden server identity.
          </p>
        </div>
      </div>
    );
  }

  const connectedEdges = graph.edges.filter(
    (edge) => edge.source === node.id || edge.target === node.id
  );
  const possibleTargets = graph.nodes.filter(
    (candidate) =>
      candidate.id !== node.id &&
      !graph.edges.some((edge) => edge.source === node.id && edge.target === candidate.id)
  );
  const usedBranches = new Set(
    graph.edges
      .filter((edge) => edge.source === node.id && edge.condition)
      .map((edge) => edge.condition)
  );
  const selectedBranch = usedBranches.has(branch)
    ? !usedBranches.has("true")
      ? "true"
      : !usedBranches.has("false")
        ? "false"
        : branch
    : branch;
  const conditionBranchesFull =
    node.operation === "control.condition" && usedBranches.has("true") && usedBranches.has("false");

  return (
    <div className="p-4">
      <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
        {node.kind}
      </div>
      <h3 className="mt-1 text-base font-medium text-text-bright">{node.name}</h3>
      <div className="mt-1 break-all font-mono text-xs text-text-dimmed">{node.id}</div>
      <div className="mt-2">
        <Badge
          className={cn(
            "border",
            node.ownership === "developer"
              ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
              : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
          )}
        >
          {node.ownership === "developer" ? "Developer owned" : "Visual editor owned"}
        </Badge>
      </div>

      {editable && (
        <div className="mt-4 space-y-3 rounded-md border border-grid-dimmed bg-background-bright p-3">
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Display name</span>
            <input
              className={inputClassName}
              value={name}
              disabled={busy}
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button
            className="w-full justify-center"
            variant="secondary/small"
            disabled={busy || name.trim().length === 0 || name.trim() === node.name}
            onClick={() => onCommand({ type: "rename_node", nodeId: node.id, name: name.trim() })}
          >
            Rename node
          </Button>
          {node.editableConfiguration !== null && (
            <WorkflowStudioNodeConfigurationEditor
              node={node}
              busy={busy}
              onSave={(configuration) =>
                onCommand({
                  type: "set_node_configuration",
                  nodeId: node.id,
                  configuration,
                })
              }
            />
          )}
          {node.ownership === "developer" && (
            <div className="rounded border border-violet-500/25 bg-violet-500/10 px-2.5 py-2 text-xxs leading-4 text-violet-200">
              Implementation and configuration are owned by the referenced repository export. Studio
              may move, rename, connect, or remove the workflow reference; every change still
              requires Git review.
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Connect to</span>
            <select
              className={inputClassName}
              value={target}
              disabled={busy || possibleTargets.length === 0}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">Select a node</option>
              {possibleTargets.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          {node.operation === "control.condition" && (
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">Branch</span>
              <select
                className={inputClassName}
                value={selectedBranch}
                disabled={busy}
                onChange={(event) => setBranch(event.target.value as "true" | "false")}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </label>
          )}
          <Button
            className="w-full justify-center"
            variant="secondary/small"
            disabled={busy || !target || conditionBranchesFull}
            onClick={() =>
              onCommand({
                type: "connect_nodes",
                source: node.id,
                target,
                ...(node.operation === "control.condition" ? { condition: selectedBranch } : {}),
              })
            }
          >
            Connect nodes
          </Button>
          <Button
            className="w-full justify-center"
            variant="secondary/small"
            disabled={busy}
            onClick={() => onCommand({ type: "remove_node", nodeId: node.id })}
          >
            Remove node
          </Button>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <InspectorSection label="Operation">
          <span className="font-mono">{node.operation}</span>
        </InspectorSection>
        <InspectorSection label="Position">
          {node.position.x}, {node.position.y}
        </InspectorSection>
        <InspectorSection label="Configuration keys">
          {node.configurationKeys.length > 0 ? node.configurationKeys.join(", ") : "None"}
        </InspectorSection>
        <InspectorSection label="Credential references">
          {node.credentialReferences.length > 0 ? node.credentialReferences.join(", ") : "None"}
        </InspectorSection>
        <InspectorSection label="Connections">
          {connectedEdges.length === 0 ? (
            "None"
          ) : (
            <div className="space-y-2">
              {connectedEdges.map((edge) => (
                <div
                  key={edge.id}
                  className="flex items-center justify-between gap-2 rounded border border-grid-dimmed px-2 py-1.5"
                >
                  <span className="min-w-0 truncate font-mono text-xxs">
                    {edge.source} → {edge.target}
                    {edge.condition ? ` [${edge.condition}]` : ""}
                  </span>
                  {editable && (
                    <button
                      type="button"
                      className="shrink-0 text-xxs text-rose-300 hover:text-rose-200"
                      disabled={busy}
                      onClick={() => onCommand({ type: "remove_edge", edgeId: edge.id })}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
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

export function WorkflowStudio({
  workflows,
  selectedWorkflowId,
  graph,
  draft,
  diff,
  preview,
  functionCatalog,
  sync,
  repository,
  stale,
  loadError,
  basePath,
  proposalPath,
  commandPath,
  draftCommandPath,
  canWrite,
}: {
  workflows: WorkflowStudioListItem[];
  selectedWorkflowId: string | null;
  graph: WorkflowStudioGraph | null;
  draft: WorkflowStudioDraft | null;
  diff: WorkflowStudioDiff | null;
  preview: FlowcordiaPreviewProjection;
  functionCatalog: WorkflowFunctionCatalogProjection;
  sync: WorkflowStudioSyncStatus;
  repository: { owner: string; name: string; branch: string };
  stale: boolean;
  loadError: { code: string; message: string; retryable: boolean } | null;
  basePath: string;
  proposalPath: string;
  commandPath: string;
  draftCommandPath: string;
  canWrite: boolean;
}) {
  const [searchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const syncFetcher = useFetcher<SyncResponse>();
  const draftFetcher = useFetcher<DraftResponse>();
  const syncSubmitted = useRef(false);
  const draftSubmitted = useRef(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph?.nodes[0]?.id ?? null);
  const [templateId, setTemplateId] = useState<WorkflowStudioTemplateId>("http_action");
  const [functionId, setFunctionId] = useState(functionCatalog.functions[0]?.id ?? "");
  const [lastProposal, setLastProposal] = useState<DraftResponse["proposal"] | null>(null);
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const draftBusy = draftFetcher.state !== "idle";
  const editable = Boolean(canWrite && draft && !draft.stale && !stale && !loadError);
  const diffCount = diff
    ? diff.nodes.added.length +
      diff.nodes.modified.length +
      diff.nodes.removed.length +
      diff.edges.added.length +
      diff.edges.modified.length +
      diff.edges.removed.length +
      (diff.detailsChanged ? 1 : 0)
    : 0;

  useEffect(() => {
    setSelectedNodeId(graph?.nodes[0]?.id ?? null);
  }, [graph?.workflowId, draft?.version]);

  useEffect(() => {
    if (functionCatalog.functions.some((definition) => definition.id === functionId)) return;
    setFunctionId(functionCatalog.functions[0]?.id ?? "");
  }, [functionCatalog.functions, functionId]);

  useEffect(() => {
    if (!syncSubmitted.current || syncFetcher.state !== "idle") return;
    syncSubmitted.current = false;
    revalidator.revalidate();
  }, [revalidator, syncFetcher.state]);

  useEffect(() => {
    if (!draftSubmitted.current || draftFetcher.state !== "idle") return;
    draftSubmitted.current = false;
    if (draftFetcher.data?.status === "published" && draftFetcher.data.proposal) {
      setLastProposal(draftFetcher.data.proposal);
    }
    revalidator.revalidate();
  }, [draftFetcher.data, draftFetcher.state, revalidator]);

  useEffect(() => {
    const runIsActive =
      preview.latestRun &&
      ![
        "COMPLETED_SUCCESSFULLY",
        "COMPLETED_WITH_ERRORS",
        "CANCELED",
        "SYSTEM_FAILURE",
        "CRASHED",
        "INTERRUPTED",
        "EXPIRED",
        "TIMED_OUT",
      ].includes(preview.latestRun.status);
    if (!["WAITING_FOR_DEPLOYMENT", "DEPLOYING"].includes(preview.state) && !runIsActive) {
      return;
    }
    const interval = window.setInterval(() => revalidator.revalidate(), 5_000);
    return () => window.clearInterval(interval);
  }, [preview.latestRun, preview.state, revalidator]);

  const synchronize = () => {
    if (!canWrite || syncFetcher.state !== "idle") return;
    syncSubmitted.current = true;
    syncFetcher.submit(
      { operation: "synchronize" },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
  };

  const submitDraft = (
    payload:
      | { operation: "start"; workflowId: string }
      | {
          operation: "edit";
          draftId: string;
          expectedVersion: string;
          command: WorkflowStudioEditCommand;
        }
      | { operation: "discard"; draftId: string; expectedVersion: string }
      | { operation: "publish"; draftId: string; expectedVersion: string }
  ) => {
    if (!canWrite || draftBusy) return;
    draftSubmitted.current = true;
    draftFetcher.submit(payload, {
      method: "POST",
      action: draftCommandPath,
      encType: "application/json",
    });
  };

  const submitEdit = (command: WorkflowStudioEditCommand) => {
    if (!draft || !editable) return;
    submitDraft({
      operation: "edit",
      draftId: draft.publicId,
      expectedVersion: draft.version,
      command,
    });
  };

  const addNode = () => {
    if (!graph || !editable) return;
    const index = graph.nodes.length;
    submitEdit({
      type: "add_node",
      templateId,
      position: {
        x: 80 + (index % 4) * 280,
        y: 80 + Math.floor(index / 4) * 180,
      },
    });
  };

  const addFunctionNode = () => {
    if (!graph || !editable || !functionId) return;
    const index = graph.nodes.length;
    submitEdit({
      type: "add_function_node",
      functionId,
      position: {
        x: 80 + (index % 4) * 280,
        y: 80 + Math.floor(index / 4) * 180,
      },
    });
  };

  const publishDraft = () => {
    if (!draft || !editable) return;
    submitDraft({
      operation: "publish",
      draftId: draft.publicId,
      expectedVersion: draft.version,
    });
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
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-medium text-text-bright">
                  {graph?.name ?? selectedWorkflowId ?? "Workflow canvas"}
                </div>
                {draft && (
                  <Badge className="border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                    Draft v{draft.version}
                  </Badge>
                )}
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
            <div className="flex items-center gap-2">
              {stale && (
                <Badge className="border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                  Index update pending
                </Badge>
              )}
              {draft?.stale && (
                <Badge className="border border-rose-500/30 bg-rose-500/10 text-rose-300">
                  Draft base changed
                </Badge>
              )}
              {!draft && graph && canWrite && (
                <Button
                  variant="secondary/small"
                  disabled={draftBusy || stale}
                  isLoading={draftBusy}
                  onClick={() =>
                    selectedWorkflowId &&
                    submitDraft({ operation: "start", workflowId: selectedWorkflowId })
                  }
                >
                  Start editing
                </Button>
              )}
              {draft && canWrite && (
                <>
                  <Button
                    variant="primary/small"
                    disabled={!editable || draftBusy || !diff?.changed}
                    isLoading={draftBusy}
                    onClick={publishDraft}
                  >
                    Publish proposal
                  </Button>
                  <Button
                    variant="secondary/small"
                    disabled={draftBusy}
                    onClick={() =>
                      submitDraft({
                        operation: "discard",
                        draftId: draft.publicId,
                        expectedVersion: draft.version,
                      })
                    }
                  >
                    Discard draft
                  </Button>
                </>
              )}
            </div>
          </div>

          {draft && !draft.stale && stale && (
            <div className="border-b border-yellow-500/25 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-200">
              Editing is paused while the repository index is changing. Synchronization must settle
              before the next draft mutation.
            </div>
          )}
          {draft?.stale && (
            <div className="border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
              The repository workflow changed after this draft began. The draft remains inspectable,
              but edits are blocked until it is discarded and restarted from the latest source.
            </div>
          )}
          {draftFetcher.data && !draftFetcher.data.ok && (
            <div className="border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
              {draftFetcher.data.message ?? "The draft operation failed safely."}
            </div>
          )}
          {lastProposal && (
            <div className="flex items-center justify-between gap-4 border-b border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
              <span>
                Proposal created
                {lastProposal.pullRequestNumber ? ` as PR #${lastProposal.pullRequestNumber}` : ""}.
                {lastProposal.preview.state === "READY"
                  ? " Its preview environment is prepared; GitHub review and checks own promotion."
                  : ` ${lastProposal.preview.message ?? "Preview preparation is unavailable."}`}
              </span>
              <Link className="font-medium underline-offset-2 hover:underline" to={proposalPath}>
                Open Proposals to continue review
              </Link>
            </div>
          )}
          {graph && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs",
                previewTone(preview.state)
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {preview.state === "READY" ? (
                  <CheckCircle2Icon className="size-4 shrink-0" />
                ) : preview.state === "FAILED" ? (
                  <AlertTriangleIcon className="size-4 shrink-0" />
                ) : (
                  <RefreshCwIcon
                    className={cn(
                      "size-4 shrink-0",
                      ["WAITING_FOR_DEPLOYMENT", "DEPLOYING"].includes(preview.state) &&
                        "animate-spin"
                    )}
                  />
                )}
                <span>
                  <strong className="font-medium">Preview: {preview.state.toLowerCase()}</strong>
                  <span className="ml-2 opacity-80">{preview.message}</span>
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xxs">
                {preview.proposal?.headSha && <span>{shortSha(preview.proposal.headSha)}</span>}
                {preview.deployment && <span>deployment {preview.deployment.version}</span>}
                {preview.latestRun && (
                  <span>
                    run {preview.latestRun.friendlyId}: {preview.latestRun.status.toLowerCase()} ·
                    proof {preview.latestRun.proof.toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          )}
          {draft && diff && (
            <div className="flex items-center gap-3 border-b border-grid-bright bg-background-bright px-4 py-2 text-xxs text-text-dimmed">
              <span className={diff.changed ? "text-indigo-300" : "text-text-dimmed"}>
                {diff.changed
                  ? `${diffCount} draft change${diffCount === 1 ? "" : "s"}`
                  : "No draft changes"}
              </span>
              <span>
                Nodes +{diff.nodes.added.length} / ~{diff.nodes.modified.length} / -
                {diff.nodes.removed.length}
              </span>
              <span>
                Edges +{diff.edges.added.length} / ~{diff.edges.modified.length} / -
                {diff.edges.removed.length}
              </span>
              {diff.detailsChanged && <span>Workflow details changed</span>}
            </div>
          )}
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

          {graph && draft && (
            <div className="border-b border-grid-bright bg-background-dimmed px-4 py-2">
              <div className="flex items-center gap-2">
                {draft && (
                  <>
                    <select
                      className={cn(inputClassName, "max-w-52")}
                      value={templateId}
                      disabled={!editable || draftBusy}
                      onChange={(event) =>
                        setTemplateId(event.target.value as WorkflowStudioTemplateId)
                      }
                    >
                      {WORKFLOW_STUDIO_NODE_TEMPLATES.filter(
                        (template) => template.id !== "code_task"
                      ).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary/small"
                      disabled={!editable || draftBusy}
                      isLoading={draftBusy}
                      onClick={addNode}
                    >
                      Add node
                    </Button>
                    {functionCatalog.state === "READY" && functionCatalog.functions.length > 0 && (
                      <>
                        <select
                          aria-label="Repository function"
                          className={cn(inputClassName, "max-w-56")}
                          value={functionId}
                          disabled={!editable || draftBusy}
                          onChange={(event) => setFunctionId(event.target.value)}
                        >
                          {functionCatalog.functions.map((definition) => (
                            <option key={definition.id} value={definition.id}>
                              {definition.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="secondary/small"
                          disabled={!editable || draftBusy || !functionId}
                          isLoading={draftBusy}
                          onClick={addFunctionNode}
                        >
                          Add function
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
              {functionCatalog.message && (
                <div
                  className={cn(
                    "mt-2 text-xxs",
                    functionCatalog.state === "INVALID" || functionCatalog.state === "UNAVAILABLE"
                      ? "text-yellow-300"
                      : "text-text-dimmed"
                  )}
                >
                  {functionCatalog.message}
                </div>
              )}
              {functionCatalog.state === "READY" && functionCatalog.source && (
                <div className="mt-2 text-xxs text-text-dimmed">
                  {functionCatalog.functions.length} repository function
                  {functionCatalog.functions.length === 1 ? "" : "s"} from{" "}
                  <span className="font-mono">{functionCatalog.source.path}</span> at{" "}
                  <span className="font-mono">{shortSha(functionCatalog.source.commitSha)}</span>
                </div>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1">
            {graph ? (
              <ResizablePanelGroup orientation="horizontal" className="h-full max-h-full">
                <ResizablePanel id="flowcordia-graph" min="420px" className="max-h-full">
                  <Canvas
                    graph={graph}
                    liveNodes={preview.latestRun?.nodes ?? []}
                    selectedNodeId={selectedNodeId}
                    editable={editable && !draftBusy}
                    onSelectNode={setSelectedNodeId}
                    onMoveNode={(nodeId, position) =>
                      submitEdit({ type: "move_node", nodeId, position })
                    }
                  />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel id="flowcordia-node-inspector" min="280px" default="340px">
                  <div className="h-full overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600">
                    <WorkflowInspector
                      graph={graph}
                      editable={editable}
                      busy={draftBusy}
                      onSave={submitEdit}
                    />
                    <NodeInspector
                      graph={graph}
                      node={selectedNode}
                      editable={editable}
                      busy={draftBusy}
                      onCommand={submitEdit}
                    />
                  </div>
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
                      ? "Flowcordia will not render a workflow whose stored or indexed identity cannot be proven."
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
