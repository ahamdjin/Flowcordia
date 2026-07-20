import { useFetcher } from "@remix-run/react";
import { GitPullRequestIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { buildFlowcordiaBootstrapCommand } from "./command-contract";

interface BootstrapResponse {
  ok: boolean;
  status?: "proposal_created";
  workflow?: { workflowId: string; name: string };
  proposal?: {
    proposalId: string;
    state: string;
    headSha: string | null;
    pullRequestNumber: number | null;
    baseCommitSha: string;
    generatedPath: string;
    preview: {
      state: "READY" | "DISABLED" | "UNAVAILABLE";
      branchName?: string;
      message?: string;
    };
  };
  error?: string;
  message?: string;
  retryable?: boolean;
}

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-3 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60";

export function WorkflowRepositoryBootstrapPanel({
  commandPath,
  proposalPath,
  canWrite,
}: {
  commandPath: string;
  proposalPath: string;
  canWrite: boolean;
}) {
  const fetcher = useFetcher<BootstrapResponse>();
  const [workflowId, setWorkflowId] = useState("starter_workflow");
  const [name, setName] = useState("Starter workflow");
  const [description, setDescription] = useState(
    "A governed first workflow created by Flowcordia Studio."
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const created = Boolean(fetcher.data?.ok && fetcher.data.proposal);
  const busy = fetcher.state !== "idle";
  const validId = /^[a-z][a-z0-9_-]{2,127}$/.test(workflowId);
  const ready =
    canWrite &&
    !created &&
    !busy &&
    acknowledged &&
    validId &&
    name.trim().length > 0 &&
    name.trim().length <= 160 &&
    description.trim().length <= 2000;

  return (
    <section
      data-testid="flowcordia-repository-bootstrap"
      data-state={created ? "PROPOSAL_CREATED" : busy ? "CREATING" : "READY"}
      className="mx-auto w-full max-w-2xl rounded-xl border border-grid-bright bg-background-bright p-6 text-left shadow-xl shadow-black/10"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-indigo-500/25 bg-indigo-500/10">
          <SparklesIcon className="size-4 text-indigo-300" />
        </div>
        <div>
          <h2 className="text-base font-medium text-text-bright">Create the first workflow</h2>
          <p className="mt-1 text-sm leading-6 text-text-dimmed">
            Start with a manual trigger and output node. Flowcordia generates the reviewable
            Trigger.dev task in the same draft pull request; it does not merge, deploy, or execute
            anything automatically.
          </p>
        </div>
      </div>

      {created && fetcher.data?.proposal ? (
        <div
          data-testid="flowcordia-bootstrap-created"
          data-proposal-id={fetcher.data.proposal.proposalId}
          data-proposal-head={fetcher.data.proposal.headSha ?? ""}
          data-pull-request-number={fetcher.data.proposal.pullRequestNumber ?? ""}
          className="mt-6 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100"
        >
          <div className="font-medium">Draft proposal created</div>
          <p className="mt-1 text-xs leading-5 text-emerald-200">
            {fetcher.data.proposal.pullRequestNumber ? (
              <>
                PR #{fetcher.data.proposal.pullRequestNumber} contains the workflow and generated
                task.{" "}
              </>
            ) : (
              <>The proposal contains the workflow and generated task. </>
            )}
            Review its exact head before submitting it for approval.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <LinkButton variant="primary/small" to={proposalPath}>
              Review proposal
            </LinkButton>
            <span className="font-mono text-xxs text-emerald-300">
              {fetcher.data.proposal.generatedPath}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-text-bright">Workflow ID</span>
              <input
                data-testid="flowcordia-bootstrap-workflow-id"
                className={inputClassName}
                value={workflowId}
                disabled={!canWrite || busy}
                maxLength={128}
                aria-invalid={!validId}
                onChange={(event) => setWorkflowId(event.target.value.toLowerCase())}
              />
              <span className="mt-1.5 block text-xxs leading-4 text-text-dimmed">
                Lowercase letters, numbers, underscores, and hyphens.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-text-bright">Name</span>
              <input
                data-testid="flowcordia-bootstrap-name"
                className={inputClassName}
                value={name}
                disabled={!canWrite || busy}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-text-bright">Description</span>
            <textarea
              data-testid="flowcordia-bootstrap-description"
              className={inputClassName + " min-h-24 resize-y"}
              value={description}
              disabled={!canWrite || busy}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className="mt-4 flex items-start gap-2 rounded-md border border-grid-dimmed bg-background-dimmed px-3 py-2.5 text-xs text-text-dimmed">
            <input
              data-testid="flowcordia-bootstrap-acknowledgement"
              type="checkbox"
              className="mt-0.5"
              checked={acknowledged}
              disabled={!canWrite || busy}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I understand this creates a reviewable draft pull request against the configured
              production branch.
            </span>
          </label>

          {!canWrite ? (
            <p className="mt-4 text-xs text-amber-300">
              GitHub write permission is required to bootstrap this repository.
            </p>
          ) : null}
          {fetcher.data && !fetcher.data.ok ? (
            <div className="mt-4 rounded border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {fetcher.data.message ?? "The starter proposal could not be created."}
              {fetcher.data.retryable ? " You can retry this request safely." : ""}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
            <Button
              data-testid="flowcordia-bootstrap-submit"
              variant="primary/small"
              LeadingIcon={GitPullRequestIcon}
              disabled={!ready}
              isLoading={busy}
              onClick={() => {
                if (!ready) return;
                fetcher.submit(
                  buildFlowcordiaBootstrapCommand({
                    workflowId,
                    name: name.trim(),
                    description: description.trim(),
                  }),
                  { method: "POST", action: commandPath, encType: "application/json" }
                );
              }}
            >
              Create draft PR
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
