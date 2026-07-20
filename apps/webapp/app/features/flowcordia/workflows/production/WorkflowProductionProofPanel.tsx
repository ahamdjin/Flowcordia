import { findInlineSecretPath, type JsonValue } from "@flowcordia/workflow";
import { DialogClose } from "@radix-ui/react-dialog";
import { useFetcher, useRevalidator } from "@remix-run/react";
import { AlertTriangleIcon, CheckCircle2Icon, RadioTowerIcon, ShieldCheckIcon } from "lucide-react";
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
import { cn } from "~/utils/cn";
import {
  buildFlowcordiaProductionRunCommand,
  FLOWCORDIA_PRODUCTION_CONFIRMATION,
} from "./command-contract";
import type { FlowcordiaProductionProjection } from "./presentation";

interface ProductionRunResponse {
  ok: boolean;
  status?: "started";
  run?: { friendlyId: string; cached: boolean };
  error?: string;
  message?: string;
  retryable?: boolean;
}

function parsePayload(value: string): { value?: JsonValue; error?: string } {
  if (new TextEncoder().encode(value).length > 64 * 1024) {
    return { error: "Production proof payload must stay under 64 KiB." };
  }
  try {
    const payload = JSON.parse(value) as JsonValue;
    if (findInlineSecretPath(payload)) {
      return { error: "Production proof payloads cannot contain inline secret-like values." };
    }
    return { value: payload };
  } catch {
    return { error: "Payload must be valid JSON." };
  }
}

function stateTone(state: FlowcordiaProductionProjection["state"]): string {
  switch (state) {
    case "READY":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "FAILED":
    case "OUT_OF_SYNC":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "WAITING_FOR_DEPLOYMENT":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
    default:
      return "border-grid-bright bg-background-bright text-text-dimmed";
  }
}

