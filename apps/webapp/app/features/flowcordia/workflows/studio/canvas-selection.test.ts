import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioCrossWorkflowPasteCommand,
  buildWorkflowStudioDuplicateCommand,
  buildWorkflowStudioMoveNodesCommand,
  createWorkflowStudioNodeClipboardPayload,
  createWorkflowStudioNodeRemovalPlan,
  nextWorkflowStudioDuplicateOffset,
  parseWorkflowStudioNodeClipboardPayload,
  serializeWorkflowStudioNodeClipboardPayload,
} from "./canvas-selection";

const sourceIdentity = {
  workflowId: "reference_workflow",
  draftPublicId: "draft_reference_123",
  draftVersion: "7",
  documentSha256: "a".repeat(64),
};

describe("workflow canvas selection helpers", () => {
  it("serializes only exact source draft identity and canonical node identities", () => {
    const payload = createWorkflowStudioNodeClipboardPayload({
      ...sourceIdentity,
      nodeIds: ["http_action", "output", "http_action", "Not Valid"],
    });
    expect(payload).toEqual({
      version: 2,
      ...sourceIdentity,
      nodeIds: ["http_action", "output"],
    });
    expect(
      parseWorkflowStudioNodeClipboardPayload(serializeWorkflowStudioNodeClipboardPayload(payload!))
    ).toEqual(payload);
  });

  it("rejects browser documents, legacy payloads, stale identity shapes, and duplicates", () => {
    expect(
      parseWorkflowStudioNodeClipboardPayload(
        JSON.stringify({
          version: 2,
          ...sourceIdentity,
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
          nodeIds: ["http_action"],
        })
      )
    ).toBeNull();
    expect(
      parseWorkflowStudioNodeClipboardPayload(
        JSON.stringify({
          version: 2,
          ...sourceIdentity,
          documentSha256: "not-a-sha",
          nodeIds: ["http_action"],
        })
      )
    ).toBeNull();
    expect(
      parseWorkflowStudioNodeClipboardPayload(
        JSON.stringify({
          version: 2,
          ...sourceIdentity,
          nodeIds: ["http_action", "http_action"],
        })
      )
    ).toBeNull();
  });

  it("advances repeated duplicate and paste actions without stacking copies", () => {
    const offsets = Array.from({ length: 6 }, (_, index) =>
      nextWorkflowStudioDuplicateOffset({ currentStep: index, distance: 40 })
    );
    expect(offsets.map((entry) => entry.step)).toEqual([1, 2, 3, 4, 5, 1]);
    expect(offsets.map((entry) => entry.offset)).toEqual([
      { x: 40, y: 40 },
      { x: 80, y: 80 },
      { x: 120, y: 120 },
      { x: 160, y: 160 },
      { x: 200, y: 200 },
      { x: 40, y: 40 },
    ]);
  });

  it("builds bounded duplicate, cross-workflow paste, and grouped-move commands", () => {
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
      buildWorkflowStudioCrossWorkflowPasteCommand({
        payload: {
          version: 2,
          ...sourceIdentity,
          nodeIds: ["http_action", "output"],
        },
        offset: { x: 80, y: 80 },
      })
    ).toEqual({
      type: "paste_subgraph",
      sourceWorkflowId: "reference_workflow",
      sourceDraftPublicId: "draft_reference_123",
      sourceDraftVersion: "7",
      sourceDocumentSha256: "a".repeat(64),
      nodeIds: ["http_action", "output"],
      offset: { x: 80, y: 80 },
    });

    expect(
      buildWorkflowStudioMoveNodesCommand([
        { nodeId: "http_action", position: { x: 320, y: 180 } },
        { nodeId: "output", position: { x: 620, y: 180 } },
      ])
    ).toMatchObject({ type: "move_nodes" });
  });

  it("counts every incident edge while keeping deletion identity-only", () => {
    expect(
      createWorkflowStudioNodeRemovalPlan({
        nodeIds: ["http_action", "output", "http_action", "Not Valid"],
        edges: [
          { source: "manual_trigger", target: "http_action" },
          { source: "http_action", target: "output" },
          { source: "unselected_a", target: "unselected_b" },
        ],
      })
    ).toEqual({
      command: { type: "remove_nodes", nodeIds: ["http_action", "output"] },
      edgeCount: 2,
    });
  });
});
