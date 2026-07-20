import { DialogClose } from "@radix-ui/react-dialog";
import { useFetcher, useRevalidator } from "@remix-run/react";
import { HistoryIcon, RotateCcwIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/primitives/Dialog";
import {
  buildFlowcordiaRollbackCommand,
  FLOWCORDIA_ROLLBACK_CONFIRMATION,
} from "./command-contract";
import type { FlowcordiaRollbackProjection } from "./presentation";

interface RollbackResponse {
  ok: boolean;
  status?: "rollback_proposed";
  proposal?: {
    proposalId: string;
    state: string;
    headSha: string | null;
    pullRequestNumber: number | null;
    sourcePatchCount: number;
    targetProposalId: string;
    targetMergeCommitSha: string;
  };
  error?: string;
  message?: string;
  retryable?: boolean;
}

export function WorkflowRollbackPanel({
  workflowId,
  rollback,
  commandPath,
  canWrite,
}: {
  workflowId: string;
  rollback: FlowcordiaRollbackProjection;
  commandPath: string;
  canWrite: boolean;
}) {
  const fetcher = useFetcher<RollbackResponse>();
  const revalidator = useRevalidator();
  const submitted = useRef(false);
  const [open, setOpen] = useState(false);
  const [targetProposalId, setTargetProposalId] = useState(
    rollback.candidates[0]?.proposalId ?? ""
  );
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const target = useMemo(
    () =>
      rollback.candidates.find((candidate) => candidate.proposalId === targetProposalId) ?? null,
    [rollback.candidates, targetProposalId]
  );
  const normalizedReason = reason.trim();
  const ready =
    rollback.state === "READY" &&
    rollback.current !== null &&
    rollback.base !== null &&
    target !== null &&
    normalizedReason.length > 0 &&
    normalizedReason.length <= 2000 &&
    canWrite &&
    fetcher.state === "idle";

  useEffect(() => {
    if (rollback.candidates.some((candidate) => candidate.proposalId === targetProposalId)) return;
    setTargetProposalId(rollback.candidates[0]?.proposalId ?? "");
  }, [rollback.candidates, targetProposalId]);

  useEffect(() => {
    if (!submitted.current || fetcher.state !== "idle") return;
    submitted.current = false;
    revalidator.revalidate();
  }, [fetcher.state, revalidator]);

  const submit = () => {
    if (
      !ready ||
      confirmation !== FLOWCORDIA_ROLLBACK_CONFIRMATION ||
      !rollback.current ||
      !rollback.base ||
      !target
    ) {
      return;
    }
    submitted.current = true;
    fetcher.submit(
      buildFlowcordiaRollbackCommand({
        workflowId,
        targetProposalId: target.proposalId,
        expectedTargetHeadSha: target.headSha,
        expectedTargetMergeCommitSha: target.mergeCommitSha,
        expectedCurrentProposalId: rollback.current.proposalId,
        expectedCurrentHeadSha: rollback.current.headSha,
        expectedCurrentMergeCommitSha: rollback.current.mergeCommitSha,
        expectedBaseCommitSha: rollback.base.commitSha,
        expectedBaseBlobSha: rollback.base.blobSha,
        reason: normalizedReason,
      }),
      { method: "POST", action: commandPath, encType: "application/json" }
    );
    setOpen(false);
    setReason("");
    setConfirmation("");
  };

  return (
    <section
      data-testid="flowcordia-rollback-panel"
      data-state={rollback.state}
      data-current-proposal={rollback.current?.proposalId ?? ""}
      data-current-head={rollback.current?.headSha ?? ""}
      data-current-merge-commit={rollback.current?.mergeCommitSha ?? ""}
      data-base-commit={rollback.base?.commitSha ?? ""}
      data-candidate-count={rollback.candidates.length}
      className="border-b border-grid-bright bg-background-dimmed px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <HistoryIcon className="size-4 text-indigo-300" />
            <h3 className="text-sm font-medium text-text-bright">Governed rollback</h3>
            <Badge variant="outline-rounded">{rollback.state}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xxs leading-4 text-text-dimmed">{rollback.message}</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              data-testid="flowcordia-rollback-open"
              variant="secondary/small"
              LeadingIcon={RotateCcwIcon}
              disabled={rollback.state !== "READY" || !canWrite}
            >
              Create rollback proposal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a governed rollback proposal?</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              This creates a new draft pull request restoring an earlier reviewed workflow and its
              referenced function sources. It does not merge, deploy, execute, or rewrite history.
            </DialogDescription>

            <label className="mt-4 block text-xs font-medium text-text-bright">
              Reviewed version
              <select
                data-testid="flowcordia-rollback-target"
                value={targetProposalId}
                onChange={(event) => setTargetProposalId(event.target.value)}
                className="mt-1.5 h-9 w-full rounded border border-grid-bright bg-background-dimmed px-2.5 font-mono text-xs text-text-bright outline-none focus:border-indigo-400"
              >
                {rollback.candidates.map((candidate) => (
                  <option key={candidate.proposalId} value={candidate.proposalId}>
                    {candidate.proposalId} · {candidate.mergeCommitSha.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            {target && rollback.current && rollback.base ? (
              <div className="mt-3 grid gap-2 text-xxs text-text-dimmed sm:grid-cols-3">
                <div className="rounded border border-grid-bright bg-background-bright px-3 py-2">
                  <div className="uppercase tracking-wide">Current</div>
                  <div className="mt-1 truncate font-mono text-text-bright">
                    {rollback.current.mergeCommitSha}
                  </div>
                </div>
                <div className="rounded border border-grid-bright bg-background-bright px-3 py-2">
                  <div className="uppercase tracking-wide">Restore</div>
                  <div className="mt-1 truncate font-mono text-text-bright">
                    {target.mergeCommitSha}
                  </div>
                </div>
                <div className="rounded border border-grid-bright bg-background-bright px-3 py-2">
                  <div className="uppercase tracking-wide">New PR base</div>
                  <div className="mt-1 truncate font-mono text-text-bright">
                    {rollback.base.commitSha}
                  </div>
                </div>
              </div>
            ) : null}

            <label className="mt-4 block text-xs font-medium text-text-bright">
              Rollback reason
              <textarea
                data-testid="flowcordia-rollback-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, 2000))}
                rows={4}
                maxLength={2000}
                placeholder="Describe the incident, regression, or business reason for restoring this reviewed version."
                className="mt-1.5 w-full resize-y rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs leading-5 text-text-bright outline-none focus:border-indigo-400"
              />
              <span className="mt-1 block text-xxs text-text-dimmed">
                {normalizedReason.length}/2000 characters. Stored as rollback provenance, never in
                the workflow payload.
              </span>
            </label>

            <label className="mt-4 block text-xs font-medium text-text-bright">
              Type <span className="font-mono">{FLOWCORDIA_ROLLBACK_CONFIRMATION}</span>
              <input
                data-testid="flowcordia-rollback-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                className="mt-1.5 h-9 w-full rounded border border-grid-bright bg-background-dimmed px-2.5 font-mono text-xs text-text-bright outline-none focus:border-indigo-400"
              />
            </label>

            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="secondary/small">Cancel</Button>
              </DialogClose>
              <Button
                data-testid="flowcordia-rollback-confirm"
                variant="primary/small"
                LeadingIcon={ShieldCheckIcon}
                isLoading={fetcher.state !== "idle"}
                disabled={
                  !ready ||
                  confirmation !== FLOWCORDIA_ROLLBACK_CONFIRMATION ||
                  fetcher.state !== "idle"
                }
                onClick={submit}
              >
                Create reviewed rollback
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {fetcher.data && !fetcher.data.ok ? (
        <div className="mt-3 rounded border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {fetcher.data.message ?? "The rollback proposal could not be created."}
        </div>
      ) : null}
      {fetcher.data?.ok && fetcher.data.proposal ? (
        <div
          data-testid="flowcordia-rollback-created"
          data-proposal-id={fetcher.data.proposal.proposalId}
          data-proposal-head={fetcher.data.proposal.headSha ?? ""}
          data-pull-request-number={fetcher.data.proposal.pullRequestNumber ?? ""}
          data-target-proposal-id={fetcher.data.proposal.targetProposalId}
          data-target-merge-commit={fetcher.data.proposal.targetMergeCommitSha}
          className="mt-3 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
        >
          Rollback proposal {fetcher.data.proposal.proposalId} was created from reviewed version{" "}
          {fetcher.data.proposal.targetProposalId} with {fetcher.data.proposal.sourcePatchCount}{" "}
          source patch{fetcher.data.proposal.sourcePatchCount === 1 ? "" : "es"}.
        </div>
      ) : null}
    </section>
  );
}
