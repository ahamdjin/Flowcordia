import { describe, expect, it } from "vitest";
import {
  applyWorkflowEdit,
  buildFlowcordiaApiTriggerRequest,
  parseFlowcordiaApiTriggerConfiguration,
  type WorkflowDefinition,
} from "../src/index.js";

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "api_orders",
    name: "API orders",
    nodes: [
      {
        id: "api",
        kind: "trigger",
        operation: "trigger.api",
        position: { x: 0, y: 0 },
        configuration: {},
      },
      {
        id: "output",
        kind: "output",
        operation: "output.return",
        position: { x: 280, y: 0 },
        configuration: {},
      },
    ],
    edges: [{ id: "api_to_output", source: "api", target: "output" }],
  };
}

describe("Flowcordia API trigger controls", () => {
  it("normalizes legacy empty configuration to safe defaults", () => {
    expect(parseFlowcordiaApiTriggerConfiguration({})).toEqual({
      success: true,
      configuration: {
        requireIdempotencyKey: true,
        idempotencyKeyTTLSeconds: 86_400,
        queueTTLSeconds: 3_600,
      },
    });
  });

  it("builds exact native task request options", () => {
    expect(
      buildFlowcordiaApiTriggerRequest({
        configuration: {
          requireIdempotencyKey: true,
          idempotencyKeyTTLSeconds: 7_200,
          queueTTLSeconds: 900,
        },
        payload: { orderId: "ord_123" },
        idempotencyKey: "order-ord_123",
      })
    ).toEqual({
      success: true,
      configuration: {
        requireIdempotencyKey: true,
        idempotencyKeyTTLSeconds: 7_200,
        queueTTLSeconds: 900,
      },
      request: {
        payload: { orderId: "ord_123" },
        options: {
          idempotencyKey: "order-ord_123",
          idempotencyKeyTTL: "7200s",
          ttl: "900s",
        },
      },
    });
  });

  it("fails closed for missing keys, unsafe TTLs, and unknown fields", () => {
    expect(
      buildFlowcordiaApiTriggerRequest({
        configuration: {},
        payload: {},
      })
    ).toMatchObject({ success: false, issues: [{ path: "idempotencyKey" }] });
    expect(
      parseFlowcordiaApiTriggerConfiguration({
        requireIdempotencyKey: true,
        idempotencyKeyTTLSeconds: 59,
        queueTTLSeconds: 1_209_601,
      })
    ).toMatchObject({ success: false });
    expect(parseFlowcordiaApiTriggerConfiguration({ mode: "payload-hash" })).toMatchObject({
      success: false,
      issues: [{ path: "mode" }],
    });
  });

  it("persists only normalized API trigger configuration through the portable editor", () => {
    expect(
      applyWorkflowEdit(workflow(), {
        type: "set_node_configuration",
        nodeId: "api",
        configuration: {
          requireIdempotencyKey: false,
          idempotencyKeyTTLSeconds: 600,
          queueTTLSeconds: 300,
        },
      })
    ).toMatchObject({
      success: true,
      workflow: {
        nodes: [
          expect.objectContaining({
            id: "api",
            configuration: {
              requireIdempotencyKey: false,
              idempotencyKeyTTLSeconds: 600,
              queueTTLSeconds: 300,
            },
          }),
          expect.anything(),
        ],
      },
    });
  });
});
