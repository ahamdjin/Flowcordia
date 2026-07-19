import type { WorkflowEditCommand } from "@flowcordia/workflow";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "~/utils/cn";
import type { FlowcordiaLiveNodeState } from "../preview/presentation";
import {
  buildWorkflowStudioCanvasConnectionCommand,
  workflowStudioCanvasSourceHandles,
  workflowStudioCanvasTargetEligibility,
  type WorkflowStudioCanvasPendingConnection,
} from "./canvas-connections";
import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 112;
const CANVAS_PADDING = 80;
const GRID_SIZE = 20;

type ConnectCommand = Extract<WorkflowEditCommand, { type: "connect_nodes" }>;

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

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function sourceHandleTop(condition: "true" | "false" | null): number {
  if (condition === "true") return 30;
  if (condition === "false") return 70;
  return NODE_HEIGHT / 2 - 10;
}

export function WorkflowStudioCanvas({
  graph,
  liveNodes,
  selectedNodeId,
  editable,
  onSelectNode,
  onMoveNode,
  onConnect,
}: {
  graph: WorkflowStudioGraph;
  liveNodes: FlowcordiaLiveNodeState[];
  selectedNodeId: string | null;
  editable: boolean;
  onSelectNode: (id: string) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onConnect: (command: ConnectCommand) => void;
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
  const [pending, setPending] = useState<WorkflowStudioCanvasPendingConnection | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  useEffect(() => {
    setPositions(Object.fromEntries(graph.nodes.map((node) => [node.id, node.position])));
    setDrag(null);
    setPending(null);
    setConnectionMessage(null);
  }, [graph]);

  useEffect(() => {
    if (editable) return;
    setPending(null);
    setConnectionMessage(null);
  }, [editable]);

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

  const chooseSource = (sourceId: string, condition: "true" | "false" | null) => {
    const next = { sourceId, condition };
    if (pending?.sourceId === sourceId && pending.condition === condition) {
      setPending(null);
      setConnectionMessage(null);
      return;
    }
    setPending(next);
    setConnectionMessage(
      condition === null
        ? `Choose a target for ${sourceId}.`
        : `Choose a target for ${sourceId} [${condition}].`
    );
  };

  const chooseTarget = (targetId: string) => {
    const result = buildWorkflowStudioCanvasConnectionCommand({ graph, pending, targetId });
    if (!result.success) {
      setConnectionMessage(result.message);
      return;
    }
    onConnect(result.command);
    setPending(null);
    setConnectionMessage(null);
  };

  return (
    <div
      className="h-full overflow-auto bg-background-dimmed scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        setPending(null);
        setConnectionMessage(null);
      }}
    >
      <div
        className="relative"
        style={{
          width: layout.width,
          height: layout.height,
          backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.14) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          setPending(null);
          setConnectionMessage(null);
        }}
      >
        {pending && (
          <div className="sticky left-4 top-4 z-30 inline-flex max-w-md items-center gap-2 rounded border border-indigo-500/30 bg-background-bright/95 px-3 py-2 text-xs text-indigo-200 shadow-lg backdrop-blur">
            <span>{connectionMessage}</span>
            <button
              type="button"
              className="font-medium text-text-dimmed hover:text-text-bright"
              onClick={() => {
                setPending(null);
                setConnectionMessage(null);
              }}
            >
              Cancel
            </button>
          </div>
        )}

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
            const y1 =
              source.canvasY +
              (edge.condition === "true" ? 40 : edge.condition === "false" ? 80 : NODE_HEIGHT / 2);
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
          const target = workflowStudioCanvasTargetEligibility({
            graph,
            pending,
            targetId: node.id,
          });
          const handles = workflowStudioCanvasSourceHandles(graph, node.id);
          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: node.canvasX,
                top: node.canvasY,
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
              }}
            >
              {editable && node.kind !== "trigger" && (
                <button
                  type="button"
                  aria-label={`Connect to ${node.name}`}
                  title={
                    pending
                      ? (target.message ?? `Connect to ${node.name}`)
                      : "Choose a source first"
                  }
                  disabled={!pending || !target.eligible}
                  className={cn(
                    "absolute -left-3 top-1/2 z-20 size-6 -translate-y-1/2 rounded-full border-2 transition focus-custom",
                    pending && target.eligible
                      ? "border-indigo-300 bg-indigo-500 shadow-[0_0_0_4px_rgba(129,140,248,0.18)] hover:scale-110"
                      : "border-charcoal-600 bg-background-bright opacity-45"
                  )}
                  onClick={() => chooseTarget(node.id)}
                />
              )}

              <button
                type="button"
                onPointerDown={(event) => beginDrag(event, node)}
                onPointerMove={moveDrag}
                onPointerUp={finishDrag}
                onPointerCancel={() => setDrag(null)}
                className={cn(
                  "min-h-28 w-full touch-none select-none rounded-lg border p-3 text-left shadow-lg shadow-black/10 transition focus-custom",
                  editable ? "cursor-move" : "cursor-default",
                  nodeTone(node.kind),
                  selectedNodeId === node.id
                    ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-background-dimmed"
                    : "hover:border-text-dimmed"
                )}
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
                <div className="mt-2 truncate text-sm font-medium text-text-bright">
                  {node.name}
                </div>
                <div className="mt-1 truncate font-mono text-xs text-text-dimmed">
                  {node.operation}
                </div>
                <div className="mt-2 flex gap-2 text-xxs text-text-dimmed">
                  <span>{node.configurationKeys.length} settings</span>
                  <span>{node.credentialReferences.length} credentials</span>
                </div>
              </button>

              {editable &&
                handles.map((handle) => (
                  <button
                    key={handle.id}
                    type="button"
                    aria-label={`${handle.label} from ${node.name}`}
                    title={handle.reason ?? handle.label}
                    disabled={!handle.available}
                    className={cn(
                      "absolute -right-3 z-20 flex size-6 items-center justify-center rounded-full border-2 text-[9px] font-semibold uppercase transition focus-custom",
                      handle.available
                        ? pending?.sourceId === node.id && pending.condition === handle.condition
                          ? "border-indigo-200 bg-indigo-500 text-white shadow-[0_0_0_4px_rgba(129,140,248,0.2)]"
                          : "border-indigo-400 bg-background-bright text-indigo-300 hover:scale-110 hover:bg-indigo-500 hover:text-white"
                        : "cursor-not-allowed border-charcoal-600 bg-background-bright text-text-dimmed opacity-40"
                    )}
                    style={{ top: sourceHandleTop(handle.condition) }}
                    onClick={() => chooseSource(node.id, handle.condition)}
                  >
                    {handle.condition === "true" ? "T" : handle.condition === "false" ? "F" : "→"}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
