import type { WorkflowEditCommand } from "@flowcordia/workflow";
import { useEffect, useMemo, useState } from "react";
import {
  buildWorkflowStudioCanvasReplaceEdgeCommand,
  workflowStudioCanvasEdgeConditionOptions,
  workflowStudioCanvasEdgeLabel,
  workflowStudioCanvasEdgeTargetOptions,
  type WorkflowStudioCanvasEdge,
  type WorkflowStudioCanvasEdgeCondition,
} from "./canvas-edges";
import type { WorkflowStudioGraph } from "./presentation";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition focus:border-indigo-400";
const actionClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-3 py-2 text-xs font-medium text-text-bright transition hover:border-text-dimmed hover:bg-background-bright focus-custom disabled:cursor-not-allowed disabled:opacity-50";

export function WorkflowStudioEdgeInspector({
  graph,
  edge,
  editable,
  busy,
  onCommand,
}: {
  graph: WorkflowStudioGraph;
  edge: WorkflowStudioCanvasEdge;
  editable: boolean;
  busy: boolean;
  onCommand: (command: WorkflowEditCommand) => void;
}) {
  const [targetId, setTargetId] = useState(edge.target);
  const [condition, setCondition] = useState<WorkflowStudioCanvasEdgeCondition>(
    edge.condition === "true" || edge.condition === "false" ? edge.condition : null
  );

  useEffect(() => {
    setTargetId(edge.target);
    setCondition(edge.condition === "true" || edge.condition === "false" ? edge.condition : null);
  }, [edge.condition, edge.id, edge.target]);

  const conditionOptions = useMemo(
    () => workflowStudioCanvasEdgeConditionOptions({ graph, edgeId: edge.id, targetId }),
    [edge.id, graph, targetId]
  );
  const targetOptions = useMemo(
    () => workflowStudioCanvasEdgeTargetOptions({ graph, edgeId: edge.id, condition }),
    [condition, edge.id, graph]
  );
  const result = useMemo(
    () =>
      buildWorkflowStudioCanvasReplaceEdgeCommand({
        graph,
        edgeId: edge.id,
        targetId,
        condition,
      }),
    [condition, edge.id, graph, targetId]
  );
  const source = graph.nodes.find((node) => node.id === edge.source);
  const changed = targetId !== edge.target || condition !== (edge.condition ?? null);

  return (
    <div className="p-4" data-testid="flowcordia-edge-inspector" data-edge-id={edge.id}>
      <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
        Connection
      </div>
      <h3 className="mt-1 text-base font-medium text-text-bright">
        {workflowStudioCanvasEdgeLabel(graph, edge.id)}
      </h3>
      <div className="mt-1 break-all font-mono text-xs text-text-dimmed">{edge.id}</div>

      <div className="mt-5 space-y-4">
        <div>
          <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
            Source
          </div>
          <div className="mt-1 text-xs text-text-bright">
            {source?.name ?? edge.source}{" "}
            <span className="font-mono text-text-dimmed">({edge.source})</span>
          </div>
          <p className="mt-1 text-xxs leading-4 text-text-dimmed">
            The source is fixed during an atomic edge edit. Remove this edge and create another one
            to change its source.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
            Target
          </span>
          <select
            className={inputClassName}
            value={targetId}
            disabled={!editable || busy}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {targetOptions.map((option) => (
              <option key={option.id} value={option.id} disabled={!option.eligible}>
                {option.label}
                {option.eligible ? "" : " — unavailable"}
              </option>
            ))}
          </select>
        </label>

        {conditionOptions.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-xxs font-medium uppercase tracking-wide text-text-dimmed">
              Condition branch
            </span>
            <select
              className={inputClassName}
              value={condition ?? ""}
              disabled={!editable || busy}
              onChange={(event) => setCondition(event.target.value === "true" ? "true" : "false")}
            >
              {conditionOptions.map((option) => (
                <option
                  key={option.condition ?? "ordinary"}
                  value={option.condition ?? ""}
                  disabled={!option.eligible}
                >
                  {option.label}
                  {option.eligible ? "" : " — unavailable"}
                </option>
              ))}
            </select>
          </label>
        )}

        {!result.success && (
          <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xxs leading-4 text-rose-200">
            {result.message}
          </div>
        )}

        {editable && (
          <div className="space-y-2 rounded-md border border-grid-dimmed bg-background-bright p-3">
            <button
              type="button"
              data-testid="flowcordia-save-edge"
              className={actionClassName}
              disabled={busy || !changed || !result.success}
              onClick={() => result.success && onCommand(result.command)}
            >
              Save connection
            </button>
            <button
              type="button"
              data-testid="flowcordia-remove-edge"
              className={actionClassName}
              disabled={busy}
              onClick={() => onCommand({ type: "remove_edge", edgeId: edge.id })}
            >
              Remove connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
