import type { WorkflowDefinition } from "../src/index.js";

export function createValidWorkflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "order_intake",
    name: "Order intake",
    nodes: [
      {
        id: "order_created",
        kind: "trigger",
        operation: "event.receive",
        position: { x: 0, y: 0 },
        configuration: { event: "order.created" },
      },
      {
        id: "notify_team",
        kind: "action",
        operation: "slack.send-message",
        position: { x: 320, y: 0 },
        configuration: { channel: "orders" },
      },
    ],
    edges: [
      {
        id: "created_to_notify",
        source: "order_created",
        target: "notify_team",
      },
    ],
  };
}
