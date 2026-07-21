import { useRevalidator } from "@remix-run/react";
import { PlusIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import type { WorkflowStudioNode } from "../studio/presentation";
import {
  FLOWCORDIA_CREDENTIAL_MAX_HEADERS,
  normalizeFlowcordiaCredentialHeaders,
  type FlowcordiaCredentialBindingProjection,
  type FlowcordiaCredentialCommandResponse,
  type FlowcordiaCredentialHeader,
} from "./contract";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

function bindingTone(state: FlowcordiaCredentialBindingProjection["state"]): string {
  switch (state) {
    case "READY":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "NOT_SECRET":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "MISSING":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
    case "UNAVAILABLE":
      return "border-grid-bright bg-background-dimmed text-text-dimmed";
  }
}

function bindingLabel(state: FlowcordiaCredentialBindingProjection["state"]): string {
  switch (state) {
    case "READY":
      return "Configured";
    case "NOT_SECRET":
      return "Rotate securely";
    case "MISSING":
      return "Missing";
    case "UNAVAILABLE":
      return "Status unavailable";
  }
}

export function WorkflowStudioCredentialManager({
  workflowId,
  node,
  bindings,
  commandPath,
  canManage,
}: {
  workflowId: string;
  node: WorkflowStudioNode;
  bindings: FlowcordiaCredentialBindingProjection[];
  commandPath: string;
  canManage: boolean;
}) {
  const revalidator = useRevalidator();
  const [reference, setReference] = useState(node.credentialReferences[0] ?? "");
  const [headers, setHeaders] = useState<FlowcordiaCredentialHeader[]>([
    { name: "authorization", value: "" },
  ]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [response, setResponse] = useState<FlowcordiaCredentialCommandResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const nodeBindings = node.credentialReferences.map(
    (candidate) =>
      bindings.find((binding) => binding.reference === candidate) ?? {
        reference: candidate,
        environmentName: "",
        state: "MISSING" as const,
        version: null,
      }
  );

  useEffect(() => {
    setReference(node.credentialReferences[0] ?? "");
    setHeaders([{ name: "authorization", value: "" }]);
    setLocalError(null);
    setResponse(null);
  }, [node.id, node.credentialReferences]);

  if (node.credentialReferences.length === 0) {
    return (
      <div className="rounded border border-grid-dimmed bg-background-dimmed px-3 py-3 text-xxs leading-4 text-text-dimmed">
        Add a credential reference to this HTTP node before configuring an environment value.
      </div>
    );
  }

  const store = async () => {
    const normalized = normalizeFlowcordiaCredentialHeaders(headers);
    if (!normalized.success) {
      setLocalError(normalized.message);
      return;
    }
    if (!reference || !node.credentialReferences.includes(reference)) {
      setLocalError("Select a credential reference bound to this node.");
      return;
    }

    setBusy(true);
    setLocalError(null);
    setResponse(null);
    try {
      const request = await fetch(commandPath, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation: "store",
          workflowId,
          nodeId: node.id,
          reference,
          confirmation: "STORE_FLOWCORDIA_CREDENTIAL",
          headers: normalized.headers,
        }),
      });
      const result = (await request.json()) as FlowcordiaCredentialCommandResponse;
      setResponse(result);
      if (result.ok) {
        setHeaders([{ name: "authorization", value: "" }]);
        revalidator.revalidate();
      }
    } catch {
      setResponse({
        ok: false,
        error: "network_error",
        message: "Credential request could not be completed. Check the connection and retry.",
        retryable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-grid-dimmed bg-background-bright p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded border border-indigo-500/25 bg-indigo-500/10">
          <ShieldCheckIcon className="size-3.5 text-indigo-300" />
        </div>
        <div>
          <div className="text-xs font-medium text-text-bright">Environment credentials</div>
          <p className="mt-1 text-xxs leading-4 text-text-dimmed">
            Values are write-only and stored in the selected Trigger.dev environment. Studio receives
            status and version only.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {nodeBindings.map((binding) => (
          <div
            key={binding.reference}
            className="rounded border border-grid-dimmed bg-background-dimmed px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-text-bright">{binding.reference}</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xxs font-medium",
                  bindingTone(binding.state)
                )}
              >
                {bindingLabel(binding.state)}
              </span>
            </div>
            <div className="mt-1 break-all font-mono text-xxs text-text-dimmed">
              {binding.environmentName || "Environment key pending refresh"}
            </div>
            {binding.version !== null && (
              <div className="mt-1 text-xxs text-text-dimmed">Stored version {binding.version}</div>
            )}
          </div>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-xxs text-text-dimmed">Credential reference</span>
        <select
          className={inputClassName}
          value={reference}
          disabled={!canManage || busy}
          onChange={(event) => {
            setReference(event.target.value);
            setLocalError(null);
            setResponse(null);
          }}
        >
          {node.credentialReferences.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xxs font-medium text-text-bright">HTTP headers</span>
          <Button
            variant="minimal/small"
            LeadingIcon={PlusIcon}
            disabled={!canManage || busy || headers.length >= FLOWCORDIA_CREDENTIAL_MAX_HEADERS}
            onClick={() => {
              setHeaders((current) => [...current, { name: "", value: "" }]);
              setResponse(null);
            }}
          >
            Add header
          </Button>
        </div>
        {headers.map((header, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_2rem] gap-2">
            <input
              aria-label={`Header ${index + 1} name`}
              className={inputClassName}
              value={header.name}
              disabled={!canManage || busy}
              maxLength={128}
              placeholder="authorization"
              autoComplete="off"
              onChange={(event) => {
                const name = event.target.value;
                setHeaders((current) =>
                  current.map((candidate, candidateIndex) =>
                    candidateIndex === index ? { ...candidate, name } : candidate
                  )
                );
                setLocalError(null);
                setResponse(null);
              }}
            />
            <input
              aria-label={`Header ${index + 1} value`}
              className={inputClassName}
              value={header.value}
              disabled={!canManage || busy}
              maxLength={8192}
              type="password"
              placeholder="Write-only value"
              autoComplete="new-password"
              onChange={(event) => {
                const value = event.target.value;
                setHeaders((current) =>
                  current.map((candidate, candidateIndex) =>
                    candidateIndex === index ? { ...candidate, value } : candidate
                  )
                );
                setLocalError(null);
                setResponse(null);
              }}
            />
            <button
              type="button"
              aria-label={`Remove header ${index + 1}`}
              className="grid size-8 place-items-center rounded border border-grid-dimmed text-text-dimmed hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-40"
              disabled={!canManage || busy || headers.length === 1}
              onClick={() => {
                setHeaders((current) => current.filter((_, candidate) => candidate !== index));
                setResponse(null);
              }}
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-2 text-xxs leading-4 text-blue-200">
        <div className="flex gap-2">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Saving replaces the selected environment value atomically. Existing values are never
            returned to this page, logs, workflow source, or release evidence.
          </span>
        </div>
      </div>

      {!canManage && (
        <div className="text-xxs leading-4 text-yellow-200">
          Your role cannot write environment variables in this environment.
        </div>
      )}
      {(localError || (response && !response.ok)) && (
        <div className="text-xxs leading-4 text-rose-300">
          {localError ?? (response && !response.ok ? response.message : null)}
        </div>
      )}
      {response?.ok && (
        <div className="text-xxs leading-4 text-emerald-300">
          Credential stored. All input values were cleared.
        </div>
      )}

      <Button
        className="w-full justify-center"
        variant="primary/small"
        disabled={!canManage || busy || headers.some((header) => !header.name || !header.value)}
        isLoading={busy}
        onClick={() => void store()}
      >
        Store encrypted credential
      </Button>
    </div>
  );
}
