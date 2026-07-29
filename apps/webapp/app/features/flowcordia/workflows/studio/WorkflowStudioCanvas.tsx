import type { WorkflowEditCommand } from "@flowcordia/workflow";
import type { WorkflowDraftEditCommand } from "../drafts/types";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  getBezierPath,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnectEnd,
  type OnReconnect,
  type ReactFlowInstance,
} from "@xyflow/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { FlowcordiaLiveNodeState } from "../preview/presentation";
import { workflowStudioCanvasSourceHandles } from "./canvas-connections";
import { workflowStudioCanvasEdgeLabel } from "./canvas-edges";
import { buildWorkflowStudioAutoLayoutCommand } from "./canvas-layout";
import {
  buildWorkflowStudioReactFlowConnectionCommand,
  buildWorkflowStudioReactFlowReconnectCommand,
} from "./canvas-react-flow";
import {
  FLOWCORDIA_NODE_CLIPBOARD_TYPE,
  buildWorkflowStudioCrossWorkflowPasteCommand,
  buildWorkflowStudioDuplicateCommand,
  buildWorkflowStudioMoveNodesCommand,
  createWorkflowStudioNodeClipboardPayload,
  createWorkflowStudioNodeRemovalPlan,
  nextWorkflowStudioDuplicateOffset,
  parseWorkflowStudioNodeClipboardPayload,
  serializeWorkflowStudioNodeClipboardPayload,
} from "./canvas-selection";
import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";
import { WorkflowStudioQuickNodeCreator } from "./WorkflowStudioQuickNodeCreator";
import type { WorkflowStudioQuickCreateContext } from "./quick-node-creator";

const NODE_WIDTH = 216;
const NODE_HEIGHT = 104;
const GRID_SIZE = 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

function sameNodeSelection(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((nodeId) => right.has(nodeId));
}

type QuickCreateRequest =
  | {
      context: "standalone";
      position: { x: number; y: number };
    }
  | {
      context: "after_source";
      position: { x: number; y: number };
      source: string;
      condition?: "true" | "false";
    }
  | {
      context: "on_edge";
      position: { x: number; y: number };
      edgeId: string;
    };

type QuickCreateState = QuickCreateRequest & { anchor: { left: number; top: number } };

type CanvasNodeData = {
  node: WorkflowStudioNode;
  liveNode: FlowcordiaLiveNodeState | undefined;
  incoming: number;
  outgoing: number;
  editable: boolean;
  sourceHandles: ReturnType<typeof workflowStudioCanvasSourceHandles>;
  onQuickCreate: (request: QuickCreateRequest) => void;
};

type CanvasNode = Node<CanvasNodeData, "flowcordia">;
type CanvasEdgeData = {
  condition: "true" | "false" | null;
  editable: boolean;
  onQuickCreate: (request: QuickCreateRequest) => void;
};
type CanvasEdge = Edge<CanvasEdgeData, "flowcordia">;

function nodeTone(kind: WorkflowStudioNode["kind"]): string {
  switch (kind) {
    case "trigger":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "action":
      return "border-blue-300 bg-blue-50 text-blue-700";
    case "control":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "code":
      return "border-violet-300 bg-violet-50 text-violet-700";
    case "subflow":
      return "border-cyan-300 bg-cyan-50 text-cyan-700";
    case "approval":
      return "border-orange-300 bg-orange-50 text-orange-700";
    case "output":
      return "border-pink-300 bg-pink-50 text-pink-700";
  }
}

function minimapNodeColor(node: CanvasNode): string {
  switch (node.data.node.kind) {
    case "trigger":
      return "#34d399";
    case "action":
      return "#60a5fa";
    case "control":
      return "#fbbf24";
    case "code":
      return "#a78bfa";
    case "subflow":
      return "#22d3ee";
    case "approval":
      return "#fb923c";
    case "output":
      return "#f472b6";
  }
}

function liveNodeTone(status: FlowcordiaLiveNodeState["status"]): string {
  switch (status) {
    case "SUCCEEDED":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "SKIPPED":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "FAILED":
      return "border-rose-300 bg-rose-50 text-rose-700";
  }
}

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function isTextEntryElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function nodeAccessibleLabel(input: {
  node: WorkflowStudioNode;
  incoming: number;
  outgoing: number;
  liveNode: FlowcordiaLiveNodeState | undefined;
}): string {
  const status = input.liveNode ? ` Runtime ${input.liveNode.status.toLowerCase()}.` : "";
  return `${input.node.name}. ${input.node.kind} node. ${input.node.operation}. Position ${input.node.position.x}, ${input.node.position.y}. ${input.incoming} incoming and ${input.outgoing} outgoing connections.${status}`;
}

