import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowStudioCanvas } from "../../app/features/flowcordia/workflows/studio/WorkflowStudioCanvas";
import {
  FLOWCORDIA_CANVAS_FIT_MIN_SCALE,
  FLOWCORDIA_CANVAS_MAX_SCALE,
  FLOWCORDIA_CANVAS_MIN_SCALE,
  clampWorkflowStudioCanvasScale,
  fitWorkflowStudioCanvasViewport,
  orderedWorkflowStudioCanvasNodeIds,
  panWorkflowStudioCanvasViewport,
  workflowStudioCanvasDirectionalNode,
  zoomWorkflowStudioCanvasViewport,
} from "../../app/features/flowcordia/workflows/studio/canvas-navigation";
import type {
  WorkflowStudioGraph,
  WorkflowStudioNode,
} from "../../app/features/flowcordia/workflows/studio/presentation";

const nodes = [
  { id: "start", position: { x: 0, y: 0 } },
  { id: "right", position: { x: 240, y: 10 } },
  { id: "down", position: { x: 20, y: 180 } },
  { id: "diagonal", position: { x: 220, y: 160 } },
];

function studioNode(
  id: string,
  kind: WorkflowStudioNode["kind"],
  operation: string,
  x: number
): WorkflowStudioNode {
  return {
    id,
    name: id,
    kind,
    operation,
    ownership: "visual",
    position: { x, y: 0 },
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

function graph(): WorkflowStudioGraph {
  return {
    workflowId: "order_intake",
    name: "Order intake",
    description: null,
    schemaVersion: "0.1",
    labels: [],
    nodes: [
      studioNode("start", "trigger", "trigger.manual", 0),
      studioNode("request", "action", "action.http", 300),
      studioNode("output", "output", "output.return", 600),
    ],
    edges: [
      {
        id: "start_to_request",
        source: "start",
        target: "request",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
    ],
    source: {
      path: ".flowcordia/workflows/order_intake.json",
      commitSha: "a".repeat(40),
      blobSha: "b".repeat(40),
      requestedRevision: "a".repeat(40),
      sourceSchemaVersion: "0.1",
      appliedMigrations: [],
    },
  };
}

describe("Flowcordia canvas navigation", () => {
  it("clamps interactive zoom and preserves the world point under the anchor", () => {
    expect(clampWorkflowStudioCanvasScale(0.01)).toBe(FLOWCORDIA_CANVAS_MIN_SCALE);
    expect(clampWorkflowStudioCanvasScale(99)).toBe(FLOWCORDIA_CANVAS_MAX_SCALE);

    const next = zoomWorkflowStudioCanvasViewport({
      viewport: { scale: 1, x: -100, y: -50 },
      nextScale: 1.5,
      anchor: { x: 300, y: 200 },
    });
    expect(next).toEqual({ scale: 1.5, x: -300, y: -175 });
    expect((300 - next.x) / next.scale).toBe(400);
    expect((200 - next.y) / next.scale).toBe(250);
  });

  it("fits one bounded workflow and centers it inside the viewport", () => {
    const next = fitWorkflowStudioCanvasViewport({
      bounds: { x: 0, y: 0, width: 1200, height: 800 },
      viewport: { width: 1000, height: 700 },
      padding: 50,
    });
    expect(next.scale).toBeCloseTo(0.75);
    expect(next.x).toBeCloseTo(50);
    expect(next.y).toBeCloseTo(50);
  });

  it("uses an overview-only scale when a large workflow cannot fit at interactive zoom", () => {
    const next = fitWorkflowStudioCanvasViewport({
      bounds: { x: 0, y: 0, width: 20_000, height: 10_000 },
      viewport: { width: 1000, height: 700 },
      padding: 50,
    });
    expect(next.scale).toBe(FLOWCORDIA_CANVAS_FIT_MIN_SCALE);
    expect(next.x).toBe(0);
    expect(next.y).toBe(100);
  });

  it("pans without changing zoom", () => {
    expect(
      panWorkflowStudioCanvasViewport(
        { scale: 0.8, x: -20, y: 40 },
        { x: 15, y: -25 }
      )
    ).toEqual({ scale: 0.8, x: -5, y: 15 });
  });

  it("selects the nearest directional node deterministically", () => {
    expect(
      workflowStudioCanvasDirectionalNode({ nodes, currentId: "start", direction: "right" })
    ).toBe("right");
    expect(
      workflowStudioCanvasDirectionalNode({ nodes, currentId: "start", direction: "down" })
    ).toBe("down");
    expect(
      workflowStudioCanvasDirectionalNode({ nodes, currentId: "start", direction: "left" })
    ).toBeNull();
    expect(orderedWorkflowStudioCanvasNodeIds(nodes)).toEqual([
      "start",
      "right",
      "diagonal",
      "down",
    ]);
  });

  it("keeps directional navigation bounded across hundreds of nodes", () => {
    const large = Array.from({ length: 300 }, (_, index) => ({
      id: `node_${String(index).padStart(3, "0")}`,
      position: { x: (index % 30) * 240, y: Math.floor(index / 30) * 160 },
    }));
    expect(
      workflowStudioCanvasDirectionalNode({
        nodes: large,
        currentId: "node_000",
        direction: "right",
      })
    ).toBe("node_001");
    expect(
      workflowStudioCanvasDirectionalNode({
        nodes: large,
        currentId: "node_000",
        direction: "down",
      })
    ).toBe("node_030");
    expect(orderedWorkflowStudioCanvasNodeIds(large)).toHaveLength(300);
  });

  it("renders one named region, bounded instructions, node labels, and equivalent controls", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowStudioCanvas, {
        graph: graph(),
        liveNodes: [],
        selectedNodeId: "start",
        editable: true,
        onSelectNode: () => undefined,
        onMoveNode: () => undefined,
        onConnect: () => undefined,
      })
    );
    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-label="Workflow canvas for Order intake"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('aria-label="Fit workflow to canvas"');
    expect(markup).toContain(
      'aria-label="start. trigger node. trigger.manual. Position 0, 0. 0 incoming and 1 outgoing connections."'
    );
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('tabindex="-1"');
  });

  it("keeps keyboard, screen-reader, viewport, touch, and minimap ownership in the canvas", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );
    expect(source).toContain('role="region"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("workflowStudioCanvasDirectionalNode");
    expect(source).toContain('aria-label="Zoom in"');
    expect(source).toContain('aria-label="Fit workflow to canvas"');
    expect(source).toContain('data-testid="flowcordia-canvas-surface"');
    expect(source).toContain('style={{ touchAction: "none" }}');
    expect(source).toContain("Workflow minimap");
    expect(source).toContain("Hold Alt and press an arrow key");
    expect(source).not.toContain('tabIndex={-1}');
  });
});
