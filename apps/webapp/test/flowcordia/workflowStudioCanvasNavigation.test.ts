import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_CANVAS_MAX_SCALE,
  FLOWCORDIA_CANVAS_MIN_SCALE,
  clampWorkflowStudioCanvasScale,
  fitWorkflowStudioCanvasViewport,
  orderedWorkflowStudioCanvasNodeIds,
  panWorkflowStudioCanvasViewport,
  workflowStudioCanvasDirectionalNode,
  zoomWorkflowStudioCanvasViewport,
} from "../../app/features/flowcordia/workflows/studio/canvas-navigation";

const nodes = [
  { id: "start", position: { x: 0, y: 0 } },
  { id: "right", position: { x: 240, y: 10 } },
  { id: "down", position: { x: 20, y: 180 } },
  { id: "diagonal", position: { x: 220, y: 160 } },
];

describe("Flowcordia canvas navigation", () => {
  it("clamps supported zoom and preserves the world point under the anchor", () => {
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
