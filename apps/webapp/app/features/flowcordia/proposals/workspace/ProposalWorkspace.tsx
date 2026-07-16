import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { DialogClose } from "@radix-ui/react-dialog";
import { Link, useFetcher, useRevalidator, useSearchParams } from "@remix-run/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  GitBranchIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { DateTime } from "~/components/primitives/DateTime";
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
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/primitives/Resizable";
import { cn } from "~/utils/cn";
import {
  flowcordiaProposalStateFilters,
  flowcordiaProposalStateLabel,
  summarizeFlowcordiaProposals,
  type FlowcordiaProposalCommandAcknowledgement,
  type FlowcordiaProposalCommandError,
  type FlowcordiaProposalWorkspaceCursor,
  type FlowcordiaProposalWorkspaceItem,
} from "./presentation";

type CommandResponse = FlowcordiaProposalCommandAcknowledgement | FlowcordiaProposalCommandError;
type MergeMethod = "squash" | "merge" | "rebase";

function isCommandError(
  value: CommandResponse | undefined
): value is FlowcordiaProposalCommandError {
  return Boolean(value && "error" in value);
}

function stateClassName(state: FlowcordiaProposalWorkspaceItem["state"]): string {
  switch (state) {
    case "CREATING":
    case "PROMOTING":
      return "border-indigo-500/35 bg-indigo-500/10 text-indigo-300";
    case "DRAFT":
      return "border-blue-500/35 bg-blue-500/10 text-blue-300";
    case "READY":
      return "border-green-500/35 bg-green-500/10 text-green-300";
    case "MERGED":
      return "border-violet-500/35 bg-violet-500/10 text-violet-300";
    case "RECONCILING":
      return "border-yellow-500/35 bg-yellow-500/10 text-yellow-300";
    case "FAILED":
      return "border-rose-500/35 bg-rose-500/10 text-rose-300";
    case "CLOSED":
      return "border-charcoal-600 bg-charcoal-750 text-text-dimmed";
  }
}

function StateBadge({ state }: { state: FlowcordiaProposalWorkspaceItem["state"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xxs font-medium",
        stateClassName(state)
      )}
    >
      {flowcordiaProposalStateLabel(state)}
    </span>
  );
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 8) : "Not observed";
}

function searchHref(
  basePath: string,
  current: URLSearchParams,
  update: Record<string, string | null>
): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(update)) {
    value === null ? next.delete(key) : next.set(key, value);
  }
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-grid-dimmed bg-background-bright px-3 py-2">
      <div className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold text-text-bright", tone)}>{value}</div>
    </div>
  );
}

function IdentityValue({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <div
      className={cn("min-w-0 break-all text-xs leading-5 text-text-dimmed", mono && "font-mono")}
    >
      {children}
    </div>
  );
}

function IdentityRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 border-b border-grid-dimmed py-2.5 last:border-b-0">
      <div className="text-xs font-medium text-text-bright">{label}</div>
      <IdentityValue mono={mono}>{children}</IdentityValue>
    </div>
  );
}

