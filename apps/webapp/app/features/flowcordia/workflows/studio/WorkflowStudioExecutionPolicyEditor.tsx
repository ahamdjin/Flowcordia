import type { WorkflowRuntimePolicy } from "@flowcordia/workflow";
import { Clock3Icon, CpuIcon, RefreshCwIcon, SaveIcon, ServerIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import {
  buildWorkflowStudioExecutionPolicy,
  createWorkflowStudioExecutionPolicyDraft,
  FLOWCORDIA_MACHINE_PRESETS,
  type WorkflowStudioExecutionPolicyDraft,
} from "./execution-policy";
import type { WorkflowStudioNode } from "./presentation";

const inputClassName =
  "h-9 w-full rounded-md border border-[#34343b] bg-[#111113] px-3 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-55";

function runtimeFingerprint(value: WorkflowRuntimePolicy | null): string {
  return JSON.stringify(value ?? null);
}

export function WorkflowStudioExecutionPolicyEditor({
  node,
  busy,
  onSave,
}: {
  node: WorkflowStudioNode;
  busy: boolean;
  onSave: (runtime: WorkflowRuntimePolicy | null) => void;
}) {
  const [draft, setDraft] = useState<WorkflowStudioExecutionPolicyDraft>(() =>
    createWorkflowStudioExecutionPolicyDraft(node)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(createWorkflowStudioExecutionPolicyDraft(node));
    setError(null);
  }, [node]);

  const result = useMemo(() => buildWorkflowStudioExecutionPolicy(draft), [draft]);
  const currentRuntime = node.runtime
    ? {
        ...(node.runtime.queue ? { queue: node.runtime.queue } : {}),
        ...(node.runtime.machine ? { machine: node.runtime.machine } : {}),
        ...(node.runtime.maxDurationSeconds !== null
          ? { maxDurationSeconds: node.runtime.maxDurationSeconds }
          : {}),
        ...(node.runtime.retry
          ? {
              retry: {
                ...(node.runtime.retry.maxAttempts !== null
                  ? { maxAttempts: node.runtime.retry.maxAttempts }
                  : {}),
                ...(node.runtime.retry.minTimeoutMs !== null
                  ? { minTimeoutMs: node.runtime.retry.minTimeoutMs }
                  : {}),
                ...(node.runtime.retry.maxTimeoutMs !== null
                  ? { maxTimeoutMs: node.runtime.retry.maxTimeoutMs }
                  : {}),
                ...(node.runtime.retry.factor !== null
                  ? { factor: node.runtime.retry.factor }
                  : {}),
              },
            }
          : {}),
      }
    : null;
  const unchanged =
    result.success && runtimeFingerprint(result.runtime) === runtimeFingerprint(currentRuntime);

  if (draft.kind === "blocked") {
    return (
      <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/10 p-3 text-xxs leading-4 text-yellow-100">
        <div className="flex items-center gap-2 font-medium">
          <ServerIcon className="size-4" />
          Execution policy unavailable
        </div>
        <p className="mt-1.5 text-yellow-100/75">{draft.message}</p>
      </div>
    );
  }

  const update = (next: WorkflowStudioExecutionPolicyDraft) => {
    setDraft(next);
    setError(null);
  };

  const queueLabel = draft.queue.trim() || "Platform default";
  const machineLabel = draft.machine || "Platform default";
  const durationLabel = draft.maxDurationSeconds
    ? `${draft.maxDurationSeconds}s`
    : "Platform default";

  return (
    <section className="overflow-hidden rounded-lg border border-[#303037] bg-[#141416]">
      <header className="border-b border-[#29292f] px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-blue-400/20 bg-blue-500/10 text-blue-300">
            <ServerIcon className="size-4" />
          </span>
          <div>
            <div className="text-xs font-semibold text-text-bright">Execution policy</div>
            <div className="mt-0.5 text-xxs leading-4 text-text-dimmed">
              Whole-run queue, machine, duration, and retry controls.
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-md border border-[#303037] bg-[#19191c] px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-text-dimmed">
              <ServerIcon className="size-3" /> Queue
            </div>
            <div className="mt-1 truncate text-[10px] font-medium text-text-bright">
              {queueLabel}
            </div>
          </div>
          <div className="min-w-0 rounded-md border border-[#303037] bg-[#19191c] px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-text-dimmed">
              <CpuIcon className="size-3" /> Machine
            </div>
            <div className="mt-1 truncate text-[10px] font-medium text-text-bright">
              {machineLabel}
            </div>
          </div>
          <div className="min-w-0 rounded-md border border-[#303037] bg-[#19191c] px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-text-dimmed">
              <Clock3Icon className="size-3" /> Duration
            </div>
            <div className="mt-1 truncate text-[10px] font-medium text-text-bright">
              {durationLabel}
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-4 p-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dimmed">
              Queue name
            </span>
            <input
              className={inputClassName}
              value={draft.queue}
              disabled={busy}
              maxLength={128}
              placeholder="Platform default"
              onChange={(event) => update({ ...draft, queue: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dimmed">
              Machine preset
            </span>
            <select
              className={inputClassName}
              value={draft.machine}
              disabled={busy}
              onChange={(event) =>
                update({
                  ...draft,
                  machine: event.target.value as Extract<
                    WorkflowStudioExecutionPolicyDraft,
                    { kind: "editable" }
                  >["machine"],
                })
              }
            >
              <option value="">Platform default</option>
              {FLOWCORDIA_MACHINE_PRESETS.map((machine) => (
                <option key={machine} value={machine}>
                  {machine}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dimmed">
              Maximum duration
            </span>
            <input
              className={inputClassName}
              value={draft.maxDurationSeconds}
              disabled={busy}
              min={5}
              max={2_147_483_646}
              step={1}
              type="number"
              placeholder="Seconds"
              onChange={(event) => update({ ...draft, maxDurationSeconds: event.target.value })}
            />
          </label>
        </div>

        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
            draft.retryEnabled
              ? "border-indigo-400/30 bg-indigo-500/[0.08]"
              : "border-[#303037] bg-[#19191c] hover:border-[#41414a]"
          )}
        >
          <input
            className="mt-0.5 size-4 accent-indigo-500"
            type="checkbox"
            checked={draft.retryEnabled}
            disabled={busy}
            onChange={(event) =>
              update({
                ...draft,
                retryEnabled: event.target.checked,
                ...(event.target.checked &&
                !draft.maxAttempts &&
                !draft.minTimeoutMs &&
                !draft.maxTimeoutMs &&
                !draft.factor
                  ? {
                      maxAttempts: "3",
                      minTimeoutMs: "1000",
                      maxTimeoutMs: "10000",
                      factor: "2",
                    }
                  : {}),
              })
            }
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-xs font-medium text-text-bright">
              <RefreshCwIcon className="size-3.5 text-indigo-300" />
              Retry failed runs
            </span>
            <span className="mt-1 block text-xxs leading-4 text-text-dimmed">
              Retries restart the whole workflow. Side effects must remain application-level
              idempotent.
            </span>
          </span>
        </label>

        {draft.retryEnabled && (
          <div className="rounded-lg border border-[#303037] bg-[#111113] p-3">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dimmed">
              Backoff profile
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10px] text-text-dimmed">Maximum attempts</span>
                <input
                  className={inputClassName}
                  value={draft.maxAttempts}
                  disabled={busy}
                  min={1}
                  max={10}
                  step={1}
                  type="number"
                  onChange={(event) => update({ ...draft, maxAttempts: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] text-text-dimmed">Backoff factor</span>
                <input
                  className={inputClassName}
                  value={draft.factor}
                  disabled={busy}
                  min={1}
                  max={10}
                  step="any"
                  type="number"
                  onChange={(event) => update({ ...draft, factor: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] text-text-dimmed">
                  Minimum delay (ms)
                </span>
                <input
                  className={inputClassName}
                  value={draft.minTimeoutMs}
                  disabled={busy}
                  min={0}
                  max={86_400_000}
                  step={1}
                  type="number"
                  onChange={(event) => update({ ...draft, minTimeoutMs: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] text-text-dimmed">
                  Maximum delay (ms)
                </span>
                <input
                  className={inputClassName}
                  value={draft.maxTimeoutMs}
                  disabled={busy}
                  min={0}
                  max={86_400_000}
                  step={1}
                  type="number"
                  onChange={(event) => update({ ...draft, maxTimeoutMs: event.target.value })}
                />
              </label>
            </div>
          </div>
        )}

        {!result.success && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xxs leading-4 text-rose-200">
            {error ?? result.message}
          </div>
        )}
        {error && result.success && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xxs text-rose-200">
            {error}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[#29292f] bg-[#111113] px-3.5 py-2.5">
        <span className="text-[10px] text-text-dimmed">
          {unchanged ? "Policy matches the draft" : "Unsaved policy changes"}
        </span>
        <Button
          variant="secondary/small"
          LeadingIcon={SaveIcon}
          disabled={busy || !result.success || unchanged}
          onClick={() => {
            const next = buildWorkflowStudioExecutionPolicy(draft);
            if (!next.success) {
              setError(next.message);
              return;
            }
            setError(null);
            onSave(next.runtime);
          }}
        >
          Save policy
        </Button>
      </footer>
    </section>
  );
}
