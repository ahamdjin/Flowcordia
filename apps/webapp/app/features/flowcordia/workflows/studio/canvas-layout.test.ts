import { describe, expect, it } from "vitest";
import { buildWorkflowStudioAutoLayoutCommand } from "./canvas-layout";
import type { WorkflowStudioGraph, WorkflowStudioNode } from "./presentation";

function node(input: {
  id: string;
  kind: WorkflowStudioNode["kind"];
  operation: string;
  x: number;
  y: number;
}): WorkflowStudioNode {
  return {
    id: input.id,
    name: input.id,
    kind: input.kind,
    operation: input.operation,
    ownership: "visual",
    position: { x: input.x, y: input.y },
    configurationKeys: [],
    editableConfiguration: {},
    functionId: null,
    inputSchema: null,
    outputSchema: null,
    credentialReferences: [],
    runtime: null,
    codeReference: null,
  };
}

function sourceMetadata(path: string): WorkflowStudioGraph["source"] {
  return {
    path,
    commitSha: "a".repeat(40),
    blobSha: "b".repeat(40),
    requestedRevision: "main",
    sourceSchemaVersion: "0.1",
    appliedMigrations: [],
  };
}

function branchingGraph(): WorkflowStudioGraph {
  return {
    workflowId: "layout_reference",
    name: "Layout reference",
    description: null,
    schemaVersion: "0.1",
    labels: [],
    nodes: [
      node({ id: "manual_trigger", kind: "trigger", operation: "trigger.manual", x: 680, y: 420 }),
      node({ id: "condition", kind: "control", operation: "control.condition", x: 200, y: 100 }),
      node({ id: "true_action", kind: "action", operation: "action.http", x: 920, y: 120 }),
      node({ id: "false_action", kind: "action", operation: "action.http", x: 420, y: 580 }),
      node({ id: "output", kind: "output", operation: "output.return", x: 240, y: 340 }),
    ],
    edges: [
      {
        id: "manual_to_condition",
        source: "manual_trigger",
        target: "condition",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
      {
        id: "condition_true",
        source: "condition",
        target: "true_action",
        sourceHandle: "true",
        targetHandle: null,
        condition: "true",
      },
      {
        id: "condition_false",
        source: "condition",
        target: "false_action",
        sourceHandle: "false",
        targetHandle: null,
        condition: "false",
      },
      {
        id: "true_to_output",
        source: "true_action",
        target: "output",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
      {
        id: "false_to_output",
        source: "false_action",
        target: "output",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
    ],
    source: sourceMetadata(".flowcordia/workflows/layout-reference.json"),
  };
}

function chainGraph(nodeCount: number): WorkflowStudioGraph {
  return {
    workflowId: "large_layout_reference",
    name: "Large layout reference",
    description: null,
    schemaVersion: "0.1",
    labels: [],
    nodes: Array.from({ length: nodeCount }, (_, index) =>
      node({
        id: `node_${index}`,
        kind: index === 0 ? "trigger" : index === nodeCount - 1 ? "output" : "action",
        operation:
          index === 0 ? "trigger.manual" : index === nodeCount - 1 ? "output.return" : "action.http",
        x: (nodeCount - index) * 20,
        y: (index % 12) * 60,
      })
    ),
    edges: Array.from({ length: Math.max(0, nodeCount - 1) }, (_, index) => ({
      id: `edge_${index}`,
      source: `node_${index}`,
      target: `node_${index + 1}`,
      sourceHandle: null,
      targetHandle: null,
      condition: null,
    })),
    source: sourceMetadata(".flowcordia/workflows/large-layout-reference.json"),
  };
}

function positionsAfterLayout(
  graph: WorkflowStudioGraph,
  command: Awaited<ReturnType<typeof buildWorkflowStudioAutoLayoutCommand>>
): Map<string, { x: number; y: number }> {
  const positions = new Map(graph.nodes.map((entry) => [entry.id, { ...entry.position }]));
  for (const move of command?.moves ?? []) positions.set(move.nodeId, move.position);
  return positions;
}

describe("workflow canvas automatic layout", () => {
  it("uses ELK to arrange a branching workflow left to right on the existing grid", async () => {
    const graph = branchingGraph();
    const command = await buildWorkflowStudioAutoLayoutCommand({ graph });

    expect(command?.type).toBe("move_nodes");
    const positions = positionsAfterLayout(graph, command);
    const trigger = positions.get("manual_trigger")!;
    const condition = positions.get("condition")!;
    const trueAction = positions.get("true_action")!;
    const falseAction = positions.get("false_action")!;
    const output = positions.get("output")!;
    const positionedValues = [...positions.values()];

    expect(trigger.x).toBeLessThan(condition.x);
    expect(condition.x).toBeLessThan(trueAction.x);
    expect(condition.x).toBeLessThan(falseAction.x);
    expect(trueAction.x).toBeLessThan(output.x);
    expect(falseAction.x).toBeLessThan(output.x);
    expect(Math.min(...positionedValues.map((position) => position.x))).toBe(200);
    expect(Math.min(...positionedValues.map((position) => position.y))).toBe(100);
    for (const position of positionedValues) {
      expect(position.x % 20).toBe(0);
      expect(position.y % 20).toBe(0);
    }
  });

  it("arranges 300 nodes through one finite grid-aligned command", async () => {
    const graph = chainGraph(300);
    const command = await buildWorkflowStudioAutoLayoutCommand({ graph });

    expect(command?.type).toBe("move_nodes");
    expect(command?.moves.length).toBeGreaterThan(0);
    expect(command?.moves.length).toBeLessThanOrEqual(300);
    const positions = positionsAfterLayout(graph, command);
    expect(positions.size).toBe(300);
    expect(positions.get("node_0")!.x).toBeLessThan(positions.get("node_299")!.x);
    for (const position of positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
      expect(position.x % 20).toBe(0);
      expect(position.y % 20).toBe(0);
    }
  });

  it("does not create history for a graph that cannot be meaningfully arranged", async () => {
    const graph = branchingGraph();
    graph.nodes = [graph.nodes[0]!];
    graph.edges = [];

    await expect(buildWorkflowStudioAutoLayoutCommand({ graph })).resolves.toBeNull();
  });

  it("rejects invalid dimensions and oversized graphs before loading the engine", async () => {
    await expect(
      buildWorkflowStudioAutoLayoutCommand({ graph: branchingGraph(), gridSize: 0 })
    ).rejects.toThrow("positive finite numbers");
    await expect(buildWorkflowStudioAutoLayoutCommand({ graph: chainGraph(501) })).rejects.toThrow(
      "at most 500 nodes"
    );
  });
});
