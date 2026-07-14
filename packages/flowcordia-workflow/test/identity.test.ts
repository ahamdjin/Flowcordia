import { describe, expect, it } from "vitest";

import { cloneWorkflow, validateWorkflowIdentityTransition } from "../src/index.js";
import { createValidWorkflow } from "./fixtures.js";

describe("validateWorkflowIdentityTransition", () => {
  it("allows presentation and configuration edits", () => {
    const previous = createValidWorkflow();
    const next = cloneWorkflow(previous);
    next.nodes[0]!.name = "Order received";
    next.nodes[0]!.position = { x: 100, y: 200 };
    next.nodes[0]!.configuration = { event: "order.received" };

    expect(validateWorkflowIdentityTransition(previous, next)).toEqual([]);
  });

  it("requires a new node ID when kind or operation changes", () => {
    const previous = createValidWorkflow();
    const next = cloneWorkflow(previous);
    next.nodes[0]!.operation = "webhook.receive";

    expect(validateWorkflowIdentityTransition(previous, next)).toContainEqual(
      expect.objectContaining({
        code: "identity_changed",
        path: ["nodes", 0, "id"],
        entity: { type: "node", id: "order_created" },
      })
    );
  });

  it("requires a new edge ID when a connection is rewired", () => {
    const previous = createValidWorkflow();
    const next = cloneWorkflow(previous);
    next.edges[0]!.sourceHandle = "success";

    expect(validateWorkflowIdentityTransition(previous, next)).toContainEqual(
      expect.objectContaining({
        code: "identity_changed",
        path: ["edges", 0, "id"],
        entity: { type: "edge", id: "created_to_notify" },
      })
    );
  });
});
