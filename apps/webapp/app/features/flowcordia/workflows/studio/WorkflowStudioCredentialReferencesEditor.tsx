import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import {
  buildWorkflowStudioCredentialReferences,
  createWorkflowStudioCredentialReferencesDraft,
  projectWorkflowStudioCredentialBindings,
} from "./credential-references";
import type { WorkflowStudioNode } from "./presentation";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

export function WorkflowStudioCredentialReferencesEditor({
  node,
  busy,
  onSave,
}: {
  node: WorkflowStudioNode;
  busy: boolean;
  onSave: (references: string[]) => void;
}) {
  const source = useMemo(() => createWorkflowStudioCredentialReferencesDraft(node), [node]);
  const [references, setReferences] = useState<string[]>(
    source.kind === "editable" ? source.references : []
  );
  const [candidate, setCandidate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const webhook = node.operation === "trigger.webhook";

  useEffect(() => {
    const next = createWorkflowStudioCredentialReferencesDraft(node);
    setReferences(next.kind === "editable" ? next.references : []);
    setCandidate("");
    setError(null);
  }, [node]);

  if (source.kind === "blocked") {
    return (
      <div className="rounded border border-yellow-500/25 bg-yellow-500/10 px-2.5 py-2 text-xxs leading-4 text-yellow-200">
        {source.message}
      </div>
    );
  }

  const bindings = projectWorkflowStudioCredentialBindings(references, node.operation);
  const result = buildWorkflowStudioCredentialReferences(references, node.operation);
  const unchanged = JSON.stringify(references) === JSON.stringify(node.credentialReferences);
  const mayAdd = !webhook || references.length === 0;

  const addReference = () => {
    const value = candidate.trim();
    const next = buildWorkflowStudioCredentialReferences([...references, value], node.operation);
    if (!next.success) {
      setError(next.message);
      return;
    }
    setReferences(next.references);
    setCandidate("");
    setError(null);
  };

  return (
    <div className="space-y-3 rounded border border-grid-dimmed bg-background-dimmed p-3">
      <div>
        <div className="text-xxs font-medium text-text-bright">Credential references</div>
        <div className="mt-1 text-xxs leading-4 text-text-dimmed">
          Studio stores reference names only. Secret values remain in project environment variables
          and are resolved only inside the deployed task or signed ingress boundary.
        </div>
      </div>

      {bindings.length > 0 && (
        <div className="space-y-2">
          {bindings.map((binding) => (
            <div
              key={binding.reference}
              className="rounded border border-grid-dimmed bg-background-bright px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-text-bright">{binding.reference}</span>
                <button
                  type="button"
                  className="text-xxs font-medium text-rose-300 hover:text-rose-200"
                  disabled={busy}
                  onClick={() => {
                    setReferences((current) =>
                      current.filter((reference) => reference !== binding.reference)
                    );
                    setError(null);
                  }}
                >
                  Remove
                </button>
              </div>
              <div className="mt-1 break-all font-mono text-xxs text-text-dimmed">
                {binding.environmentName}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className={inputClassName}
          value={candidate}
          disabled={busy || !mayAdd}
          maxLength={64}
          placeholder={webhook ? "orders-webhook" : "billing-api"}
          onChange={(event) => {
            setCandidate(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (mayAdd) addReference();
          }}
        />
        <Button
          variant="secondary/small"
          disabled={busy || !mayAdd || candidate.trim().length === 0}
          onClick={addReference}
        >
          Add
        </Button>
      </div>

      <div className="rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-2 text-xxs leading-4 text-blue-200">
        {webhook ? (
          <>
            This trigger accepts one HMAC credential reference. Studio stores the reference only and
            never reads the secret value.
          </>
        ) : (
          <>
            Each HTTP reference must resolve to a JSON object with a{" "}
            <span className="font-mono">headers</span> object. Studio never requests or displays
            that value.
          </>
        )}
      </div>

      {(!result.success || error) && (
        <div className="text-xxs leading-4 text-rose-300">
          {error ?? (result.success ? null : result.message)}
        </div>
      )}

      <Button
        className="w-full justify-center"
        variant="secondary/small"
        disabled={busy || !result.success || unchanged}
        onClick={() => {
          const next = buildWorkflowStudioCredentialReferences(references, node.operation);
          if (!next.success) {
            setError(next.message);
            return;
          }
          setError(null);
          onSave(next.references);
        }}
      >
        Save credential references
      </Button>
    </div>
  );
}
