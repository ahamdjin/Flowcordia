import type { WorkflowEditCommand } from "@flowcordia/workflow";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/utils/cn";
import type { FlowcordiaLiveNodeState } from "../preview/presentation";
import {
  buildWorkflowStudioCanvasConnectionCommand,
  workflowStudioCanvasSourceHandles,
  workflowStudioCanvasTargetEligibility,
  type WorkflowStudioCanvasPendingConnection,
} from "./canvas-connections";
import {
  FLOWCORDIA_CANVAS_MAX_SCALE,
  FLOWCORDIA_CANVAS_MIN_SCALE,
  FLOWCORDIA_CANVAS_SCALE_STEP,
  clampWorkflowStudioCanvasScale,
  fitWorkflowStudioCanvasViewport,
  orderedWorkflowStudioCanvasNodeIds,
  panWorkflowStudioCanvasViewport,
  workflowStudioCanvasDirectionalNode,
  zoomWorkflowStudioCanvasViewport,
  type WorkflowStudioCanvasDirection,
  type WorkflowStudioCanvasViewport,
} from "./canvas-navigation";
import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 112;
const CANVAS_PADDING = 80;
const GRID_SIZE = 20;
const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;
const VIEWPORT_MARGIN = 56;

const INITIAL_VIEWPORT: WorkflowStudioCanvasViewport = { scale: 1, x: 0, y: 0 };

type ConnectCommand = Extract<WorkflowEditCommand, { type: "connect_nodes" }>;

type CanvasLayoutNode = WorkflowStudioNode & {
  canvasX: number;
  canvasY: number;
};

interface CanvasEdgeCount {
  incoming: number;
  outgoing: number;
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
  if (condition === "true") return 28;
  if (condition === "false") return 68;
  return NODE_HEIGHT / 2 - 16;
}

function directionFromKey(key: string): WorkflowStudioCanvasDirection | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

function keyboardMoveDelta(direction: WorkflowStudioCanvasDirection): { x: number; y: number } {
  switch (direction) {
    case "left":
      return { x: -GRID_SIZE, y: 0 };
    case "right":
      return { x: GRID_SIZE, y: 0 };
    case "up":
      return { x: 0, y: -GRID_SIZE };
    case "down":
      return { x: 0, y: GRID_SIZE };
  }
}

function isTextEntryElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function nodeAccessibleLabel(input: {
  node: CanvasLayoutNode;
  count: CanvasEdgeCount;
  liveNode: FlowcordiaLiveNodeState | undefined;
}): string {
  const status = input.liveNode ? ` Runtime ${input.liveNode.status.toLowerCase()}.` : "";
  return `${input.node.name}. ${input.node.kind} node. ${input.node.operation}. Position ${input.node.position.x}, ${input.node.position.y}. ${input.count.incoming} incoming and ${input.count.outgoing} outgoing connections.${status}`;
}