export function WorkflowProductionProofPanel({
  workflowId,
  production,
  commandPath,
  canTrigger,
}: {
  workflowId: string;
  production: FlowcordiaProductionProjection;
  commandPath: string;
  canTrigger: boolean;
}) {
  const revalidator = useRevalidator();
  const fetcher = useFetcher<ProductionRunResponse>();
  const submitted = useRef(false);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [payloadText, setPayloadText] = useState("{}");
  const parsedPayload = useMemo(() => parsePayload(payloadText), [payloadText]);
  const running = production.latestRun?.proof === "PENDING";
  const ready =
    production.state === "READY" &&
    Boolean(production.proposal?.proposalId) &&
    Boolean(production.proposal?.mergeCommitSha) &&
    canTrigger;

  useEffect(() => {
    if (!submitted.current || fetcher.state !== "idle") return;
    submitted.current = false;
    revalidator.revalidate();
  }, [fetcher.state, revalidator]);

  useEffect(() => {
    if (!running && production.state !== "WAITING_FOR_DEPLOYMENT") return;
    const timer = window.setInterval(() => revalidator.revalidate(), 5_000);
    return () => window.clearInterval(timer);
  }, [production.state, revalidator, running]);

  const submit = () => {
    if (
      !ready ||
      fetcher.state !== "idle" ||
      confirmation !== FLOWCORDIA_PRODUCTION_CONFIRMATION ||
      parsedPayload.value === undefined ||
      !production.proposal
    ) {
      return;
    }
    submitted.current = true;
    fetcher.submit(
      buildFlowcordiaProductionRunCommand({
        workflowId,
        expectedProposalId: production.proposal.proposalId,
        expectedMergeCommitSha: production.proposal.mergeCommitSha,
        requestId: crypto.randomUUID(),
        payload: parsedPayload.value,
      }),
      { method: "POST", action: commandPath, encType: "application/json" }
    );
    setOpen(false);
    setConfirmation("");
  };

  return (
    <section
      data-testid="flowcordia-production-proof"
      data-state={production.state}
      data-proposal-id={production.proposal?.proposalId ?? ""}
      data-proposal-head={production.proposal?.headSha ?? ""}
      data-merge-commit={production.proposal?.mergeCommitSha ?? ""}
      data-deployment-version={production.deployment?.version ?? ""}
      data-deployment-commit={production.deployment?.commitSha ?? ""}
      data-run-id={production.latestRun?.friendlyId ?? ""}
      data-run-status={production.latestRun?.status ?? ""}
      data-run-proof={production.latestRun?.proof ?? ""}
      className="border-b border-grid-bright bg-background-dimmed px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <RadioTowerIcon className="size-4 text-emerald-300" />
            <h3 className="text-sm font-medium text-text-bright">Production execution proof</h3>
            <Badge className={cn("border", stateTone(production.state))}>{production.state}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xxs leading-4 text-text-dimmed">
            {production.message} Production proof executes real reviewed side effects and must use a
            non-sensitive idempotent fixture.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              data-testid="flowcordia-production-open"
              variant="primary/small"
              LeadingIcon={ShieldCheckIcon}
              disabled={!ready || running || fetcher.state !== "idle"}
            >
              Run production proof
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Run the exact promoted workflow in production?</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              This locks execution to production version{" "}
              <span className="font-mono">{production.deployment?.version ?? "unavailable"}</span>{" "}
              at merge commit{" "}
              <span className="font-mono">
                {production.proposal?.mergeCommitSha.slice(0, 8) ?? "unavailable"}
              </span>
              . It can perform real external side effects.
            </DialogDescription>

            <label className="mt-4 block text-xs font-medium text-text-bright">
              Non-sensitive JSON payload
              <textarea
                data-testid="flowcordia-production-payload"
                value={payloadText}
                onChange={(event) => setPayloadText(event.target.value)}
                rows={8}
                spellCheck={false}
                className="mt-1.5 w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 font-mono text-xs text-text-bright outline-none focus:border-indigo-400"
              />
            </label>
            {parsedPayload.error ? (
              <div className="mt-2 flex items-start gap-2 text-xs text-rose-200">
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                {parsedPayload.error}
              </div>
            ) : null}

            <label className="mt-4 block text-xs font-medium text-text-bright">
              Type <span className="font-mono">{FLOWCORDIA_PRODUCTION_CONFIRMATION}</span>
              <input
                data-testid="flowcordia-production-confirmation"
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
                data-testid="flowcordia-production-confirm"
                variant="primary/small"
                LeadingIcon={CheckCircle2Icon}
                isLoading={fetcher.state !== "idle"}
                disabled={
                  confirmation !== FLOWCORDIA_PRODUCTION_CONFIRMATION ||
                  parsedPayload.value === undefined ||
                  fetcher.state !== "idle"
                }
                onClick={submit}
              >
                Execute exact production version
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {production.proposal && production.deployment ? (
        <div className="mt-3 grid gap-2 text-xxs text-text-dimmed sm:grid-cols-3">
          <div className="rounded border border-grid-bright bg-background-bright px-3 py-2">
            <div className="uppercase tracking-wide">Proposal</div>
            <div className="mt-1 truncate font-mono text-text-bright">
              {production.proposal.proposalId}
            </div>
          </div>
          <div className="rounded border border-grid-bright bg-background-bright px-3 py-2">
            <div className="uppercase tracking-wide">Merge commit</div>
            <div className="mt-1 truncate font-mono text-text-bright">
              {production.proposal.mergeCommitSha}
            </div>
          </div>
          <div className="rounded border border-grid-bright bg-background-bright px-3 py-2">
            <div className="uppercase tracking-wide">Production version</div>
            <div className="mt-1 truncate font-mono text-text-bright">
              {production.deployment.version}
            </div>
          </div>
        </div>
      ) : null}

      {fetcher.data && !fetcher.data.ok ? (
        <div className="mt-3 rounded border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {fetcher.data.message ?? "The production proof run failed to start."}
        </div>
      ) : null}
      {fetcher.data?.ok && fetcher.data.run ? (
        <div
          data-testid="flowcordia-production-run-started"
          className="mt-3 rounded border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-200"
        >
          Production run {fetcher.data.run.friendlyId} started on the exact promoted deployment.
        </div>
      ) : null}

      {production.latestRun ? (
        <div className="mt-3 rounded border border-grid-bright bg-background-bright px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-mono text-text-bright">{production.latestRun.friendlyId}</span>
            <span className="text-text-dimmed">
              {production.latestRun.status} · {production.latestRun.proof}
            </span>
          </div>
          {production.latestRun.nodes.length > 0 ? (
            <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {production.latestRun.nodes.map((node) => (
                <div
                  key={node.nodeId}
                  className="flex items-center justify-between gap-2 rounded border border-grid-dimmed px-2 py-1 text-xxs"
                >
                  <span className="truncate text-text-dimmed">{node.nodeId}</span>
                  <span className="shrink-0 text-text-bright">{node.status}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
