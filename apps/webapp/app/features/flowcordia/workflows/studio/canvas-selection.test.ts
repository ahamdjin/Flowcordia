import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioDuplicateCommand,
  buildWorkflowStudioMoveNodesCommand,
  createWorkflowStudioNodeClipboardPayload,
  parseWorkflowStudioNodeClipboardPayload,
  serializeWorkflowStudioNodeClipboardPayload,
} from "./canvas-selection";

describe("workflow canvas selection helpers", () => {
  it("serializes only a workflow identity and canonical node identities", () => {
    const payload = createWorkflowStudioNodeClipboardPayload({
      workflowId: "reference_workflow",
      nodeIds: ["http_action", "output", "http_action", "Not Valid"],
    });
    expect(payload).toEqual({
      version: 1,
      workflowId: "reference_workflow",
      nodeIds: ["http_action", "output"],
    });
    expect(
      parseWorkflowStudioNodeClipboardPayload(serializeWorkflowStudioNodeClipboardPayload(payload!))
    ).toEqual(payload);
  });

  it("rejects browser-supplied workflow documents and malformed clipboard payloads", () => {
    expect(
      parseWorkflowStudioNodeClipboardPayload(
        JSON.stringify({
          version: 1,
          workflowId: "reference_workflow",
          nodeIds: ["http_action"],
          workflow: { nodes: [] },
        })
      )
    ).toBeNull();
    expect(
      parseWorkflowStudioNodeClipboardPayload(
        JSON.stringify({
          version: 1,
          workflowId: "reference_workflow",
          nodeIds: ["http_action", "http_action"],
        })
      )
    ).toBeNull();
  });

  it("builds bounded duplicate and grouped-move commands", () => {
    expect(
      buildWorkflowStudioDuplicateCommand({
        nodeIds: ["http_action", "output"],
        offset: { x: 40, y: 40 },
      })
    ).toEqual({
      type: "duplicate_subgraph",
      nodeIds: ["http_action", "output"],
      offset: { x: 40, y: 40 },
    });

    expect(
      buildWorkflowStudioMoveNodesCommand([
        { nodeId: "http_action", position: { x: 320, y: 180 } },
        { nodeId: "output", position: { x: 620, y: 180 } },
      ])
    ).toMatchObject({ type: "move_nodes" });
  });
});
