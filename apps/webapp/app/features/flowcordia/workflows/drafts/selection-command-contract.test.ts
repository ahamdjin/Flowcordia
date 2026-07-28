import { describe, expect, it } from "vitest";
import {
  WorkflowDuplicateSubgraphCommand,
  WorkflowMoveNodesCommand,
} from "./selection-command-contract";

describe("workflow selection command contracts", () => {
  it("accepts bounded grouped movement and canonical duplication references", () => {
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
  });

  it("rejects duplicate identities, unknown fields, and unbounded coordinates", () => {
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
  });
});
