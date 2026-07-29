import { describe, expect, it } from "vitest";
import {
  WorkflowDuplicateSubgraphCommand,
  WorkflowMoveNodesCommand,
  WorkflowRemoveNodesCommand,
} from "./selection-command-contract";

describe("workflow selection command contracts", () => {
  it("accepts bounded grouped movement, duplication, and removal references", () => {
    expect(
      WorkflowMoveNodesCommand.parse({
        type: "move_nodes",
        moves: [
          { nodeId: "http_action", position: { x: 320, y: 180 } },
          { nodeId: "output", position: { x: 620, y: 180 } },
        ],
      })
    ).toMatchObject({ type: "move_nodes" });

    expect(
      WorkflowDuplicateSubgraphCommand.parse({
        type: "duplicate_subgraph",
        nodeIds: ["http_action", "output"],
        offset: { x: 40, y: 40 },
      })
    ).toEqual({
      type: "duplicate_subgraph",
      nodeIds: ["http_action", "output"],
      offset: { x: 40, y: 40 },
    });

    expect(
      WorkflowRemoveNodesCommand.parse({
        type: "remove_nodes",
        nodeIds: ["http_action", "output"],
      })
    ).toEqual({ type: "remove_nodes", nodeIds: ["http_action", "output"] });
  });

  it("accepts one atomic 300-node layout while rejecting oversized position batches", () => {
    const moves = Array.from({ length: 300 }, (_, index) => ({
      nodeId: `node_${index}`,
      position: { x: index * 20, y: (index % 10) * 20 },
    }));
    expect(WorkflowMoveNodesCommand.safeParse({ type: "move_nodes", moves }).success).toBe(true);
    expect(
      WorkflowMoveNodesCommand.safeParse({
        type: "move_nodes",
        moves: Array.from({ length: 501 }, (_, index) => ({
          nodeId: `node_${index}`,
          position: { x: index * 20, y: 0 },
        })),
      }).success
    ).toBe(false);
  });

  it("rejects duplicate identities, unknown fields, oversized selection, and unbounded coordinates", () => {
    expect(
      WorkflowMoveNodesCommand.safeParse({
        type: "move_nodes",
        moves: [
          { nodeId: "http_action", position: { x: 0, y: 0 } },
          { nodeId: "http_action", position: { x: 40, y: 40 } },
        ],
      }).success
    ).toBe(false);

    expect(
      WorkflowDuplicateSubgraphCommand.safeParse({
        type: "duplicate_subgraph",
        nodeIds: ["http_action", "http_action"],
        offset: { x: 1_000_001, y: 0 },
        browserDocument: {},
      }).success
    ).toBe(false);

    expect(
      WorkflowRemoveNodesCommand.safeParse({
        type: "remove_nodes",
        nodeIds: ["http_action", "http_action"],
      }).success
    ).toBe(false);
    expect(
      WorkflowRemoveNodesCommand.safeParse({
        type: "remove_nodes",
        nodeIds: Array.from({ length: 101 }, (_, index) => `node_${index}`),
      }).success
    ).toBe(false);
    expect(
      WorkflowRemoveNodesCommand.safeParse({
        type: "remove_nodes",
        nodeIds: ["http_action"],
        browserDocument: {},
      }).success
    ).toBe(false);
  });
});