function GitDeliveryPath({ proposal }: { proposal: FlowcordiaProposalWorkspaceItem }) {
  const stages = [
    {
      label: "Base",
      value: proposal.git.baseBranch,
      detail: shortSha(proposal.git.baseCommitSha),
      icon: GitBranchIcon,
    },
    {
      label: "Proposal",
      value: proposal.git.proposalBranch,
      detail: shortSha(proposal.git.headSha),
      icon: GitCommitIcon,
    },
    {
      label: "Review",
      value: proposal.pullRequest ? `PR #${proposal.pullRequest.number}` : "Not opened",
      detail: proposal.pullRequest?.merged
        ? "Merged"
        : proposal.pullRequest?.draft
          ? "Draft"
          : (proposal.pullRequest?.state ?? "Pending"),
      icon: GitPullRequestIcon,
    },
  ];

  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-md border border-grid-bright bg-background-bright">
      {stages.map((stage, index) => (
        <div
          key={stage.label}
          className={cn("relative min-w-0 px-3 py-3", index > 0 && "border-l border-grid-bright")}
        >
          <div className="flex items-center gap-1.5 text-xxs font-medium uppercase tracking-wide text-text-dimmed">
            <stage.icon className="size-3.5" />
            {stage.label}
          </div>
          <div className="mt-1.5 truncate text-xs font-medium text-text-bright" title={stage.value}>
            {stage.value}
          </div>
          <div className="mt-0.5 truncate font-mono text-xxs text-text-dimmed">{stage.detail}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl border border-grid-bright bg-background-bright">
          <GitPullRequestIcon className="size-5 text-indigo-400" />
        </div>
        <h2 className="mt-4 text-base font-medium text-text-bright">Select a proposal</h2>
        <p className="mt-2 text-sm leading-6 text-text-dimmed">
          Inspect the exact workflow, branch, pull request, reconciliation state, and promotion
          boundary without exposing installation credentials or internal database identifiers.
        </p>
      </div>
    </div>
  );
}

export function ProposalWorkspace({
  proposals,
  selectedProposalId,
  repository,
  nextCursor,
  basePath,
  commandPath,
  canWrite,
}: {
  proposals: FlowcordiaProposalWorkspaceItem[];
  selectedProposalId?: string;
  repository: { owner: string; name: string; branch: string };
  nextCursor: FlowcordiaProposalWorkspaceCursor | null;
  basePath: string;
  commandPath: string;
  canWrite: boolean;
}) {
  const [searchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const command = useFetcher<CommandResponse>();
  const submittedOperation = useRef<"submit" | "promote" | null>(null);
  const [commandTargetId, setCommandTargetId] = useState<string | null>(null);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("squash");
  const [promoteOpen, setPromoteOpen] = useState(false);
  const selected =
    proposals.find((proposal) => proposal.proposalId === selectedProposalId) ?? proposals[0];
  const summary = useMemo(() => summarizeFlowcordiaProposals(proposals), [proposals]);
  const activeFilter = searchParams.get("state");
  const isSubmitting = command.state !== "idle";

  useEffect(() => {
    if (command.state !== "idle" || !submittedOperation.current) return;
    if (!isCommandError(command.data)) setCommandTargetId(null);
    // Failures can also persist RECONCILING or policy-blocked state, so the
    // inspector always reloads durable truth after a completed command.
    revalidator.revalidate();
    submittedOperation.current = null;
  }, [command.data, command.state, revalidator]);

  function runCommand(operation: "submit" | "promote") {
    if (!selected?.git.headSha || isSubmitting) return;
    submittedOperation.current = operation;
    setCommandTargetId(selected.proposalId);
    command.submit(
      operation === "submit"
        ? {
            operation,
            proposalId: selected.proposalId,
            expectedHeadSha: selected.git.headSha,
          }
        : {
            operation,
            proposalId: selected.proposalId,
            expectedHeadSha: selected.git.headSha,
            mergeMethod,
          },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full max-h-full">
      <ResizablePanel id="flowcordia-proposals" min="420px" className="max-h-full">
        <div className="flex h-full min-h-0 flex-col bg-background-dimmed">
          <div className="border-b border-grid-bright p-3">
            <div className="grid grid-cols-4 gap-2">
              <Metric label="Visible" value={summary.total} />
              <Metric label="Active" value={summary.active} tone="text-blue-300" />
              <Metric label="Ready" value={summary.awaitingReview} tone="text-green-300" />
              <Metric label="Attention" value={summary.needsAttention} tone="text-yellow-300" />
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              <Link
                to={searchHref(basePath, searchParams, {
                  state: null,
                  proposal: null,
                  cursorUpdatedAt: null,
                  cursorProposalId: null,
                })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xxs font-medium transition",
                  !activeFilter
                    ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                    : "border-grid-bright text-text-dimmed hover:bg-charcoal-750 hover:text-text-bright"
                )}
              >
                All
              </Link>
              {flowcordiaProposalStateFilters.map((state) => (
                <Link
                  key={state}
                  to={searchHref(basePath, searchParams, {
                    state,
                    proposal: null,
                    cursorUpdatedAt: null,
                    cursorProposalId: null,
                  })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xxs font-medium transition",
                    activeFilter === state
                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                      : "border-grid-bright text-text-dimmed hover:bg-charcoal-750 hover:text-text-bright"
                  )}
                >
                  {flowcordiaProposalStateLabel(state)}
                </Link>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600">
            {proposals.length === 0 ? (
              <div className="flex h-full min-h-72 items-center justify-center p-8 text-center">
                <div className="max-w-sm">
                  <ShieldCheckIcon className="mx-auto size-8 text-indigo-400" />
                  <h2 className="mt-3 text-sm font-medium text-text-bright">No proposals here</h2>
                  <p className="mt-2 text-xs leading-5 text-text-dimmed">
                    This workspace reads the durable proposal control plane. Creating and editing
                    workflow graphs will arrive through the Studio canvas in a separate review
                    boundary.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-grid-dimmed">
                {proposals.map((proposal) => {
                  const selectedRow = proposal.proposalId === selected?.proposalId;
                  return (
                    <Link
                      key={proposal.proposalId}
                      to={searchHref(basePath, searchParams, { proposal: proposal.proposalId })}
                      replace
                      className={cn(
                        "block border-l-2 px-3 py-3 transition focus-custom",
                        selectedRow
                          ? "border-l-indigo-500 bg-charcoal-750"
                          : "border-l-transparent hover:bg-charcoal-800"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text-bright">
                            {proposal.workflow.id}
                          </div>
                          <div className="mt-1 truncate font-mono text-xxs text-text-dimmed">
                            {proposal.proposalId}
                          </div>
                        </div>
                        <StateBadge state={proposal.state} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xxs text-text-dimmed">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <GitBranchIcon className="size-3 shrink-0" />
                          <span className="truncate">{proposal.git.proposalBranch}</span>
                        </span>
                        <DateTime
                          date={proposal.activity.updatedAt}
                          includeSeconds={false}
                          includeDate={false}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex min-h-11 items-center justify-between border-t border-grid-bright px-3 py-2 text-xxs text-text-dimmed">
            <span>
              {repository.owner}/{repository.name} · {repository.branch}
            </span>
            {nextCursor ? (
              <LinkButton
                variant="minimal/small"
                to={searchHref(basePath, searchParams, {
                  proposal: null,
                  cursorUpdatedAt: nextCursor.updatedAt,
                  cursorProposalId: nextCursor.proposalId,
                })}
              >
                Next 50
              </LinkButton>
            ) : (
              <span>End of view</span>
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle id="flowcordia-proposal-handle" />

      <ResizablePanel
        id="flowcordia-proposal-inspector"
        min="360px"
        default="460px"
        max="680px"
        className="max-h-full"
      >
        {!selected ? (
          <EmptyInspector />
        ) : (
          <div className="flex h-full min-h-0 flex-col bg-background-bright">
            <div className="border-b border-grid-bright px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StateBadge state={selected.state} />
                    <span className="text-xxs text-text-dimmed">
                      Operation: {selected.operation}
                    </span>
                  </div>
                  <h2 className="mt-2 truncate text-lg font-semibold text-text-bright">
                    {selected.workflow.id}
                  </h2>
                  <p className="mt-1 truncate font-mono text-xs text-text-dimmed">
                    {selected.workflow.path}
                  </p>
                </div>
                {selected.pullRequest?.url ? (
                  <LinkButton
                    variant="secondary/small"
                    to={selected.pullRequest.url}
                    LeadingIcon={ArrowTopRightOnSquareIcon}
                  >
                    PR #{selected.pullRequest.number}
                  </LinkButton>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600">
              <GitDeliveryPath proposal={selected} />

              {selected.lastError ? (
                <div className="mt-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-yellow-300">
                    <AlertTriangleIcon className="size-4" />
                    {selected.lastError.code ?? "Proposal needs attention"}
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-yellow-100/70">
                    {selected.lastError.message}
                  </p>
                </div>
              ) : null}

              <section className="mt-5">
                <h3 className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                  Governed identity
                </h3>
                <div className="mt-2 rounded-md border border-grid-bright px-3">
                  <IdentityRow label="Proposal ID" mono>
                    {selected.proposalId}
                  </IdentityRow>
                  <IdentityRow label="Workflow hash" mono>
                    sha256:{selected.workflow.desiredSha256}
                  </IdentityRow>
                  <IdentityRow label="Base commit" mono>
                    {selected.git.baseCommitSha}
                  </IdentityRow>
                  <IdentityRow label="Observed head" mono>
                    {selected.git.headSha ?? "Pending reconciliation"}
                  </IdentityRow>
                  {selected.pullRequest?.mergeCommitSha ? (
                    <IdentityRow label="Merge commit" mono>
                      {selected.pullRequest.mergeCommitSha}
                    </IdentityRow>
                  ) : null}
                </div>
              </section>

              <section className="mt-5">
                <h3 className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                  Activity
                </h3>
                <div className="mt-2 rounded-md border border-grid-bright px-3">
                  <IdentityRow label="Updated">
                    <DateTime date={selected.activity.updatedAt} includeSeconds={false} />
                  </IdentityRow>
                  <IdentityRow label="GitHub event">
                    {selected.activity.githubEventAt ? (
                      <DateTime date={selected.activity.githubEventAt} includeSeconds={false} />
                    ) : (
                      "Not observed"
                    )}
                  </IdentityRow>
                  <IdentityRow label="Reconciled">
                    {selected.activity.reconciledAt ? (
                      <DateTime date={selected.activity.reconciledAt} includeSeconds={false} />
                    ) : (
                      "Not reconciled"
                    )}
                  </IdentityRow>
                </div>
              </section>

              <section className="mt-5 rounded-md border border-grid-bright bg-background-dimmed p-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-indigo-400" />
                  <div>
                    <h3 className="text-xs font-medium text-text-bright">Enterprise boundary</h3>
                    <p className="mt-1 text-xs leading-5 text-text-dimmed">
                      Commands are rebound to the signed-in user, project, GitHub installation, and
                      exact observed head on the server. The browser cannot select tenant or
                      repository identities.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div className="border-t border-grid-bright p-3">
              {isCommandError(command.data) && commandTargetId === selected.proposalId ? (
                <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {command.data.error.message}
                </div>
              ) : null}

              {!canWrite ? (
                <div className="text-xs leading-5 text-text-dimmed">
                  You have read access. A project member with GitHub write permission must advance
                  this proposal.
                </div>
              ) : selected.availableAction === "submit" ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs leading-5 text-text-dimmed">
                    Open the exact proposal head for governed review.
                  </div>
                  <Button
                    variant="primary/small"
                    LeadingIcon={GitPullRequestIcon}
                    isLoading={isSubmitting}
                    onClick={() => runCommand("submit")}
                  >
                    Submit for review
                  </Button>
                </div>
              ) : selected.availableAction === "promote" ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs leading-5 text-text-dimmed">
                    Fresh approvals and the exact head are checked again on GitHub.
                  </div>
                  <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="primary/small"
                        LeadingIcon={CheckCircle2Icon}
                        isLoading={isSubmitting}
                      >
                        Promote
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Promote this exact workflow version?</DialogTitle>
                      </DialogHeader>
                      <DialogDescription>
                        Flowcordia will re-read GitHub approvals and branch protection before
                        merging head{" "}
                        <span className="font-mono">{shortSha(selected.git.headSha)}</span>.
                      </DialogDescription>
                      <label className="mt-3 block text-xs font-medium text-text-bright">
                        Merge method
                        <select
                          value={mergeMethod}
                          onChange={(event) => setMergeMethod(event.target.value as MergeMethod)}
                          className="mt-1.5 h-9 w-full rounded border border-grid-bright bg-background-dimmed px-2.5 text-sm text-text-bright focus-custom"
                        >
                          <option value="squash">Squash</option>
                          <option value="merge">Merge commit</option>
                          <option value="rebase">Rebase</option>
                        </select>
                      </label>
                      <DialogFooter className="mt-4">
                        <DialogClose asChild>
                          <Button variant="secondary/small">Cancel</Button>
                        </DialogClose>
                        <Button
                          variant="primary/small"
                          LeadingIcon={CheckCircle2Icon}
                          isLoading={isSubmitting}
                          onClick={() => {
                            runCommand("promote");
                            setPromoteOpen(false);
                          }}
                        >
                          Verify and promote
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 text-xs leading-5 text-text-dimmed">
                  <span>
                    {selected.state === "RECONCILING"
                      ? "Actions are paused until GitHub identity and head reconciliation completes."
                      : "No governed action is available in this state."}
                  </span>
                  <Button
                    variant="minimal/small"
                    LeadingIcon={RefreshCwIcon}
                    isLoading={revalidator.state !== "idle"}
                    onClick={() => revalidator.revalidate()}
                  >
                    Refresh
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function ProposalWorkspaceUnavailable({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-lg border border-grid-bright bg-background-bright p-6 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-full border border-yellow-500/30 bg-yellow-500/10">
          <AlertTriangleIcon className="size-5 text-yellow-300" />
        </div>
        <h2 className="mt-4 text-base font-medium text-text-bright">Studio is not connected yet</h2>
        <p className="mt-2 text-sm leading-6 text-text-dimmed">{message}</p>
        <Badge className="mx-auto mt-4 w-fit">No runtime paths changed</Badge>
      </div>
    </div>
  );
}
