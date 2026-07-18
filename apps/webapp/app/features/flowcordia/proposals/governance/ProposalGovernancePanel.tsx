import { DialogClose } from "@radix-ui/react-dialog";
import { useFetcher, useRevalidator } from "@remix-run/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  SaveIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldLockIcon } from "~/assets/icons/ShieldLockIcon";
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
import type {
  FlowcordiaProposalGovernanceEvidenceProjection,
  FlowcordiaProposalGovernancePolicyProjection,
} from "./presentation";

interface GovernanceCommandResponse {
  ok: boolean;
  status?: "updated";
  governancePolicy?: FlowcordiaProposalGovernancePolicyProjection;
  error?: string;
  message?: string;
  retryable?: boolean;
}

function listText(values: string[] | null): string {
  return values?.join("\n") ?? "";
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function duplicate(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function controlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function stateTone(state: FlowcordiaProposalGovernanceEvidenceProjection["state"]): string {
  switch (state) {
    case "SATISFIED":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
    case "PENDING":
      return "border-blue-500/25 bg-blue-500/10 text-blue-200";
    case "BLOCKED":
      return "border-rose-500/25 bg-rose-500/10 text-rose-200";
    case "NOT_APPLICABLE":
    case "UNAVAILABLE":
      return "border-grid-bright bg-background-bright text-text-dimmed";
  }
}

function StateIcon({ state }: { state: FlowcordiaProposalGovernanceEvidenceProjection["state"] }) {
  if (state === "SATISFIED") return <CheckCircle2Icon className="size-4" />;
  if (state === "BLOCKED") return <AlertTriangleIcon className="size-4" />;
  if (state === "PENDING") return <Clock3Icon className="size-4" />;
  return <ShieldCheckIcon className="size-4" />;
}

export function ProposalGovernancePanel({
  policy,
  evidence,
  commandPath,
  canWrite,
}: {
  policy: FlowcordiaProposalGovernancePolicyProjection;
  evidence: FlowcordiaProposalGovernanceEvidenceProjection;
  commandPath: string;
  canWrite: boolean;
}) {
  const fetcher = useFetcher<GovernanceCommandResponse>();
  const revalidator = useRevalidator();
  const submitted = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [minimumApprovals, setMinimumApprovals] = useState(String(policy.minimumApprovals));
  const [requiredChecks, setRequiredChecks] = useState(listText(policy.requiredCheckNames));
  const [requiredReviewers, setRequiredReviewers] = useState(listText(policy.requiredReviewerIds));
  const [allowedReviewers, setAllowedReviewers] = useState(listText(policy.allowedReviewerIds));

  const draft = useMemo(() => {
    const approvals = Number(minimumApprovals);
    const checks = parseList(requiredChecks);
    const required = parseList(requiredReviewers);
    const parsedAllowed = parseList(allowedReviewers);
    const allowed = parsedAllowed.length === 0 ? null : parsedAllowed;
    const reviewerId = /^[1-9][0-9]{0,15}$/;
    let issue: string | null = null;
    if (!Number.isSafeInteger(approvals) || approvals < 1 || approvals > 10) {
      issue = "Minimum approvals must be an integer from 1 to 10.";
    } else if ([checks, required, parsedAllowed].some((values) => values.length > 50)) {
      issue = "Each policy list can contain at most 50 unique items.";
    } else if ([checks, required, parsedAllowed].some(duplicate)) {
      issue = "Policy lists cannot contain duplicate items.";
    } else if (checks.some((value) => value.length > 160 || controlCharacter(value))) {
      issue = "Required check names must be bounded printable values.";
    } else if ([...required, ...parsedAllowed].some((value) => !reviewerId.test(value))) {
      issue = "Reviewer IDs must be numeric GitHub user IDs.";
    } else if (allowed && required.some((value) => !allowed.includes(value))) {
      issue = "Every required reviewer must also be allowed.";
    } else if (allowed && approvals > allowed.length) {
      issue = "Minimum approvals cannot exceed the allowed reviewer count.";
    }

    const weakening =
      approvals < policy.minimumApprovals
        ? "Minimum approvals cannot be reduced through this writer surface."
        : policy.requiredCheckNames.some((value) => !checks.includes(value))
          ? "Existing required checks cannot be removed through this writer surface."
          : policy.requiredReviewerIds.some((value) => !required.includes(value))
            ? "Existing required reviewers cannot be removed through this writer surface."
            : policy.allowedReviewerIds && allowed === null
              ? "The allowed-reviewer constraint cannot be removed through this writer surface."
              : policy.allowedReviewerIds &&
                  allowed?.some((value) => !policy.allowedReviewerIds?.includes(value))
                ? "The allowed-reviewer set cannot be expanded through this writer surface."
                : null;
    const changed =
      approvals !== policy.minimumApprovals ||
      !sameList(checks, policy.requiredCheckNames) ||
      !sameList(required, policy.requiredReviewerIds) ||
      (allowed === null
        ? policy.allowedReviewerIds !== null
        : policy.allowedReviewerIds === null || !sameList(allowed, policy.allowedReviewerIds));

    return { approvals, checks, required, allowed, issue: issue ?? weakening, changed };
  }, [allowedReviewers, minimumApprovals, policy, requiredChecks, requiredReviewers]);

  useEffect(() => {
    setMinimumApprovals(String(policy.minimumApprovals));
    setRequiredChecks(listText(policy.requiredCheckNames));
    setRequiredReviewers(listText(policy.requiredReviewerIds));
    setAllowedReviewers(listText(policy.allowedReviewerIds));
  }, [policy]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !submitted.current) return;
    submitted.current = false;
    revalidator.revalidate();
  }, [fetcher.data, fetcher.state, revalidator]);

  const savePolicy = () => {
    if (draft.issue || !draft.changed) return;
    submitted.current = true;
    fetcher.submit(
      {
        operation: "update",
        expectedVersion: policy.version,
        profile: {
          schemaVersion: "0.1",
          minimumApprovals: draft.approvals,
          requiredCheckNames: draft.checks,
          requiredReviewerIds: draft.required,
          allowedReviewerIds: draft.allowed,
        },
      },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
  };

  return (
    <section className="shrink-0 border-b border-grid-bright bg-background-dimmed">
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-2 text-xs",
          stateTone(evidence.state)
        )}
      >
        <StateIcon state={evidence.state} />
        <strong className="font-medium">
          Promotion governance: {evidence.state.toLowerCase().replaceAll("_", " ")}
        </strong>
        <span className="opacity-80">{evidence.message}</span>
        {evidence.evaluatedHeadSha && (
          <span className="ml-auto font-mono text-xxs">
            head {evidence.evaluatedHeadSha.slice(0, 8)} · policy {policy.digest.slice(0, 8)}
          </span>
        )}
      </div>

      <div className="grid max-h-[290px] grid-cols-1 overflow-auto lg:grid-cols-[1.1fr_1fr]">
        <div className="border-b border-grid-bright p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-bright">Repository policy</h3>
              <p className="mt-1 text-xs text-text-dimmed">
                {policy.source === "default"
                  ? "Enterprise defaults are active until the first saved configuration."
                  : `Stored policy version ${policy.version}.`}{" "}
                Studio repository writers can only strengthen this policy.
              </p>
            </div>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="secondary/small"
                  LeadingIcon={SaveIcon}
                  disabled={
                    !canWrite || fetcher.state !== "idle" || !draft.changed || Boolean(draft.issue)
                  }
                  isLoading={fetcher.state !== "idle"}
                >
                  Review policy
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm repository policy strengthening</DialogTitle>
                </DialogHeader>
                <DialogDescription>
                  This Studio writer path cannot later relax a stored policy. Review the effective
                  requirements before saving{" "}
                  {policy.version ? "the version after " + policy.version : "the initial version"}.
                </DialogDescription>
                <div className="mt-3 rounded border border-grid-bright bg-background-dimmed p-3 text-xs text-text-dimmed">
                  <p>{draft.approvals} eligible current-head approval(s)</p>
                  <p>{draft.checks.length} required check(s)</p>
                  <p>{draft.required.length} required reviewer(s)</p>
                  <p>
                    {draft.allowed === null
                      ? "Any eligible non-self reviewer is allowed"
                      : `${draft.allowed.length} reviewer(s) in the allowed set`}
                  </p>
                </div>
                <DialogFooter className="mt-4">
                  <DialogClose asChild>
                    <Button variant="secondary/small">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="primary/small"
                    LeadingIcon={ShieldLockIcon}
                    onClick={() => {
                      savePolicy();
                      setConfirmOpen(false);
                    }}
                  >
                    Confirm strengthening
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-text-dimmed">
              Minimum approvals
              <input
                className="mt-1 h-8 w-full rounded border border-grid-bright bg-background-bright px-2 text-sm text-text-bright outline-none focus:border-indigo-500"
                type="number"
                min={1}
                max={10}
                value={minimumApprovals}
                disabled={!canWrite}
                onChange={(event) => setMinimumApprovals(event.target.value)}
              />
            </label>
            <label className="text-xs text-text-dimmed">
              Required checks
              <textarea
                className="mt-1 min-h-20 w-full resize-y rounded border border-grid-bright bg-background-bright px-2 py-1 font-mono text-xs text-text-bright outline-none focus:border-indigo-500"
                placeholder="PR Checks"
                value={requiredChecks}
                disabled={!canWrite}
                onChange={(event) => setRequiredChecks(event.target.value)}
              />
            </label>
            <label className="text-xs text-text-dimmed">
              Required reviewer IDs
              <textarea
                className="mt-1 min-h-20 w-full resize-y rounded border border-grid-bright bg-background-bright px-2 py-1 font-mono text-xs text-text-bright outline-none focus:border-indigo-500"
                placeholder="123456"
                value={requiredReviewers}
                disabled={!canWrite}
                onChange={(event) => setRequiredReviewers(event.target.value)}
              />
            </label>
            <label className="text-xs text-text-dimmed">
              Allowed reviewer IDs
              <textarea
                className="mt-1 min-h-20 w-full resize-y rounded border border-grid-bright bg-background-bright px-2 py-1 font-mono text-xs text-text-bright outline-none focus:border-indigo-500"
                placeholder="Leave empty for any eligible reviewer"
                value={allowedReviewers}
                disabled={!canWrite}
                onChange={(event) => setAllowedReviewers(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xxs text-text-dimmed">
            <span className="inline-flex items-center gap-1 rounded border border-grid-bright px-2 py-1">
              <ShieldLockIcon className="size-3" /> Current-head approvals required
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-grid-bright px-2 py-1">
              <ShieldLockIcon className="size-3" /> Self approval forbidden
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-grid-bright px-2 py-1">
              <ShieldLockIcon className="size-3" /> Changes requested blocks promotion
            </span>
          </div>
          {draft.issue && <p className="mt-3 text-xs text-amber-300">{draft.issue}</p>}
          {fetcher.data && !fetcher.data.ok && (
            <p className="mt-3 text-xs text-rose-300">
              {fetcher.data.message ?? "Proposal governance could not be saved."}
            </p>
          )}
          {fetcher.data?.ok && fetcher.state === "idle" && (
            <p className="mt-3 text-xs text-emerald-300">
              Policy saved. Durable governance evidence has been refreshed.
            </p>
          )}
        </div>

        <div className="p-4">
          <h3 className="text-sm font-medium text-text-bright">Exact-head evidence</h3>
          <div className="mt-3 grid gap-3 text-xs">
            <div className="rounded border border-grid-bright bg-background-bright p-3">
              <div className="flex items-center justify-between">
                <span className="text-text-dimmed">Eligible approvals</span>
                <span className="font-mono text-text-bright">
                  {evidence.countedReviewerIds.length}/{policy.minimumApprovals}
                </span>
              </div>
              {evidence.countedReviewerIds.length > 0 && (
                <p className="mt-2 font-mono text-xxs text-text-dimmed">
                  {evidence.countedReviewerIds.join(", ")}
                </p>
              )}
            </div>

            <div className="rounded border border-grid-bright bg-background-bright p-3">
              <span className="text-text-dimmed">Repository function validation</span>
              <p className="mt-1 text-text-bright">
                {evidence.functionValidation.state.toLowerCase().replaceAll("_", " ")} ·{" "}
                {evidence.functionValidation.message}
              </p>
            </div>

            {evidence.checks.length > 0 && (
              <div className="rounded border border-grid-bright bg-background-bright p-3">
                <span className="text-text-dimmed">Required checks</span>
                <div className="mt-2 space-y-1 font-mono text-xxs">
                  {evidence.checks.map((check) => (
                    <div key={check.name} className="flex justify-between gap-3">
                      <span className="truncate text-text-bright">{check.name}</span>
                      <span
                        className={
                          check.status === "passed" ? "text-emerald-300" : "text-amber-300"
                        }
                      >
                        {check.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {evidence.reviewers.length > 0 && (
              <div className="rounded border border-grid-bright bg-background-bright p-3">
                <span className="text-text-dimmed">Reviewer evidence</span>
                <div className="mt-2 space-y-1 font-mono text-xxs">
                  {evidence.reviewers.map((reviewer) => (
                    <div key={reviewer.reviewerId} className="flex justify-between gap-3">
                      <span className="text-text-bright">
                        {reviewer.reviewerId}
                        {reviewer.required ? " · required" : ""}
                      </span>
                      <span
                        className={
                          reviewer.state === "approved" && reviewer.currentHead
                            ? "text-emerald-300"
                            : "text-amber-300"
                        }
                      >
                        {reviewer.state}
                        {reviewer.state === "approved" && !reviewer.currentHead ? " · stale" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {evidence.blockers.length > 0 && (
              <div className="rounded border border-rose-500/25 bg-rose-500/10 p-3">
                <span className="text-rose-200">Promotion blockers</span>
                <div className="mt-2 space-y-1 text-xxs text-rose-200">
                  {evidence.blockers.slice(0, 8).map((blocker, index) => (
                    <p key={`${blocker.code}:${blocker.reviewerId ?? blocker.checkName ?? index}`}>
                      {blocker.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
