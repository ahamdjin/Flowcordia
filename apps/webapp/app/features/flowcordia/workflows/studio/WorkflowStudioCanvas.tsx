import type { WorkflowEditCommand } from "@flowcordia/workflow";
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
  type OnReconnect,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/utils/cn";
import type { FlowcordiaLiveNodeState } from "../preview/presentation";
import { workflowStudioCanvasSourceHandles } from "./canvas-connections";
import { workflowStudioCanvasEdgeLabel } from "./canvas-edges";
import {
  buildWorkflowStudioReactFlowConnectionCommand,
  buildWorkflowStudioReactFlowReconnectCommand,
} from "./canvas-react-flow";
import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";

const NODE_WIDTH = 216;
const NODE_HEIGHT = 104;
const GRID_SIZE = 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

type ConnectCommand = Extract<WorkflowEditCommand, { type: "connect_nodes" }>;
type ReplaceEdgeCommand = Extract<WorkflowEditCommand, { type: "replace_edge" }>;

type CanvasNodeData = {
  node: WorkflowStudioNode;
  liveNode: FlowcordiaLiveNodeState | undefined;
  incoming: number;
  outgoing: number;
  editable: boolean;
  sourceHandles: ReturnType<typeof workflowStudioCanvasSourceHandles>;
};

type CanvasNode = Node<CanvasNodeData, "flowcordia">;
type CanvasEdgeData = { condition: "true" | "false" | null };
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

function FlowcordiaCanvasNode({ data, selected }: NodeProps<CanvasNode>) {
  const { node, liveNode } = data;
  return (
    <div
      data-canvas-node={node.id}
      className={cn(
        "relative h-[104px] w-[216px] select-none rounded-[10px] border bg-white p-3 text-left text-zinc-800 shadow-[0_2px_8px_rgba(24,24,27,0.08)] transition duration-150",
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
      {props.data?.condition && (
        <EdgeLabelRenderer>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded border border-black/10 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500 shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {props.data.condition}
          </span>
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
  selectedNodeId,
  editable,
}: {
  graph: WorkflowStudioGraph;
  liveNodesById: ReadonlyMap<string, FlowcordiaLiveNodeState>;
  selectedNodeId: string | null;
  editable: boolean;
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
      selected: selectedNodeId === node.id,
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
      },
    };
  });
}

function buildEdges({
  graph,
  selectedEdgeId,
  editable,
}: {
  graph: WorkflowStudioGraph;
  selectedEdgeId: string | null;
  editable: boolean;
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
      data: { condition },
    };
  });
}

export function WorkflowStudioCanvas({
  graph,
  liveNodes,
  selectedNodeId,
  selectedEdgeId,
  editable,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onConnect,
  onRemoveEdge,
}: {
  graph: WorkflowStudioGraph;
  liveNodes: FlowcordiaLiveNodeState[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  editable: boolean;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string | null) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onConnect: (command: ConnectCommand | ReplaceEdgeCommand) => void;
  onRemoveEdge: (edgeId: string) => void;
}) {
  const instanceRef = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);
  const pointerDraggingNodeIds = useRef(new Set<string>());
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
  const initialNodes = useMemo(
    () => buildNodes({ graph, liveNodesById, selectedNodeId, editable }),
    [editable, graph, liveNodesById, selectedNodeId]
  );
  const initialEdges = useMemo(
    () => buildEdges({ graph, selectedEdgeId, editable }),
    [editable, graph, selectedEdgeId]
  );
  const [nodes, setNodes, applyNodeChanges] = useNodesState<CanvasNode>(initialNodes);
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<CanvasEdge>(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    committedPositions.current = new Map(
      graph.nodes.map((node) => [node.id, `${node.position.x}:${node.position.y}`])
    );
  }, [graph.nodes, initialNodes, setNodes]);

  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges]);

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
      onConnect(result.command);
      setAnnouncement(`Connected ${result.command.source} to ${result.command.target}.`);
    },
    [graph, onConnect]
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
      onConnect(result.command);
      setAnnouncement(`Connection ${edge.id} now targets ${result.command.target}.`);
    },
    [graph, onConnect]
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTextEntryElement(event.target) || !editable) return;
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
    if (selectedNodeId) {
      event.preventDefault();
      event.stopPropagation();
      setAnnouncement("Remove the selected node from its inspector.");
    }
  };

  return (
    <div
      role="region"
      aria-label={`Workflow canvas for ${graph.name}`}
      aria-describedby="flowcordia-canvas-instructions"
      className="relative h-full overflow-hidden bg-[#f7f7f8] text-[#242428] outline-none"
      onKeyDownCapture={handleKeyDown}
    >
      <p id="flowcordia-canvas-instructions" className="sr-only">
        Tab through nodes and connections. Press Enter or Space to select. Use arrow keys to move a
        selected editable node, and hold Shift for a larger step. Drag a source handle to an
        eligible target handle to connect nodes. Drag the target end of a selected connection to
        reconnect it. Press Delete or Backspace to remove the selected writable connection. Remove
        nodes from the inspector. Use the canvas controls to zoom and fit the workflow; trackpad,
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
        selectionOnDrag
        panOnDrag={[0, 1]}
        panOnScroll
        zoomOnPinch
        zoomOnScroll
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
        onNodeClick={(_event, node) => {
          onSelectEdge(null);
          onSelectNode(node.id);
        }}
        onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}
        onPaneClick={() => onSelectEdge(null)}
        onNodeDragStart={(_event, node) => pointerDraggingNodeIds.current.add(node.id)}
        onNodeDragStop={(_event, node) => {
          pointerDraggingNodeIds.current.delete(node.id);
          setNodes((current) =>
            current.map((candidate) =>
              candidate.id === node.id
                ? {
                    ...candidate,
                    position: { x: snap(node.position.x), y: snap(node.position.y) },
                  }
                : candidate
            )
          );
          commitPosition(node.id, node.position);
        }}
        isValidConnection={isValidConnection}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
          const edge = selectedEdges.at(-1);
          if (edge && edge.id !== selectedEdgeId) {
            onSelectEdge(edge.id);
            return;
          }
          const node = selectedNodes.at(-1);
          if (node && node.id !== selectedNodeId) {
            onSelectEdge(null);
            onSelectNode(node.id);
          }
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#d4d4d8" />
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
      </ReactFlow>
    </div>
  );
}
