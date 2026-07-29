import {
  CheckCircle2Icon,
  KeyIcon,
  LockIcon,
  PlusIcon,
  SaveIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import {
  buildWorkflowStudioCredentialReferences,
  createWorkflowStudioCredentialReferencesDraft,
  projectWorkflowStudioCredentialBindings,
} from "./credential-references";
import type { WorkflowStudioNode } from "./presentation";

const inputClassName =
  "h-9 w-full rounded-md border border-[#34343b] bg-[#111113] px-3 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-55";

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
      <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/10 p-3 text-xxs leading-4 text-yellow-100">
        <div className="flex items-center gap-2 font-medium">
          <LockIcon className="size-4" />
          Credential editing unavailable
        </div>
        <p className="mt-1.5 text-yellow-100/75">{source.message}</p>
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
    <section className="overflow-hidden rounded-lg border border-[#303037] bg-[#141416]">
      <header className="flex items-start justify-between gap-3 border-b border-[#29292f] px-3.5 py-3">
        <div className="flex min-w-0 gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-violet-300">
            <KeyIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-text-bright">Credential references</div>
            <div className="mt-0.5 text-xxs leading-4 text-text-dimmed">
              Studio stores reference names only and never reads the secret value. Secrets resolve
              only in the deployed runtime.
            </div>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            bindings.length > 0
              ? "border-violet-400/25 bg-violet-500/10 text-violet-200"
              : "border-[#3a3a42] bg-[#19191c] text-text-dimmed"
          )}
        >
          {bindings.length} bound
        </span>
      </header>

      <div className="space-y-3 p-3.5">
        {bindings.length > 0 ? (
          <div className="space-y-2">
            {bindings.map((binding) => (
              <div
                key={binding.reference}
                className="group rounded-lg border border-[#303037] bg-[#19191c] p-3 transition hover:border-[#41414a]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-300" />
                      <span className="truncate font-mono text-xs text-text-bright">
                        {binding.reference}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 break-all font-mono text-[10px] text-text-dimmed">
                      <LockIcon className="size-3 shrink-0" />
                      {binding.environmentName}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-md border border-transparent text-text-dimmed transition hover:border-rose-500/25 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
                    disabled={busy}
                    aria-label={`Remove credential reference ${binding.reference}`}
                    onClick={() => {
                      setReferences((current) =>
                        current.filter((reference) => reference !== binding.reference)
                      );
                      setError(null);
                    }}
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#3a3a42] bg-[#111113] px-4 py-5 text-center">
            <KeyIcon className="mx-auto size-5 text-zinc-600" />
            <div className="mt-2 text-xs font-medium text-text-bright">
              No credential references
            </div>
            <div className="mt-1 text-xxs leading-4 text-text-dimmed">
              Add a reference name. Studio never requests or displays secret values.
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            className={inputClassName}
            value={candidate}
            disabled={busy || !mayAdd}
            maxLength={64}
            placeholder={webhook ? "orders-webhook" : "billing-api"}
            aria-label="Credential reference name"
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
            LeadingIcon={PlusIcon}
            disabled={busy || !mayAdd || candidate.trim().length === 0}
            onClick={addReference}
          >
            Add
          </Button>
        </div>

        <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.07] p-3 text-xxs leading-4 text-blue-100">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheckIcon className="size-3.5" />
            Secret boundary
          </div>
          <p className="mt-1.5 text-blue-100/75">
            {webhook
              ? "This trigger accepts one HMAC reference. The secret remains outside workflow documents and browser responses."
              : "Each HTTP reference resolves to a JSON object with a headers object. Studio stores only the reference name."}
          </p>
        </div>

        {(!result.success || error) && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xxs leading-4 text-rose-200">
            {error ?? (result.success ? null : result.message)}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[#29292f] bg-[#111113] px-3.5 py-2.5">
        <span className="text-[10px] text-text-dimmed">
          {unchanged ? "No reference changes" : "Unsaved reference changes"}
        </span>
        <Button
          variant="secondary/small"
          LeadingIcon={SaveIcon}
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
          Save references
        </Button>
      </footer>
    </section>
  );
}
