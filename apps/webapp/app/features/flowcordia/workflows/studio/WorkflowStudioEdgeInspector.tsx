import type { WorkflowEditCommand } from "@flowcordia/workflow";
import { ArrowRightIcon, GitBranchIcon, SaveIcon, SplitIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "~/utils/cn";
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
  "h-9 w-full rounded-md border border-[#34343b] bg-[#111113] px-3 text-xs text-text-bright outline-none transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-55";

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
  const target = graph.nodes.find((node) => node.id === targetId);
  const changed = targetId !== edge.target || condition !== (edge.condition ?? null);

  return (
    <section
      className="border-t border-[#29292f] bg-[#141416]"
      data-testid="flowcordia-edge-inspector"
      data-edge-id={edge.id}
    >
      <header className="border-b border-[#29292f] px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
              <GitBranchIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xxs font-semibold uppercase tracking-[0.12em] text-text-dimmed">
                Connection
              </div>
              <h3 className="mt-1 truncate text-sm font-semibold text-text-bright">
                {workflowStudioCanvasEdgeLabel(graph, edge.id)}
              </h3>
            </div>
          </div>
          <span className="rounded-full border border-[#3a3a42] bg-[#19191c] px-2 py-0.5 font-mono text-[9px] text-text-dimmed">
            {edge.id}
          </span>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-[#303037] bg-[#111113] p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dimmed">
            <SplitIcon className="size-3.5" />
            Route preview
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-2">
            <div className="min-w-0 rounded-md border border-[#34343b] bg-[#19191c] px-2.5 py-2">
              <div className="truncate text-xs font-medium text-text-bright">
                {source?.name ?? edge.source}
              </div>
              <div className="mt-0.5 truncate font-mono text-[9px] text-text-dimmed">
                {edge.source}
              </div>
            </div>
            <span className="grid size-7 place-items-center rounded-full border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
              <ArrowRightIcon className="size-3.5" />
            </span>
            <div className="min-w-0 rounded-md border border-[#34343b] bg-[#19191c] px-2.5 py-2">
              <div className="truncate text-xs font-medium text-text-bright">
                {target?.name ?? targetId}
              </div>
              <div className="mt-0.5 truncate font-mono text-[9px] text-text-dimmed">
                {targetId}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-text-dimmed">
            The source remains fixed during an atomic edge edit. Create a new connection to change
            the source node.
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dimmed">
            Target node
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
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dimmed">
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

        <div
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-xxs leading-4",
            result.success
              ? changed
                ? "border-blue-500/20 bg-blue-500/[0.07] text-blue-100"
                : "border-[#303037] bg-[#19191c] text-text-dimmed"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          )}
        >
          {result.success
            ? changed
              ? "This connection has unsaved routing changes."
              : "This connection matches the current workflow draft."
            : result.message}
        </div>
      </div>

      {editable && (
        <footer className="grid grid-cols-2 gap-2 border-t border-[#29292f] bg-[#111113] p-3">
          <button
            type="button"
            data-testid="flowcordia-save-edge"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-indigo-400/25 bg-indigo-500 px-2.5 text-xxs font-medium text-white transition hover:bg-indigo-400 focus-custom disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !changed || !result.success}
            onClick={() => result.success && onCommand(result.command)}
          >
            <SaveIcon className="size-3.5" />
            Save connection
          </button>
          <button
            type="button"
            data-testid="flowcordia-remove-edge"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-rose-500/25 bg-rose-500/[0.07] px-2.5 text-xxs font-medium text-rose-200 transition hover:bg-rose-500/15 focus-custom disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={() => onCommand({ type: "remove_edge", edgeId: edge.id })}
          >
            <Trash2Icon className="size-3.5" />
            Remove
          </button>
        </footer>
      )}
    </section>
  );
}
