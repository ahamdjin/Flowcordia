export const FLOWCORDIA_CANVAS_FIT_MIN_SCALE = 0.01;
export const FLOWCORDIA_CANVAS_MIN_SCALE = 0.2;
export const FLOWCORDIA_CANVAS_MAX_SCALE = 1.8;
export const FLOWCORDIA_CANVAS_SCALE_STEP = 0.1;

export interface WorkflowStudioCanvasViewport {
  scale: number;
  x: number;
  y: number;
}

export interface WorkflowStudioCanvasSize {
  width: number;
  height: number;
}

export interface WorkflowStudioCanvasBounds extends WorkflowStudioCanvasSize {
  x: number;
  y: number;
}

export interface WorkflowStudioCanvasPoint {
  x: number;
  y: number;
}

export type WorkflowStudioCanvasDirection = "left" | "right" | "up" | "down";

export interface WorkflowStudioCanvasNavigableNode {
  id: string;
  position: WorkflowStudioCanvasPoint;
}

export function clampWorkflowStudioCanvasScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(FLOWCORDIA_CANVAS_MAX_SCALE, Math.max(FLOWCORDIA_CANVAS_MIN_SCALE, value));
}

export function zoomWorkflowStudioCanvasViewport(input: {
  viewport: WorkflowStudioCanvasViewport;
  nextScale: number;
  anchor: WorkflowStudioCanvasPoint;
}): WorkflowStudioCanvasViewport {
  const currentScale = Number.isFinite(input.viewport.scale)
    ? Math.min(
        FLOWCORDIA_CANVAS_MAX_SCALE,
        Math.max(FLOWCORDIA_CANVAS_FIT_MIN_SCALE, input.viewport.scale)
      )
    : 1;
  const nextScale = clampWorkflowStudioCanvasScale(input.nextScale);
  const worldX = (input.anchor.x - input.viewport.x) / currentScale;
  const worldY = (input.anchor.y - input.viewport.y) / currentScale;
  return {
    scale: nextScale,
    x: input.anchor.x - worldX * nextScale,
    y: input.anchor.y - worldY * nextScale,
  };
}

export function fitWorkflowStudioCanvasViewport(input: {
  bounds: WorkflowStudioCanvasBounds;
  viewport: WorkflowStudioCanvasSize;
  padding?: number;
}): WorkflowStudioCanvasViewport {
  const padding = Math.max(0, input.padding ?? 32);
  const availableWidth = Math.max(1, input.viewport.width - padding * 2);
  const availableHeight = Math.max(1, input.viewport.height - padding * 2);
  const width = Math.max(1, input.bounds.width);
  const height = Math.max(1, input.bounds.height);
  const scale = Math.min(
    FLOWCORDIA_CANVAS_MAX_SCALE,
    Math.max(
      FLOWCORDIA_CANVAS_FIT_MIN_SCALE,
      Math.min(availableWidth / width, availableHeight / height)
    )
  );
  return {
    scale,
    x: (input.viewport.width - width * scale) / 2 - input.bounds.x * scale,
    y: (input.viewport.height - height * scale) / 2 - input.bounds.y * scale,
  };
}

export function panWorkflowStudioCanvasViewport(
  viewport: WorkflowStudioCanvasViewport,
  delta: WorkflowStudioCanvasPoint
): WorkflowStudioCanvasViewport {
  return {
    ...viewport,
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
  };
}

export function orderedWorkflowStudioCanvasNodeIds(
  nodes: readonly WorkflowStudioCanvasNavigableNode[]
): string[] {
  return [...nodes]
    .sort(
      (left, right) =>
        left.position.y - right.position.y ||
        left.position.x - right.position.x ||
        left.id.localeCompare(right.id)
    )
    .map((node) => node.id);
}

function directionalDistance(input: {
  direction: WorkflowStudioCanvasDirection;
  current: WorkflowStudioCanvasPoint;
  candidate: WorkflowStudioCanvasPoint;
}): { primary: number; secondary: number } | null {
  const dx = input.candidate.x - input.current.x;
  const dy = input.candidate.y - input.current.y;
  switch (input.direction) {
    case "left":
      return dx < 0 ? { primary: -dx, secondary: Math.abs(dy) } : null;
    case "right":
      return dx > 0 ? { primary: dx, secondary: Math.abs(dy) } : null;
    case "up":
      return dy < 0 ? { primary: -dy, secondary: Math.abs(dx) } : null;
    case "down":
      return dy > 0 ? { primary: dy, secondary: Math.abs(dx) } : null;
  }
}

export function workflowStudioCanvasDirectionalNode(input: {
  nodes: readonly WorkflowStudioCanvasNavigableNode[];
  currentId: string;
  direction: WorkflowStudioCanvasDirection;
}): string | null {
  const current = input.nodes.find((node) => node.id === input.currentId);
  if (!current) return null;
  return (
    input.nodes
      .flatMap((candidate) => {
        if (candidate.id === current.id) return [];
        const distance = directionalDistance({
          direction: input.direction,
          current: current.position,
          candidate: candidate.position,
        });
        if (!distance) return [];
        return [{ candidate, ...distance }];
      })
      .sort(
        (left, right) =>
          left.primary + left.secondary * 2 - (right.primary + right.secondary * 2) ||
          left.secondary - right.secondary ||
          left.primary - right.primary ||
          left.candidate.id.localeCompare(right.candidate.id)
      )[0]?.candidate.id ?? null
  );
}
