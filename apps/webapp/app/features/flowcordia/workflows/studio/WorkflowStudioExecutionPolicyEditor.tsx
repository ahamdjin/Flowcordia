import type { WorkflowRuntimePolicy } from "@flowcordia/workflow";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import {
  buildWorkflowStudioExecutionPolicy,
  createWorkflowStudioExecutionPolicyDraft,
  FLOWCORDIA_MACHINE_PRESETS,
  type WorkflowStudioExecutionPolicyDraft,
} from "./execution-policy";
import type { WorkflowStudioNode } from "./presentation";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

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
      <div className="rounded border border-yellow-500/25 bg-yellow-500/10 px-2.5 py-2 text-xxs leading-4 text-yellow-200">
        {draft.message}
      </div>
    );
  }

  const update = (next: WorkflowStudioExecutionPolicyDraft) => {
    setDraft(next);
    setError(null);
  };

  return (
    <div className="space-y-3 rounded border border-grid-dimmed bg-background-dimmed p-3">
      <div>
        <div className="text-xxs font-medium text-text-bright">Execution policy</div>
        <div className="mt-1 text-xxs leading-4 text-text-dimmed">
          Applies to the whole workflow run. Node-level runtime policy is not supported.
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xxs text-text-dimmed">Queue name</span>
        <input
          className={inputClassName}
          value={draft.queue}
          disabled={busy}
          maxLength={128}
          placeholder="Default queue"
          onChange={(event) => update({ ...draft, queue: event.target.value })}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xxs text-text-dimmed">Machine preset</span>
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
        <span className="mb-1 block text-xxs text-text-dimmed">Maximum duration (seconds)</span>
        <input
          className={inputClassName}
          value={draft.maxDurationSeconds}
          disabled={busy}
          min={5}
          max={2_147_483_646}
          step={1}
          type="number"
          placeholder="Platform default"
          onChange={(event) => update({ ...draft, maxDurationSeconds: event.target.value })}
        />
      </label>

      <label className="flex items-start gap-2 rounded border border-grid-dimmed px-2.5 py-2">
        <input
          className="mt-0.5"
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
        <span>
          <span className="block text-xxs font-medium text-text-bright">Retry failed runs</span>
          <span className="mt-0.5 block text-xxs leading-4 text-text-dimmed">
            Retries restart the whole workflow. Side effects must be application-level idempotent.
          </span>
        </span>
      </label>

      {draft.retryEnabled && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Maximum attempts</span>
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
            <span className="mb-1 block text-xxs text-text-dimmed">Backoff factor</span>
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
            <span className="mb-1 block text-xxs text-text-dimmed">Minimum delay (ms)</span>
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
            <span className="mb-1 block text-xxs text-text-dimmed">Maximum delay (ms)</span>
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
      )}

      {!result.success && (
        <div className="text-xxs leading-4 text-rose-300">{error ?? result.message}</div>
      )}
      {error && result.success && <div className="text-xxs text-rose-300">{error}</div>}

      <Button
        className="w-full justify-center"
        variant="secondary/small"
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
        Save execution policy
      </Button>
    </div>
  );
}
