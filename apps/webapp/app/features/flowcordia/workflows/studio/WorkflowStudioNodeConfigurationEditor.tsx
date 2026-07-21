import type { JsonObject } from "@flowcordia/workflow";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
  FLOWCORDIA_CONDITION_OPERATORS,
  FLOWCORDIA_HTTP_BODY_MODES,
  FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES,
  FLOWCORDIA_HTTP_MAX_TIMEOUT_SECONDS,
  FLOWCORDIA_HTTP_METHODS,
  FLOWCORDIA_HTTP_RESPONSE_MODES,
  FLOWCORDIA_WAIT_UNITS,
  FLOWCORDIA_WEBHOOK_METHODS,
  type WorkflowStudioConditionValueType,
  type WorkflowStudioNodeConfigurationDraft,
  type WorkflowStudioWaitUnit,
} from "./node-configuration";
import type { WorkflowStudioNode } from "./presentation";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

function configurationFingerprint(value: JsonObject): string {
  return JSON.stringify(value);
}

export function WorkflowStudioNodeConfigurationEditor({
  node,
  busy,
  onSave,
}: {
  node: WorkflowStudioNode;
  busy: boolean;
  onSave: (configuration: JsonObject) => void;
}) {
  const [draft, setDraft] = useState<WorkflowStudioNodeConfigurationDraft>(() =>
    createWorkflowStudioNodeConfigurationDraft(node.operation, node.editableConfiguration ?? {})
  );
  const [error, setError] = useState<string | null>(null);
  const sourceFingerprint = configurationFingerprint(node.editableConfiguration ?? {});

  useEffect(() => {
    setDraft(
      createWorkflowStudioNodeConfigurationDraft(node.operation, node.editableConfiguration ?? {})
    );
    setError(null);
  }, [node.editableConfiguration, node.id, node.operation]);

  const result = useMemo(() => buildWorkflowStudioNodeConfiguration(draft), [draft]);
  const unchanged =
    result.success && configurationFingerprint(result.configuration) === sourceFingerprint;

  if (draft.kind === "blocked") {
    return (
      <div className="rounded border border-yellow-500/25 bg-yellow-500/10 px-2.5 py-2 text-xxs leading-4 text-yellow-200">
        {draft.message} Studio will not expose raw JSON as a fallback because doing so could
        silently remove or reinterpret repository intent.
      </div>
    );
  }

  if (draft.kind === "empty") {
    return (
      <div className="rounded border border-grid-dimmed bg-background-dimmed px-2.5 py-2 text-xxs leading-4 text-text-dimmed">
        This operation has no visual configuration fields. Its payload passes through unchanged.
      </div>
    );
  }

  const update = (next: WorkflowStudioNodeConfigurationDraft) => {
    setDraft(next);
    setError(null);
  };

  return (
    <div className="space-y-3 rounded border border-grid-dimmed bg-background-dimmed p-3">
      <div>
        <div className="text-xxs font-medium text-text-bright">Configuration</div>
        <div className="mt-1 text-xxs leading-4 text-text-dimmed">
          Studio saves only the documented fields below. The server validates the complete workflow
          again before the draft changes.
        </div>
      </div>

      {draft.kind === "schedule" && (
        <>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Cron expression</span>
            <input
              className={inputClassName}
              value={draft.cron}
              disabled={busy}
              maxLength={256}
              placeholder="0 9 * * 1-5"
              onChange={(event) => update({ ...draft, cron: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">IANA timezone</span>
            <input
              className={inputClassName}
              value={draft.timezone}
              disabled={busy}
              maxLength={128}
              placeholder="UTC"
              onChange={(event) => update({ ...draft, timezone: event.target.value })}
            />
          </label>
        </>
      )}

      {draft.kind === "webhook" && (
        <>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Method</span>
            <select
              className={inputClassName}
              value={draft.method}
              disabled={busy}
              onChange={(event) =>
                update({
                  ...draft,
                  method: event.target.value as (typeof FLOWCORDIA_WEBHOOK_METHODS)[number],
                })
              }
            >
              {FLOWCORDIA_WEBHOOK_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Route path</span>
            <input
              className={inputClassName}
              value={draft.path}
              disabled={busy}
              maxLength={512}
              placeholder="/orders"
              onChange={(event) => update({ ...draft, path: event.target.value })}
            />
          </label>
          <div className="rounded border border-yellow-500/20 bg-yellow-500/5 px-2.5 py-2 text-xxs leading-4 text-yellow-200">
            The visual contract is available, but signed public webhook ingress remains a planned
            deployment binding.
          </div>
        </>
      )}

      {draft.kind === "http" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">Method</span>
              <select
                className={inputClassName}
                value={draft.method}
                disabled={busy}
                onChange={(event) => {
                  const method = event.target.value as (typeof FLOWCORDIA_HTTP_METHODS)[number];
                  update({
                    ...draft,
                    method,
                    bodyMode: ["GET", "HEAD"].includes(method) ? "none" : draft.bodyMode,
                  });
                }}
              >
                {FLOWCORDIA_HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">Request body</span>
              <select
                className={inputClassName}
                value={draft.bodyMode}
                disabled={busy || ["GET", "HEAD"].includes(draft.method)}
                onChange={(event) =>
                  update({
                    ...draft,
                    bodyMode: event.target.value as (typeof FLOWCORDIA_HTTP_BODY_MODES)[number],
                  })
                }
              >
                <option value="input">Workflow input as JSON</option>
                <option value="none">No request body</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">HTTPS destination</span>
            <input
              className={inputClassName}
              value={draft.url}
              disabled={busy}
              inputMode="url"
              maxLength={2048}
              placeholder="https://api.example.com/orders"
              onChange={(event) => update({ ...draft, url: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">Response handling</span>
              <select
                className={inputClassName}
                value={draft.responseMode}
                disabled={busy}
                onChange={(event) =>
                  update({
                    ...draft,
                    responseMode: event.target
                      .value as (typeof FLOWCORDIA_HTTP_RESPONSE_MODES)[number],
                  })
                }
              >
                <option value="auto">Auto by content type</option>
                <option value="json">Require JSON</option>
                <option value="text">Return text</option>
                <option value="none">Ignore response body</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">Timeout in seconds</span>
              <input
                className={inputClassName}
                value={draft.timeoutSeconds}
                disabled={busy}
                min={1}
                max={FLOWCORDIA_HTTP_MAX_TIMEOUT_SECONDS}
                step={1}
                type="number"
                onChange={(event) => update({ ...draft, timeoutSeconds: event.target.value })}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Maximum response bytes</span>
            <input
              className={inputClassName}
              value={draft.maxResponseBytes}
              disabled={busy || draft.responseMode === "none"}
              min={1}
              max={FLOWCORDIA_HTTP_MAX_RESPONSE_BYTES}
              step={1}
              type="number"
              onChange={(event) => update({ ...draft, maxResponseBytes: event.target.value })}
            />
            <span className="mt-1 block text-xxs leading-4 text-text-dimmed">
              Up to 5,242,880 bytes. The runtime stops reading as soon as this limit is exceeded.
            </span>
          </label>
          <div className="text-xxs leading-4 text-text-dimmed">
            Redirects are never followed. Authentication belongs in credential references and
            environment bindings, never in the URL or workflow configuration.
          </div>
        </>
      )}

      {draft.kind === "wait" && (
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Duration</span>
            <input
              className={inputClassName}
              value={draft.duration}
              disabled={busy}
              min={0}
              step="any"
              type="number"
              onChange={(event) => update({ ...draft, duration: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Unit</span>
            <select
              className={inputClassName}
              value={draft.unit}
              disabled={busy}
              onChange={(event) =>
                update({ ...draft, unit: event.target.value as WorkflowStudioWaitUnit })
              }
            >
              {FLOWCORDIA_WAIT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {draft.kind === "condition" && (
        <>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">
              Input path <span className="opacity-70">(empty means the whole input)</span>
            </span>
            <input
              className={inputClassName}
              value={draft.path}
              disabled={busy}
              maxLength={512}
              placeholder="customer.plan"
              onChange={(event) => update({ ...draft, path: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">Operator</span>
            <select
              className={inputClassName}
              value={draft.operator}
              disabled={busy}
              onChange={(event) =>
                update({
                  ...draft,
                  operator: event.target.value as (typeof FLOWCORDIA_CONDITION_OPERATORS)[number],
                })
              }
            >
              <option value="equals">Equals</option>
              <option value="not_equals">Does not equal</option>
              <option value="exists">Exists</option>
            </select>
          </label>
          {draft.operator !== "exists" && (
            <>
              <label className="block">
                <span className="mb-1 block text-xxs text-text-dimmed">Value type</span>
                <select
                  className={inputClassName}
                  value={draft.valueType}
                  disabled={busy}
                  onChange={(event) =>
                    update({
                      ...draft,
                      valueType: event.target.value as WorkflowStudioConditionValueType,
                    })
                  }
                >
                  <option value="string">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="null">Null</option>
                </select>
              </label>
              {(draft.valueType === "string" || draft.valueType === "number") && (
                <label className="block">
                  <span className="mb-1 block text-xxs text-text-dimmed">Comparison value</span>
                  <input
                    className={cn(inputClassName, draft.valueType === "number" && "font-mono")}
                    value={draft.valueText}
                    disabled={busy}
                    inputMode={draft.valueType === "number" ? "decimal" : "text"}
                    onChange={(event) => update({ ...draft, valueText: event.target.value })}
                  />
                </label>
              )}
              {draft.valueType === "boolean" && (
                <label className="block">
                  <span className="mb-1 block text-xxs text-text-dimmed">Comparison value</span>
                  <select
                    className={inputClassName}
                    value={String(draft.booleanValue)}
                    disabled={busy}
                    onChange={(event) =>
                      update({ ...draft, booleanValue: event.target.value === "true" })
                    }
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </label>
              )}
            </>
          )}
        </>
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
          const next = buildWorkflowStudioNodeConfiguration(draft);
          if (!next.success) {
            setError(next.message);
            return;
          }
          setError(null);
          onSave(next.configuration);
        }}
      >
        Save configuration
      </Button>
    </div>
  );
}
