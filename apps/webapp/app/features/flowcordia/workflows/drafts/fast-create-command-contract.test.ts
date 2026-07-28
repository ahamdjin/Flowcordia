import { describe, expect, it } from "vitest";
import {
  WorkflowAddConnectedNodeCommand,
  WorkflowInsertNodeOnEdgeCommand,
} from "./fast-create-command-contract";

describe("fast creation draft command contracts", () => {
  it("accepts one bounded add-and-connect command", () => {
    expect(
      WorkflowAddConnectedNodeCommand.parse({
        type: "add_connected_node",
        templateId: "http_action",
        position: { x: 320, y: 160 },
        source: "manual_trigger",
        condition: "true",
      })
    ).toEqual({
      type: "add_connected_node",
      templateId: "http_action",
      position: { x: 320, y: 160 },
      source: "manual_trigger",
      condition: "true",
    });
  });

  it("accepts one bounded edge insertion command", () => {
    expect(
      WorkflowInsertNodeOnEdgeCommand.parse({
        type: "insert_node_on_edge",
        templateId: "wait",
        position: { x: 420, y: 220 },
        edgeId: "manual_trigger_to_output",
      })
    ).toEqual({
      type: "insert_node_on_edge",
      templateId: "wait",
      position: { x: 420, y: 220 },
      edgeId: "manual_trigger_to_output",
    });
  });

  it("rejects unknown fields, invalid identities, and unbounded positions", () => {
    expect(
      WorkflowAddConnectedNodeCommand.safeParse({
        type: "add_connected_node",
        templateId: "http_action",
        position: { x: 0, y: 0 },
        source: "Manual Trigger",
        browserOnly: true,
      }).success
    ).toBe(false);
    expect(
      WorkflowInsertNodeOnEdgeCommand.safeParse({
        type: "insert_node_on_edge",
        templateId: "wait",
        position: { x: 1_000_001, y: 0 },
        edgeId: "edge",
      }).success
    ).toBe(false);
  });
});
