import type { WorkflowEditCommand } from "@flowcordia/workflow";
import type { WorkflowStudioGraph } from "./presentation";

const DEFAULT_NODE_WIDTH = 216;
const DEFAULT_NODE_HEIGHT = 104;
const DEFAULT_GRID_SIZE = 20;

type MoveNodesCommand = Extract<WorkflowEditCommand, { type: "move_nodes" }>;

type ElkPositionedChild = {
  id: string;
  x?: number;
  y?: number;
};

function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export async function buildWorkflowStudioAutoLayoutCommand(input: {
  graph: WorkflowStudioGraph;
  nodeWidth?: number;
  nodeHeight?: number;
  gridSize?: number;
}): Promise<MoveNodesCommand | null> {
  if (input.graph.nodes.length < 2) return null;

  const nodeWidth = input.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const nodeHeight = input.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const gridSize = input.gridSize ?? DEFAULT_GRID_SIZE;
  if (
    !Number.isFinite(nodeWidth) ||
    nodeWidth <= 0 ||
    !Number.isFinite(nodeHeight) ||
    nodeHeight <= 0 ||
    !Number.isFinite(gridSize) ||
    gridSize <= 0
  ) {
    throw new RangeError("Workflow layout dimensions and grid size must be positive finite numbers.");
  }

  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  const layout = (await elk.layout({
    id: "flowcordia-workflow",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "80",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.padding": "[top=40,left=40,bottom=40,right=40]",
    },
    children: input.graph.nodes.map((node) => ({
      id: node.id,
      width: nodeWidth,
      height: nodeHeight,
    })),
    edges: input.graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  })) as { children?: ElkPositionedChild[] };

  const positionedChildren = layout.children ?? [];
  if (positionedChildren.length !== input.graph.nodes.length) {
    throw new Error("ELK did not return a position for every workflow node.");
  }

  const positions = new Map(
    positionedChildren.map((child) => {
      if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) {
        throw new Error(`ELK returned an invalid position for node "${child.id}".`);
      }
      return [child.id, { x: child.x!, y: child.y! }] as const;
    })
  );
  const layoutMinX = Math.min(...positions.values().map((position) => position.x));
  const layoutMinY = Math.min(...positions.values().map((position) => position.y));
  const anchorX = Math.min(...input.graph.nodes.map((node) => node.position.x));
  const anchorY = Math.min(...input.graph.nodes.map((node) => node.position.y));

  const moves = input.graph.nodes
    .map((node) => {
      const position = positions.get(node.id);
      if (!position) throw new Error(`ELK omitted workflow node "${node.id}".`);
      return {
        nodeId: node.id,
        position: {
          x: snap(anchorX + position.x - layoutMinX, gridSize),
          y: snap(anchorY + position.y - layoutMinY, gridSize),
        },
      };
    })
    .filter(
      (move) =>
        input.graph.nodes.find((node) => node.id === move.nodeId)?.position.x !== move.position.x ||
        input.graph.nodes.find((node) => node.id === move.nodeId)?.position.y !== move.position.y
    );

  return moves.length === 0 ? null : { type: "move_nodes", moves };
}