function sourceHandleTop(condition: "true" | "false" | null): string {
  if (condition === "true") return "30%";
  if (condition === "false") return "70%";
  return "50%";
}

function sourceHandleOffset(condition: "true" | "false" | null): number {
  if (condition === "true") return 31;
  if (condition === "false") return 73;
  return 52;
}

function eventClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

function FlowcordiaCanvasNode({ data, selected }: NodeProps<CanvasNode>) {
  const { node, liveNode } = data;
  return (
    <div
      data-canvas-node={node.id}
      className={cn(
        "group relative h-[104px] w-[216px] select-none rounded-[10px] border bg-white p-3 text-left text-zinc-800 shadow-[0_2px_8px_rgba(24,24,27,0.08)] transition duration-150",
        selected
          ? "border-[#ff6d5a] ring-[6px] ring-[#ff6d5a]/[0.15]"
          : "border-black/[0.15] hover:border-black/30 hover:shadow-[0_8px_22px_rgba(24,24,27,0.12)]"
      )}
    >
      {node.kind !== "trigger" && (
        <Handle
          id={"target"}
          type="target"
          position={Position.Left}
          isConnectable={data.editable}
          aria-label={`Connect to ${node.name}`}
          className="!size-4 !border-2 !border-zinc-400 !bg-white transition hover:!border-[#ff6d5a] hover:!bg-[#ff6d5a]"
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]",
              nodeTone(node.kind)
            )}
          >
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
        <span className="max-w-24 truncate font-mono text-[9px] text-zinc-400">{node.id}</span>
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-zinc-800">{node.name}</div>
      <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">{node.operation}</div>
      <div className="mt-2 flex gap-2 text-[9px] text-zinc-400">
        <span>{node.configurationKeys.length} settings</span>
        <span>{node.credentialReferences.length} credentials</span>
      </div>

      {data.sourceHandles.map((handle) => (
        <div
          key={handle.id}
          className="absolute right-0"
          style={{ top: sourceHandleTop(handle.condition) }}
        >
          <Handle
            id={handle.condition ?? "next"}
            type="source"
            position={Position.Right}
            isConnectable={data.editable && handle.available}
            aria-label={`${handle.label} from ${node.name}`}
            title={handle.reason ?? handle.label}
            className={cn(
              "!size-4 !border-2 transition",
              handle.available
                ? "!border-[#ff6d5a] !bg-white hover:!bg-[#ff6d5a]"
                : "!border-zinc-300 !bg-zinc-100 opacity-40"
            )}
          />
          {data.editable && handle.available && (
            <button
              type="button"
              className={cn(
                "nodrag nopan absolute left-5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-[#ff6d5a]/40 bg-white text-[#e95745] shadow-sm transition hover:border-[#ff6d5a] hover:bg-[#ff6d5a] hover:text-white focus-custom",
                selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
              )}
              aria-label={`Add a node after ${node.name}${handle.condition ? ` on the ${handle.condition} branch` : ""}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                data.onQuickCreate({
                  context: "after_source",
                  source: node.id,
                  ...(handle.condition === null ? {} : { condition: handle.condition }),
                  position: {
                    x: node.position.x + NODE_WIDTH + 84,
                    y: node.position.y + sourceHandleOffset(handle.condition) - NODE_HEIGHT / 2,
                  },
                });
              }}
            >
              <PlusIcon className="size-3.5" aria-hidden="true" />
            </button>
          )}
          {handle.condition && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded bg-white px-1 font-mono text-[8px] font-semibold uppercase text-zinc-500 shadow-sm"
            >
              {handle.condition === "true" ? "T" : "F"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function FlowcordiaCanvasEdge(props: EdgeProps<CanvasEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={18}
      />
      {(props.data?.condition || (props.selected && props.data?.editable)) && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {props.data?.condition && (
              <span
                aria-hidden="true"
                className="pointer-events-none rounded border border-black/10 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500 shadow-sm"
              >
                {props.data.condition}
              </span>
            )}
            {props.selected && props.data?.editable && (
              <button
                type="button"
                className="nodrag nopan grid size-6 place-items-center rounded-full border border-[#ff6d5a]/40 bg-white text-[#e95745] shadow-sm transition hover:border-[#ff6d5a] hover:bg-[#ff6d5a] hover:text-white focus-custom"
                aria-label="Insert a node into this connection"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.data?.onQuickCreate({
                    context: "on_edge",
                    edgeId: props.id,
                    position: { x: labelX, y: labelY },
                  });
                }}
              >
                <PlusIcon className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { flowcordia: FlowcordiaCanvasNode };
const edgeTypes = { flowcordia: FlowcordiaCanvasEdge };

function buildNodes({
  graph,
  liveNodesById,
  selectedNodeIds,
  editable,
  onQuickCreate,
}: {
  graph: WorkflowStudioGraph;
  liveNodesById: ReadonlyMap<string, FlowcordiaLiveNodeState>;
  selectedNodeIds: ReadonlySet<string>;
  editable: boolean;
  onQuickCreate: (request: QuickCreateRequest) => void;
}): CanvasNode[] {
  const counts = new Map(graph.nodes.map((node) => [node.id, { incoming: 0, outgoing: 0 }]));
  for (const edge of graph.edges) {
    const source = counts.get(edge.source);
    const target = counts.get(edge.target);
    if (source) source.outgoing += 1;
    if (target) target.incoming += 1;
  }
  return graph.nodes.map((node) => {
    const count = counts.get(node.id) ?? { incoming: 0, outgoing: 0 };
    const liveNode = liveNodesById.get(node.id);
    return {
      id: node.id,
      type: "flowcordia",
      position: node.position,
      initialWidth: NODE_WIDTH,
      initialHeight: NODE_HEIGHT,
      selected: selectedNodeIds.has(node.id),
      draggable: editable,
      connectable: editable,
      deletable: false,
      focusable: true,
      ariaLabel: nodeAccessibleLabel({ node, ...count, liveNode }),
      data: {
        node,
        liveNode,
        ...count,
        editable,
        sourceHandles: workflowStudioCanvasSourceHandles(graph, node.id),
        onQuickCreate,
      },
    };
  });
}

function buildEdges({
  graph,
  selectedEdgeId,
  editable,
  onQuickCreate,
}: {
  graph: WorkflowStudioGraph;
  selectedEdgeId: string | null;
  editable: boolean;
  onQuickCreate: (request: QuickCreateRequest) => void;
}): CanvasEdge[] {
  return graph.edges.map((edge) => {
    const selected = selectedEdgeId === edge.id;
    const condition =
      edge.condition === "true" || edge.condition === "false" ? edge.condition : null;
    return {
      id: edge.id,
      type: "flowcordia",
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? condition ?? "next",
      targetHandle: edge.targetHandle ?? "target",
      selected,
      focusable: true,
      deletable: false,
      reconnectable: editable ? "target" : false,
      interactionWidth: 18,
      ariaLabel: workflowStudioCanvasEdgeLabel(graph, edge.id),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: selected ? "#ff6d5a" : "#929299",
        width: 18,
        height: 18,
      },
      style: {
        stroke: selected ? "#ff6d5a" : "#929299",
        strokeWidth: selected ? 3 : 2,
      },
      data: { condition, editable, onQuickCreate },
    };
  });
}

export function WorkflowStudioCanvas({
  graph,
  liveNodes,
  selectedNodeId,
  selectedEdgeId,
  editable,
  clipboardSource,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onCommand,
  onRemoveEdge,
}: {
  graph: WorkflowStudioGraph;
  liveNodes: FlowcordiaLiveNodeState[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  editable: boolean;
  clipboardSource: {
    draftPublicId: string;
    draftVersion: string;
    documentSha256: string;
  } | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string | null) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onCommand: (command: WorkflowDraftEditCommand) => void;
  onRemoveEdge: (edgeId: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);
  const connectionSourceRef = useRef<{
    source: string;
    condition?: "true" | "false";
  } | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    nodeIds: string[];
    edgeCount: number;
  } | null>(null);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const fitAfterLayoutRef = useRef(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(
    () => new Set(selectedNodeId ? [selectedNodeId] : [])
  );
  const selectedNodeIdsRef = useRef<ReadonlySet<string>>(selectedNodeIds);
  const pointerDraggingNodeIds = useRef(new Set<string>());
  const duplicateOffsetStep = useRef(0);
  const committedPositions = useRef(
    new Map(graph.nodes.map((node) => [node.id, `${node.position.x}:${node.position.y}`]))
  );
  const [announcement, setAnnouncement] = useState(
    `${graph.name} canvas loaded with ${graph.nodes.length} nodes and ${graph.edges.length} connections.`
  );
  const liveNodesById = useMemo(
    () => new Map(liveNodes.map((node) => [node.nodeId, node])),
    [liveNodes]
  );
  const openQuickCreate = useCallback(
    (request: QuickCreateRequest, clientPoint?: { x: number; y: number }) => {
      if (!editable) return;
      const instance = instanceRef.current;
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!instance || !bounds) return;
      const screenPoint = clientPoint ?? instance.flowToScreenPosition(request.position);
      const left = Math.min(
        Math.max(12, screenPoint.x - bounds.left),
        Math.max(12, bounds.width - 364)
      );
      const top = Math.min(
        Math.max(12, screenPoint.y - bounds.top),
        Math.max(12, bounds.height - 430)
      );
      setQuickCreate({ ...request, anchor: { left, top } });
      setAnnouncement(
        request.context === "on_edge"
          ? "Choose a node to insert into the selected connection."
          : request.context === "after_source"
            ? "Choose the next node."
            : "Choose a node to add to the workflow."
      );
    },
    [editable]
  );
  const initialNodes = useMemo(
    () =>
      buildNodes({
        graph,
        liveNodesById,
        selectedNodeIds,
        editable,
        onQuickCreate: openQuickCreate,
      }),
    [editable, graph, liveNodesById, openQuickCreate, selectedNodeIds]
  );
  const initialEdges = useMemo(
    () => buildEdges({ graph, selectedEdgeId, editable, onQuickCreate: openQuickCreate }),
    [editable, graph, openQuickCreate, selectedEdgeId]
  );
  const [nodes, setNodes, applyNodeChanges] = useNodesState<CanvasNode>(initialNodes);
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<CanvasEdge>(initialEdges);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  useEffect(() => {
    if (!selectedNodeId || selectedNodeIdsRef.current.has(selectedNodeId)) return;
    setSelectedNodeIds(new Set([selectedNodeId]));
  }, [selectedNodeId]);

  useEffect(() => {
    const availableNodeIds = new Set(graph.nodes.map((node) => node.id));
    setSelectedNodeIds((current) => {
      const next = new Set([...current].filter((nodeId) => availableNodeIds.has(nodeId)));
      return sameNodeSelection(current, next) ? current : next;
    });
  }, [graph.nodes]);

  useEffect(() => {
    setNodes(initialNodes);
    committedPositions.current = new Map(
      graph.nodes.map((node) => [node.id, `${node.position.x}:${node.position.y}`])
    );
  }, [graph.nodes, initialNodes, setNodes]);

  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges]);

  useEffect(() => {
    if (!fitAfterLayoutRef.current) return;
    fitAfterLayoutRef.current = false;
    void instanceRef.current?.fitView({
      duration: 220,
      padding: 0.18,
      minZoom: MIN_ZOOM,
      maxZoom: 1.2,
    });
  }, [graph.nodes]);

  useEffect(() => {
    setAnnouncement(
      `${graph.name} canvas has ${graph.nodes.length} nodes and ${graph.edges.length} connections.`
    );
  }, [graph.edges.length, graph.name, graph.nodes.length, graph.workflowId]);

  const commitPosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!editable) return;
      const next = { x: snap(position.x), y: snap(position.y) };
      const identity = `${next.x}:${next.y}`;
      if (committedPositions.current.get(nodeId) === identity) return;
      committedPositions.current.set(nodeId, identity);
      onMoveNode(nodeId, next);
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);
      setAnnouncement(`${node?.name ?? nodeId} moved to ${next.x}, ${next.y}.`);
    },
    [editable, graph.nodes, onMoveNode]
  );

  const handleNodeChanges = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      applyNodeChanges(changes);
      for (const change of changes) {
        if (
          change.type === "position" &&
          change.position &&
          change.dragging !== true &&
          !pointerDraggingNodeIds.current.has(change.id)
        ) {
          commitPosition(change.id, change.position);
        }
      }
    },
    [applyNodeChanges, commitPosition]
  );

  const isValidConnection = useCallback(
    (connection: Connection | CanvasEdge) =>
      buildWorkflowStudioReactFlowConnectionCommand({
        graph,
        connection: {
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
        },
      }).success,
    [graph]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const result = buildWorkflowStudioReactFlowConnectionCommand({ graph, connection });
      if (!result.success) {
        setAnnouncement(result.message);
        return;
      }
      onCommand(result.command);
      setAnnouncement(`Connected ${result.command.source} to ${result.command.target}.`);
    },
    [graph, onCommand]
  );

  const handleReconnect = useCallback<OnReconnect<CanvasEdge>>(
    (edge, connection) => {
      const result = buildWorkflowStudioReactFlowReconnectCommand({
        graph,
        edgeId: edge.id,
        connection,
      });
      if (!result.success) {
        setAnnouncement(result.message);
        return;
      }
      onCommand(result.command);
      setAnnouncement(`Connection ${edge.id} now targets ${result.command.target}.`);
    },
    [graph, onCommand]
  );

  const handleQuickChoose = (
    templateId: import("@flowcordia/workflow").WorkflowStudioTemplateId
  ) => {
    if (!quickCreate) return;
    const position = { x: snap(quickCreate.position.x), y: snap(quickCreate.position.y) };
    if (quickCreate.context === "standalone") {
      onCommand({ type: "add_node", templateId, position });
    } else if (quickCreate.context === "after_source") {
      onCommand({
        type: "add_connected_node",
        templateId,
        position,
        source: quickCreate.source,
        ...(quickCreate.condition === undefined ? {} : { condition: quickCreate.condition }),
      });
    } else {
      onCommand({
        type: "insert_node_on_edge",
        templateId,
        position,
        edgeId: quickCreate.edgeId,
      });
    }
    setQuickCreate(null);
    setAnnouncement("Node creation submitted through the workflow draft.");
  };

  const openAtViewportCenter = () => {
    const instance = instanceRef.current;
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!instance || !bounds) return;
    const clientPoint = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    openQuickCreate(
      { context: "standalone", position: instance.screenToFlowPosition(clientPoint) },
      clientPoint
    );
  };

  const arrangeWorkflow = async () => {
    if (!editable || layoutBusy || graph.nodes.length < 2) return;
    setLayoutBusy(true);
    setAnnouncement(`Arranging ${graph.nodes.length} workflow nodes.`);
    try {
      const command = await buildWorkflowStudioAutoLayoutCommand({
        graph,
        nodeWidth: NODE_WIDTH,
        nodeHeight: NODE_HEIGHT,
        gridSize: GRID_SIZE,
      });
      if (!command) {
        setAnnouncement("The workflow is already arranged on the current grid.");
        return;
      }
      fitAfterLayoutRef.current = true;
      onCommand(command);
      setAnnouncement(
        `${command.moves.length} node position${command.moves.length === 1 ? "" : "s"} submitted as one automatic-layout edit. Undo restores the previous positions.`
      );
    } catch (error) {
      setAnnouncement(
        error instanceof Error
          ? `Automatic layout failed: ${error.message}`
          : "Automatic layout failed unexpectedly."
      );
    } finally {
      setLayoutBusy(false);
    }
  };

  const handleConnectEnd: OnConnectEnd = (event, state) => {
    const source = connectionSourceRef.current;
    connectionSourceRef.current = null;
    if (!source || state.isValid === true || state.toNode) return;
    const clientPoint = eventClientPoint(event);
    const instance = instanceRef.current;
    if (!clientPoint || !instance) return;
    openQuickCreate(
      {
        context: "after_source",
        source: source.source,
        ...(source.condition === undefined ? {} : { condition: source.condition }),
        position: instance.screenToFlowPosition(clientPoint),
      },
      clientPoint
    );
  };

  const handleCanvasDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.classList.contains("react-flow__pane")
    ) {
      return;
    }
    const instance = instanceRef.current;
    if (!instance) return;
    const clientPoint = { x: event.clientX, y: event.clientY };
    openQuickCreate(
      { context: "standalone", position: instance.screenToFlowPosition(clientPoint) },
      clientPoint
    );
  };

  const selectedNodeIdsInGraphOrder = () =>
    graph.nodes.filter((node) => selectedNodeIdsRef.current.has(node.id)).map((node) => node.id);

  const submitDuplicate = (nodeIds: readonly string[], offset: { x: number; y: number }) => {
    if (!editable) return;
    const command = buildWorkflowStudioDuplicateCommand({ nodeIds, offset });
    if (!command) return;
    onCommand(command);
    setAnnouncement(
      `${command.nodeIds.length} selected node${command.nodeIds.length === 1 ? "" : "s"} submitted for duplication.`
    );
  };

  const nextDuplicateOffset = () => {
    const next = nextWorkflowStudioDuplicateOffset({
      currentStep: duplicateOffsetStep.current,
      distance: GRID_SIZE * 2,
    });
    duplicateOffsetStep.current = next.step;
    return next.offset;
  };

  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (isTextEntryElement(event.target)) return;
    if (!clipboardSource) return;
    const payload = createWorkflowStudioNodeClipboardPayload({
      workflowId: graph.workflowId,
      draftPublicId: clipboardSource.draftPublicId,
      draftVersion: clipboardSource.draftVersion,
      documentSha256: clipboardSource.documentSha256,
      nodeIds: selectedNodeIdsInGraphOrder(),
    });
    if (!payload) return;
    event.clipboardData.setData(
      FLOWCORDIA_NODE_CLIPBOARD_TYPE,
      serializeWorkflowStudioNodeClipboardPayload(payload)
    );
    event.clipboardData.setData(
      "text/plain",
      `Flowcordia nodes from ${payload.workflowId}: ${payload.nodeIds.join(", ")}`
    );
    event.preventDefault();
    setAnnouncement(
      `${payload.nodeIds.length} node${payload.nodeIds.length === 1 ? "" : "s"} copied by identity.`
    );
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (isTextEntryElement(event.target) || !editable) return;
    const payload = parseWorkflowStudioNodeClipboardPayload(
      event.clipboardData.getData(FLOWCORDIA_NODE_CLIPBOARD_TYPE)
    );
    if (!payload) return;
    event.preventDefault();
    const offset = nextDuplicateOffset();
    if (payload.workflowId === graph.workflowId) {
      submitDuplicate(payload.nodeIds, offset);
      return;
    }
    const command = buildWorkflowStudioCrossWorkflowPasteCommand({ payload, offset });
    if (!command) return;
    onCommand(command);
    setAnnouncement(
      `${command.nodeIds.length} node${command.nodeIds.length === 1 ? "" : "s"} from ${command.sourceWorkflowId} submitted for cross-workflow paste.`
    );
  };

  const requestNodeRemoval = () => {
    if (!editable) return;
    const plan = createWorkflowStudioNodeRemovalPlan({
      nodeIds: selectedNodeIdsInGraphOrder(),
      edges: graph.edges,
    });
    if (!plan) return;
    setPendingRemoval({ nodeIds: plan.command.nodeIds, edgeCount: plan.edgeCount });
    setAnnouncement(
      `Confirm removal of ${plan.command.nodeIds.length} selected node${
        plan.command.nodeIds.length === 1 ? "" : "s"
      } and ${plan.edgeCount} connected edge${plan.edgeCount === 1 ? "" : "s"}.`
    );
  };

  const submitNodeRemoval = () => {
    if (!pendingRemoval || !editable) return;
    onCommand({ type: "remove_nodes", nodeIds: pendingRemoval.nodeIds });
    setPendingRemoval(null);
    setAnnouncement(
      `${pendingRemoval.nodeIds.length} selected node${
        pendingRemoval.nodeIds.length === 1 ? "" : "s"
      } submitted for removal through the workflow draft.`
    );
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTextEntryElement(event.target) || !editable) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      const nodeIds = selectedNodeIdsInGraphOrder();
      if (nodeIds.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      submitDuplicate(nodeIds, nextDuplicateOffset());
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (selectedEdgeId) {
      event.preventDefault();
      event.stopPropagation();
      const label = workflowStudioCanvasEdgeLabel(graph, selectedEdgeId);
      onSelectEdge(null);
      onRemoveEdge(selectedEdgeId);
      setAnnouncement(`${label} removed.`);
      return;
    }
    if (selectedNodeIdsRef.current.size > 0) {
      event.preventDefault();
      event.stopPropagation();
      requestNodeRemoval();
    }
  };

  return (
    <div
      ref={wrapperRef}
      role="region"
      tabIndex={0}
      aria-label={`Workflow canvas for ${graph.name}`}
      aria-describedby="flowcordia-canvas-instructions"
      className="relative h-full overflow-hidden bg-[#f7f7f8] text-[#242428] outline-none"
      onCopy={handleCopy}
      onPaste={handlePaste}
      onDoubleClick={handleCanvasDoubleClick}
      onKeyDownCapture={handleKeyDown}
    >
      <p id="flowcordia-canvas-instructions" className="sr-only">
        Tab through nodes and connections. Press Enter or Space to select. Use arrow keys to move a
        selected editable node, and hold Shift for a larger step. Drag empty space to select a
        group, or hold Control or Command while selecting nodes. Use Control or Command with C and V
        to copy and paste selected nodes by identity, or D to duplicate them. Use Arrange workflow
        to submit one undoable left-to-right layout edit. Drag a source handle to an eligible target
        handle to connect nodes. Drag the target end of a selected connection to reconnect it. Press
        Delete or Backspace to confirm removal of the selected connection or nodes. Double-click
        empty canvas space, use the Add node button, click the plus beside a selected output, or
        drop a connection on empty space to open the node creator. Select a connection to insert a
        node at its midpoint. Use the canvas controls to zoom and fit the workflow; trackpad,
        mouse-wheel, and pinch gestures pan or zoom.
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <ul className="sr-only" aria-label="Workflow connections">
        {graph.edges.map((edge) => {
          const source = graph.nodes.find((node) => node.id === edge.source);
          const target = graph.nodes.find((node) => node.id === edge.target);
          return (
            <li key={edge.id}>
              {source?.name ?? edge.source} connects to {target?.name ?? edge.target}
              {edge.condition ? ` on the ${edge.condition} branch` : ""}.
            </li>
          );
        })}
      </ul>

      <ReactFlow<CanvasNode, CanvasEdge>
        data-testid="flowcordia-canvas-surface"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: MIN_ZOOM, maxZoom: 1.2 }}
        onlyRenderVisibleElements
        nodesDraggable={editable}
        nodesConnectable={editable}
        nodesFocusable
        edgesFocusable
        edgesReconnectable={editable}
        elementsSelectable
        deleteKeyCode={null}
        multiSelectionKeyCode={["Meta", "Control"]}
        selectionOnDrag
        panOnDrag={[0, 1]}
        panOnScroll
        zoomOnPinch
        zoomOnScroll
        zoomOnDoubleClick={false}
        autoPanOnNodeFocus
        autoPanOnConnect
        elevateEdgesOnSelect
        reconnectRadius={24}
        connectionRadius={24}
        connectionLineStyle={{ stroke: "#ff6d5a", strokeWidth: 2 }}
        defaultEdgeOptions={{ type: "flowcordia", interactionWidth: 18 }}
        ariaLabelConfig={{
          "controls.ariaLabel": "Workflow canvas controls",
          "controls.zoomIn.ariaLabel": "Zoom workflow canvas in",
          "controls.zoomOut.ariaLabel": "Zoom workflow canvas out",
          "controls.fitView.ariaLabel": "Fit workflow to canvas",
          "minimap.ariaLabel": "Workflow minimap",
          "handle.ariaLabel": "Workflow connection handle",
          "edge.a11yDescription.default":
            "Press Enter or Space to select this connection. Drag its target end to reconnect it, or press Delete to remove it when editing is enabled.",
        }}
        onInit={(instance) => {
          instanceRef.current = instance;
        }}
        onNodesChange={handleNodeChanges}
        onEdgesChange={applyEdgeChanges}
        onConnectStart={(_event, params) => {
          if (!params.nodeId) return;
          connectionSourceRef.current = {
            source: params.nodeId,
            ...(params.handleId === "true" || params.handleId === "false"
              ? { condition: params.handleId }
              : {}),
          };
        }}
        onConnectEnd={handleConnectEnd}
        onNodeClick={(_event, node) => {
          onSelectEdge(null);
          onSelectNode(node.id);
        }}
        onEdgeClick={(_event, edge) => {
          setSelectedNodeIds(new Set());
          onSelectEdge(edge.id);
        }}
        onEdgeDoubleClick={(event, edge) => {
          event.preventDefault();
          const instance = instanceRef.current;
          if (!instance) return;
          const clientPoint = { x: event.clientX, y: event.clientY };
          openQuickCreate(
            {
              context: "on_edge",
              edgeId: edge.id,
              position: instance.screenToFlowPosition(clientPoint),
            },
            clientPoint
          );
        }}
        onPaneClick={() => {
          setSelectedNodeIds(new Set());
          onSelectEdge(null);
          setQuickCreate(null);
        }}
        onNodeDragStart={(_event, node) => {
          const selected = new Set(
            (instanceRef.current?.getNodes() ?? [])
              .filter((candidate) => candidate.selected)
              .map((candidate) => candidate.id)
          );
          selected.add(node.id);
          pointerDraggingNodeIds.current = selected;
        }}
        onNodeDragStop={() => {
          const draggedNodeIds = pointerDraggingNodeIds.current;
          pointerDraggingNodeIds.current = new Set();
          const moves = (instanceRef.current?.getNodes() ?? [])
            .filter((candidate) => draggedNodeIds.has(candidate.id))
            .map((candidate) => ({
              nodeId: candidate.id,
              position: { x: snap(candidate.position.x), y: snap(candidate.position.y) },
            }));
          setNodes((current) =>
            current.map((candidate) => {
              const move = moves.find((entry) => entry.nodeId === candidate.id);
              return move ? { ...candidate, position: move.position } : candidate;
            })
          );
          if (moves.length === 1) {
            commitPosition(moves[0]!.nodeId, moves[0]!.position);
            return;
          }
          const command = buildWorkflowStudioMoveNodesCommand(moves);
          if (!command) return;
          for (const move of command.moves) {
            committedPositions.current.set(move.nodeId, `${move.position.x}:${move.position.y}`);
          }
          onCommand(command);
          setAnnouncement(`${command.moves.length} selected nodes moved together.`);
        }}
        isValidConnection={isValidConnection}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
          const edge = selectedEdges.at(-1);
          if (edge) {
            setSelectedNodeIds(new Set());
            if (edge.id !== selectedEdgeId) onSelectEdge(edge.id);
            return;
          }
          const nextNodeIds = new Set(selectedNodes.map((node) => node.id));
          setSelectedNodeIds((current) =>
            sameNodeSelection(current, nextNodeIds) ? current : nextNodeIds
          );
          const node = selectedNodes.at(-1);
          if (node && node.id !== selectedNodeId) {
            onSelectEdge(null);
            onSelectNode(node.id);
          }
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#d4d4d8" />
        {editable && (
          <Panel position="top-left" className="!m-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="flowcordia-open-quick-node-creator"
                className="nodrag nopan flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 focus-custom"
                onClick={openAtViewportCenter}
              >
                <PlusIcon className="size-4 text-[#e95745]" aria-hidden="true" />
                Add node
              </button>
              <button
                type="button"
                data-testid="flowcordia-arrange-workflow"
                className="nodrag nopan h-9 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 focus-custom"
                disabled={layoutBusy || graph.nodes.length < 2}
                aria-label="Arrange workflow left to right"
                title="Arrange the workflow as one undoable draft edit"
                onClick={() => void arrangeWorkflow()}
              >
                {layoutBusy ? "Arranging…" : "Arrange workflow"}
              </button>
              {selectedNodeIds.size > 0 && (
                <>
                  <button
                    type="button"
                    data-testid="flowcordia-duplicate-selection"
                    className="nodrag nopan h-9 rounded-lg border border-black/10 bg-white/95 px-3 text-xs font-medium text-zinc-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-black/20 hover:text-zinc-950 focus-custom"
                    onClick={() =>
                      submitDuplicate(selectedNodeIdsInGraphOrder(), nextDuplicateOffset())
                    }
                  >
                    Duplicate{" "}
                    {selectedNodeIds.size === 1 ? "node" : `${selectedNodeIds.size} nodes`}
                  </button>
                  <button
                    type="button"
                    data-testid="flowcordia-remove-selection"
                    className="nodrag nopan flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white/95 px-3 text-xs font-medium text-rose-700 shadow-[0_8px_28px_rgba(24,24,27,0.12)] transition hover:border-rose-300 hover:bg-rose-50 focus-custom"
                    onClick={requestNodeRemoval}
                  >
                    <Trash2Icon className="size-3.5" aria-hidden="true" />
                    Remove {selectedNodeIds.size === 1 ? "node" : `${selectedNodeIds.size} nodes`}
                  </button>
                </>
              )}
            </div>
          </Panel>
        )}
        <Controls
          showInteractive={false}
          position="top-right"
          className="!m-3 !overflow-hidden !rounded-lg !border !border-black/10 !bg-white/95 !shadow-[0_8px_28px_rgba(24,24,27,0.12)]"
        />
        <Panel position="top-right" className="!mr-[126px] !mt-3">
          <button
            type="button"
            className="h-8 rounded-lg border border-black/10 bg-white/95 px-2.5 font-mono text-[10px] text-zinc-500 shadow-[0_8px_28px_rgba(24,24,27,0.12)] hover:text-zinc-900 focus-custom"
            aria-label="Reset workflow canvas to 100 percent zoom"
            title="Reset canvas zoom"
            onClick={() => {
              void instanceRef.current?.fitView({
                duration: 180,
                minZoom: 1,
                maxZoom: 1,
                padding: 0.18,
              });
              setAnnouncement("Canvas viewport reset to 100 percent.");
            }}
          >
            100%
          </button>
        </Panel>
        {graph.nodes.length >= 8 && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={minimapNodeColor}
            nodeStrokeColor={(node) => (node.selected ? "#ff6d5a" : "#ffffff")}
            nodeStrokeWidth={3}
            maskColor="rgba(24,24,27,0.08)"
            className="!m-3 !rounded-lg !border !border-black/10 !bg-white/95 !shadow-[0_8px_28px_rgba(24,24,27,0.12)]"
          />
        )}
      </ReactFlow>
      {quickCreate && (
        <div
          className="absolute z-50"
          style={{ left: quickCreate.anchor.left, top: quickCreate.anchor.top }}
        >
          <WorkflowStudioQuickNodeCreator
            context={quickCreate.context as WorkflowStudioQuickCreateContext}
            disabled={!editable}
            onChoose={handleQuickChoose}
            onClose={() => setQuickCreate(null)}
          />
        </div>
      )}
      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Remove {pendingRemoval?.nodeIds.length ?? 0} selected node
              {(pendingRemoval?.nodeIds.length ?? 0) === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This removes {pendingRemoval?.nodeIds.length ?? 0} node
              {(pendingRemoval?.nodeIds.length ?? 0) === 1 ? "" : "s"} and{" "}
              {pendingRemoval?.edgeCount ?? 0} connected edge
              {(pendingRemoval?.edgeCount ?? 0) === 1 ? "" : "s"} from the current draft. The server
              will reject the operation if the resulting workflow is invalid. The accepted edit can
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary/small" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button
              data-testid="flowcordia-confirm-remove-selection"
              variant="danger/small"
              onClick={submitNodeRemoval}
            >
              Remove nodes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