function clampMinimap(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value));
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const liveNodesById = useMemo(
    () => new Map(liveNodes.map((node) => [node.nodeId, node])),
    [liveNodes]
  );
  const graphLayoutIdentity = useMemo(
    () =>
      graph.nodes
        .map((node) => `${node.id}:${node.position.x}:${node.position.y}`)
        .sort()
        .join("|"),
    [graph.nodes]
  );
  const graphConnectionIdentity = useMemo(
    () => graph.edges.map((edge) => `${edge.id}:${edge.source}:${edge.target}`).sort().join("|"),
    [graph.edges]
  );
  const edgeCounts = useMemo(() => {
    const values = new Map<string, CanvasEdgeCount>(
      graph.nodes.map((node) => [node.id, { incoming: 0, outgoing: 0 }])
    );
    for (const edge of graph.edges) {
      const source = values.get(edge.source);
      const target = values.get(edge.target);
      if (source) source.outgoing += 1;
      if (target) target.incoming += 1;
    }
    return values;
  }, [graph.edges, graph.nodes]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(graph.nodes.map((node) => [node.id, node.position]))
  );
  const [drag, setDrag] = useState<{
    nodeId: string;
    pointerId: number;
    scale: number;
    startPointer: { x: number; y: number };
    startPosition: { x: number; y: number };
  } | null>(null);
  const [pan, setPan] = useState<{
    pointerId: number;
    startPointer: { x: number; y: number };
    startViewport: WorkflowStudioCanvasViewport;
  } | null>(null);
  const [viewport, setViewport] = useState<WorkflowStudioCanvasViewport>(INITIAL_VIEWPORT);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [pending, setPending] = useState<WorkflowStudioCanvasPendingConnection | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>(
    `${graph.name} canvas loaded with ${graph.nodes.length} nodes and ${graph.edges.length} connections.`
  );

  useEffect(() => {
    setPositions(Object.fromEntries(graph.nodes.map((node) => [node.id, node.position])));
    setDrag(null);
  }, [graph.nodes, graphLayoutIdentity]);

  useEffect(() => {
    setPan(null);
    setPending(null);
    setConnectionMessage(null);
  }, [graph.workflowId, graph.source.requestedRevision, graphConnectionIdentity]);

  useEffect(() => {
    setViewport(INITIAL_VIEWPORT);
    setAnnouncement(
      `${graph.name} canvas loaded with ${graph.nodes.length} nodes and ${graph.edges.length} connections.`
    );
  }, [graph.name, graph.nodes.length, graph.edges.length, graph.workflowId]);

  useEffect(() => {
    if (editable) return;
    setPending(null);
    setConnectionMessage(null);
  }, [editable]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () =>
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    const nodesWithPositions = graph.nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
    }));
    const minX = Math.min(0, ...nodesWithPositions.map((node) => node.position.x));
    const minY = Math.min(0, ...nodesWithPositions.map((node) => node.position.y));
    const offsetX = CANVAS_PADDING - minX;
    const offsetY = CANVAS_PADDING - minY;
    const nodes = new Map<string, CanvasLayoutNode>(
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

  const navigationNodes = useMemo(
    () =>
      Array.from(layout.nodes.values()).map((node) => ({
        id: node.id,
        position: {
          x: node.canvasX + NODE_WIDTH / 2,
          y: node.canvasY + NODE_HEIGHT / 2,
        },
      })),
    [layout.nodes]
  );
  const orderedNodeIds = useMemo(
    () => orderedWorkflowStudioCanvasNodeIds(navigationNodes),
    [navigationNodes]
  );
  const activeNodeId =
    selectedNodeId && layout.nodes.has(selectedNodeId)
      ? selectedNodeId
      : (orderedNodeIds[0] ?? null);

  const revealNode = useCallback(
    (nodeId: string) => {
      const node = layout.nodes.get(nodeId);
      if (!node || viewportSize.width === 0 || viewportSize.height === 0) return;
      setViewport((current) => {
        const left = current.x + node.canvasX * current.scale;
        const top = current.y + node.canvasY * current.scale;
        const right = left + NODE_WIDTH * current.scale;
        const bottom = top + NODE_HEIGHT * current.scale;
        let x = current.x;
        let y = current.y;
        if (left < VIEWPORT_MARGIN) x += VIEWPORT_MARGIN - left;
        else if (right > viewportSize.width - VIEWPORT_MARGIN) {
          x -= right - (viewportSize.width - VIEWPORT_MARGIN);
        }
        if (top < VIEWPORT_MARGIN) y += VIEWPORT_MARGIN - top;
        else if (bottom > viewportSize.height - VIEWPORT_MARGIN) {
          y -= bottom - (viewportSize.height - VIEWPORT_MARGIN);
        }
        return x === current.x && y === current.y ? current : { ...current, x, y };
      });
    },
    [layout.nodes, viewportSize]
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = layout.nodes.get(nodeId);
      if (!node) return;
      onSelectNode(nodeId);
      nodeRefs.current.get(nodeId)?.focus();
      revealNode(nodeId);
      setAnnouncement(`${node.name} selected.`);
    },
    [layout.nodes, onSelectNode, revealNode]
  );

  const changeScale = useCallback(
    (nextScale: number, anchor?: { x: number; y: number }) => {
      const scale = clampWorkflowStudioCanvasScale(nextScale);
      const resolvedAnchor = anchor ?? {
        x: viewportSize.width / 2,
        y: viewportSize.height / 2,
      };
      setViewport((current) =>
        zoomWorkflowStudioCanvasViewport({
          viewport: current,
          nextScale: scale,
          anchor: resolvedAnchor,
        })
      );
      setAnnouncement(`Canvas zoom ${Math.round(scale * 100)} percent.`);
    },
    [viewportSize]
  );

  const fitToWorkflow = useCallback(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) return;
    const next = fitWorkflowStudioCanvasViewport({
      bounds: { x: 0, y: 0, width: layout.width, height: layout.height },
      viewport: viewportSize,
      padding: 32,
    });
    setViewport(next);
    setAnnouncement(`Workflow fitted at ${Math.round(next.scale * 100)} percent.`);
  }, [layout.height, layout.width, viewportSize]);

  const resetViewport = useCallback(() => {
    setViewport(INITIAL_VIEWPORT);
    setAnnouncement("Canvas viewport reset to 100 percent.");
  }, []);

  const positionFromDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    current: NonNullable<typeof drag>
  ) => ({
    x: current.startPosition.x + (event.clientX - current.startPointer.x) / current.scale,
    y: current.startPosition.y + (event.clientY - current.startPointer.y) / current.scale,
  });

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, node: CanvasLayoutNode) => {
    onSelectNode(node.id);
    if (!editable || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      nodeId: node.id,
      pointerId: event.pointerId,
      scale: viewport.scale,
      startPointer: { x: event.clientX, y: event.clientY },
      startPosition: positions[node.id] ?? node.position,
    });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const position = positionFromDrag(event, drag);
    setPositions((current) => ({ ...current, [drag.nodeId]: position }));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const unsnapped = positionFromDrag(event, drag);
    const position = { x: snap(unsnapped.x), y: snap(unsnapped.y) };
    const node = layout.nodes.get(drag.nodeId);
    setPositions((values) => ({ ...values, [drag.nodeId]: position }));
    setDrag(null);
    if (position.x !== drag.startPosition.x || position.y !== drag.startPosition.y) {
      onMoveNode(drag.nodeId, position);
      setAnnouncement(`${node?.name ?? drag.nodeId} moved to ${position.x}, ${position.y}.`);
    }
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPan({
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startViewport: viewport,
    });
  };

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pan || pan.pointerId !== event.pointerId) return;
    setViewport(
      panWorkflowStudioCanvasViewport(pan.startViewport, {
        x: event.clientX - pan.startPointer.x,
        y: event.clientY - pan.startPointer.y,
      })
    );
  };

  const finishPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pan || pan.pointerId !== event.pointerId) return;
    setPan(null);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const direction = event.deltaY > 0 ? -1 : 1;
      changeScale(viewport.scale + direction * FLOWCORDIA_CANVAS_SCALE_STEP, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      return;
    }
    setViewport((current) =>
      panWorkflowStudioCanvasViewport(current, {
        x: -event.deltaX,
        y: -event.deltaY,
      })
    );
  };

  const chooseSource = (sourceId: string, condition: "true" | "false" | null) => {
    const next = { sourceId, condition };
    if (pending?.sourceId === sourceId && pending.condition === condition) {
      setPending(null);
      setConnectionMessage(null);
      setAnnouncement("Connection cancelled.");
      nodeRefs.current.get(sourceId)?.focus();
      return;
    }
    setPending(next);
    const message =
      condition === null
        ? `Choose a target for ${sourceId}.`
        : `Choose a target for ${sourceId} ${condition} branch.`;
    setConnectionMessage(message);
    setAnnouncement(message);
    nodeRefs.current.get(sourceId)?.focus();
  };

  const chooseTarget = (targetId: string) => {
    const result = buildWorkflowStudioCanvasConnectionCommand({ graph, pending, targetId });
    if (!result.success) {
      setConnectionMessage(result.message);
      setAnnouncement(result.message);
      return;
    }
    onConnect(result.command);
    setPending(null);
    setConnectionMessage(null);
    setAnnouncement(`Connected ${result.command.source} to ${result.command.target}.`);
    nodeRefs.current.get(targetId)?.focus();
  };

  const moveNodeByKeyboard = (node: CanvasLayoutNode, direction: WorkflowStudioCanvasDirection) => {
    const delta = keyboardMoveDelta(direction);
    const current = positions[node.id] ?? node.position;
    const position = { x: snap(current.x + delta.x), y: snap(current.y + delta.y) };
    setPositions((values) => ({ ...values, [node.id]: position }));
    onMoveNode(node.id, position);
    setAnnouncement(`${node.name} moved to ${position.x}, ${position.y}.`);
  };

  const handleNodeKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    node: CanvasLayoutNode
  ) => {
    const direction = directionFromKey(event.key);
    if (direction && event.altKey && editable) {
      event.preventDefault();
      event.stopPropagation();
      moveNodeByKeyboard(node, direction);
      return;
    }
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      const next = workflowStudioCanvasDirectionalNode({
        nodes: navigationNodes,
        currentId: node.id,
        direction,
      });
      if (next) focusNode(next);
      else setAnnouncement(`No node ${direction} of ${node.name}.`);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      const next = event.key === "Home" ? orderedNodeIds[0] : orderedNodeIds.at(-1);
      if (next) focusNode(next);
    }
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTextEntryElement(event.target)) return;
    const direction = directionFromKey(event.key);
    if (event.target === event.currentTarget && direction && activeNodeId) {
      event.preventDefault();
      focusNode(activeNodeId);
      return;
    }
    if (event.target === event.currentTarget && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      const next = event.key === "Home" ? orderedNodeIds[0] : orderedNodeIds.at(-1);
      if (next) focusNode(next);
      return;
    }
    if (event.key === "Escape") {
      setPending(null);
      setConnectionMessage(null);
      setAnnouncement("Canvas action cancelled.");
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeScale(viewport.scale + FLOWCORDIA_CANVAS_SCALE_STEP);
      return;
    }
    if (event.key === "-") {
      event.preventDefault();
      changeScale(viewport.scale - FLOWCORDIA_CANVAS_SCALE_STEP);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      resetViewport();
      return;
    }
    if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      fitToWorkflow();
    }
  };

  const minimap = useMemo(() => {
    const scale = Math.min(MINIMAP_WIDTH / layout.width, MINIMAP_HEIGHT / layout.height);
    const visibleX = (-viewport.x / viewport.scale) * scale;
    const visibleY = (-viewport.y / viewport.scale) * scale;
    const visibleWidth = (viewportSize.width / viewport.scale) * scale;
    const visibleHeight = (viewportSize.height / viewport.scale) * scale;
    const x = clampMinimap(visibleX, MINIMAP_WIDTH);
    const y = clampMinimap(visibleY, MINIMAP_HEIGHT);
    return {
      scale,
      viewport: {
        x,
        y,
        width: Math.max(0, Math.min(visibleWidth, MINIMAP_WIDTH - x)),
        height: Math.max(0, Math.min(visibleHeight, MINIMAP_HEIGHT - y)),
      },
    };
  }, [layout.height, layout.width, viewport, viewportSize]);

  return (
    <div
      ref={viewportRef}
      role="region"
      aria-label={`Workflow canvas for ${graph.name}`}
      aria-describedby="flowcordia-canvas-instructions"
      className={cn(
        "relative h-full overflow-hidden bg-background-dimmed outline-none",
        pan ? "cursor-grabbing" : "cursor-grab"
      )}
      tabIndex={0}
      style={{ touchAction: "none" }}
      onPointerDown={beginPan}
      onPointerMove={movePan}
      onPointerUp={finishPan}
      onPointerCancel={() => setPan(null)}
      onWheel={handleWheel}
      onKeyDown={handleCanvasKeyDown}
    >
      <p id="flowcordia-canvas-instructions" className="sr-only">
        Use arrow keys to enter the graph and move focus between nearby nodes. Hold Alt and press an
        arrow key to move an editable node by one grid step. Use plus and minus to zoom, zero to reset,
        and F to fit the workflow. Drag empty space or use a touch gesture to pan. After choosing a
        source connection handle, move to the target node and Tab once to its target handle.
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <ul className="sr-only" aria-label="Workflow connections">
        {graph.edges.map((edge) => {
          const source = layout.nodes.get(edge.source);
          const target = layout.nodes.get(edge.target);
          return (
            <li key={edge.id}>
              {source?.name ?? edge.source} connects to {target?.name ?? edge.target}
              {edge.condition ? ` on the ${edge.condition} branch` : ""}.
            </li>
          );
        })}
      </ul>

      <div className="absolute right-3 top-3 z-40 flex items-center gap-1 rounded-lg border border-grid-bright bg-background-bright/95 p-1 shadow-lg backdrop-blur">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (-)"
          className="flex size-10 items-center justify-center rounded text-sm font-medium text-text-dimmed hover:bg-background-dimmed hover:text-text-bright focus-custom disabled:opacity-40"
          disabled={viewport.scale <= FLOWCORDIA_CANVAS_MIN_SCALE}
          onClick={() => changeScale(viewport.scale - FLOWCORDIA_CANVAS_SCALE_STEP)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset canvas zoom"
          title="Reset canvas zoom (0)"
          className="min-h-10 min-w-14 rounded px-2 py-1.5 font-mono text-xxs text-text-dimmed hover:bg-background-dimmed hover:text-text-bright focus-custom"
          onClick={resetViewport}
        >
          {Math.round(viewport.scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          className="flex size-10 items-center justify-center rounded text-sm font-medium text-text-dimmed hover:bg-background-dimmed hover:text-text-bright focus-custom disabled:opacity-40"
          disabled={viewport.scale >= FLOWCORDIA_CANVAS_MAX_SCALE}
          onClick={() => changeScale(viewport.scale + FLOWCORDIA_CANVAS_SCALE_STEP)}
        >
          +
        </button>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-grid-bright" />
        <button
          type="button"
          aria-label="Fit workflow to canvas"
          title="Fit workflow (F)"
          className="min-h-10 rounded px-3 py-1.5 text-xxs font-medium text-text-dimmed hover:bg-background-dimmed hover:text-text-bright focus-custom"
          onClick={fitToWorkflow}
        >
          Fit
        </button>
      </div>

      {connectionMessage && (
        <div className="absolute left-3 top-3 z-40 inline-flex max-w-md items-center gap-2 rounded border border-indigo-500/30 bg-background-bright/95 px-3 py-2 text-xs text-indigo-200 shadow-lg backdrop-blur">
          <span>{connectionMessage}</span>
          <button
            type="button"
            className="font-medium text-text-dimmed hover:text-text-bright focus-custom"
            onClick={() => {
              setPending(null);
              setConnectionMessage(null);
              setAnnouncement("Connection cancelled.");
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <div
        data-testid="flowcordia-canvas-surface"
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
          transformOrigin: "0 0",
          backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.14) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          willChange: pan || drag ? "transform" : undefined,
        }}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={finishPan}
        onPointerCancel={() => setPan(null)}
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
          const isActive = node.id === activeNodeId;
          return (
            <div
              key={node.id}
              data-canvas-node={node.id}
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
                  tabIndex={isActive && Boolean(pending) && target.eligible ? 0 : -1}
                  aria-label={`Connect to ${node.name}`}
                  title={
                    pending ? (target.message ?? `Connect to ${node.name}`) : "Choose a source first"
                  }
                  disabled={!pending || !target.eligible}
                  className={cn(
                    "absolute -left-4 top-1/2 z-20 size-8 -translate-y-1/2 rounded-full border-2 transition focus-custom",
                    pending && target.eligible
                      ? "border-indigo-300 bg-indigo-500 shadow-[0_0_0_4px_rgba(129,140,248,0.18)] hover:scale-110"
                      : "border-charcoal-600 bg-background-bright opacity-45"
                  )}
                  onClick={() => chooseTarget(node.id)}
                />
              )}

              <button
                ref={(element) => {
                  if (element) nodeRefs.current.set(node.id, element);
                  else nodeRefs.current.delete(node.id);
                }}
                type="button"
                tabIndex={isActive ? 0 : -1}
                aria-label={nodeAccessibleLabel({
                  node,
                  count: edgeCounts.get(node.id) ?? { incoming: 0, outgoing: 0 },
                  liveNode,
                })}
                aria-pressed={selectedNodeId === node.id}
                onClick={() => onSelectNode(node.id)}
                onKeyDown={(event) => handleNodeKeyDown(event, node)}
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
                <div className="mt-2 truncate text-sm font-medium text-text-bright">{node.name}</div>
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
                    tabIndex={isActive && handle.available ? 0 : -1}
                    aria-label={`${handle.label} from ${node.name}`}
                    title={handle.reason ?? handle.label}
                    disabled={!handle.available}
                    className={cn(
                      "absolute -right-4 z-20 flex size-8 items-center justify-center rounded-full border-2 text-[9px] font-semibold uppercase transition focus-custom",
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

      <button
        type="button"
        aria-label="Workflow minimap. Activate to fit the workflow."
        title="Workflow minimap. Click to fit."
        className="absolute bottom-3 right-3 z-40 hidden overflow-hidden rounded-lg border border-grid-bright bg-background-bright/95 shadow-lg backdrop-blur focus-custom sm:block"
        style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
        onClick={fitToWorkflow}
      >
        {Array.from(layout.nodes.values()).map((node) => (
          <span
            key={node.id}
            aria-hidden
            className={cn(
              "absolute rounded-sm border",
              selectedNodeId === node.id ? "border-indigo-300 bg-indigo-400/50" : nodeTone(node.kind)
            )}
            style={{
              left: node.canvasX * minimap.scale,
              top: node.canvasY * minimap.scale,
              width: Math.max(4, NODE_WIDTH * minimap.scale),
              height: Math.max(3, NODE_HEIGHT * minimap.scale),
            }}
          />
        ))}
        <span
          aria-hidden
          className="absolute rounded border border-indigo-300 bg-indigo-400/10"
          style={{
            left: minimap.viewport.x,
            top: minimap.viewport.y,
            width: minimap.viewport.width,
            height: minimap.viewport.height,
          }}
        />
      </button>
    </div>
  );
}
