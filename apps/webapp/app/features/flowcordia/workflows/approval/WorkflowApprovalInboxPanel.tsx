import { useFetcher } from "@remix-run/react";
import { useState } from "react";
import { Badge } from "~/components/primitives/Badge";
import { Button } from "~/components/primitives/Buttons";
import type { FlowcordiaApprovalInboxItem, FlowcordiaApprovalInboxProjection } from "./contract";

type CommandResponse =
  | { ok: true; status: "completed"; idempotent: boolean }
  | {
      ok: false;
      error: string;
      message: string;
      retryable?: boolean;
      observedDecision?: "approved" | "rejected" | null;
    };

type ApprovalAttempt = {
  requestId: string;
  decision: "approved" | "rejected";
};
type ApprovalInboxItem = FlowcordiaApprovalInboxItem & { canDecide: boolean };
type ApprovalInboxProjection = Omit<FlowcordiaApprovalInboxProjection, "items"> & {
  items: ApprovalInboxItem[];
};

function timestamp(value: string): string {
  return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

function stateLabel(item: FlowcordiaApprovalInboxItem): string {
  switch (item.state) {
    case "WAITING":
      return "Waiting";
    case "DECIDING":
      return "Completing";
    case "DECIDED":
      return item.decision === "approved" ? "Approved" : "Rejected";
    case "FAILED":
      return "Needs retry";
    case "TIMED_OUT":
      return "Timed out";
  }
}

function ApprovalCard({ item, commandPath }: { item: ApprovalInboxItem; commandPath: string }) {
  const fetcher = useFetcher<CommandResponse>();
  const [comment, setComment] = useState("");
  const [attempt, setAttempt] = useState<ApprovalAttempt | null>(null);
  const busy = fetcher.state !== "idle";
  const canSubmit =
    item.state === "WAITING" &&
    item.canDecide &&
    !busy &&
    (!item.requireComment || comment.trim().length > 0);
  const submit = (decision: "approved" | "rejected") => {
    const currentAttempt = attempt ?? { requestId: crypto.randomUUID(), decision };
    if (currentAttempt.decision !== decision) return;
    if (!attempt) setAttempt(currentAttempt);
    fetcher.submit(
      {
        operation: "decide_approval",
        waitpointId: item.waitpointId,
        expectedWorkflowId: item.workflowId,
        expectedRunId: item.runId,
        expectedNodeId: item.nodeId,
        requestId: currentAttempt.requestId,
        decision: currentAttempt.decision,
        comment,
      },
      { method: "post", action: commandPath, encType: "application/json" }
    );
  };

  return (
    <article
      data-testid={`flowcordia-approval-${item.waitpointId}`}
      data-state={item.state}
      className="rounded border border-grid-bright bg-background-bright p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-xs font-medium text-text-bright">{item.prompt}</h4>
          <div className="mt-1 text-xxs text-text-dimmed">
            {item.workflowId} · {item.nodeId} · {item.runId}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {item.escalationState === "REMINDER_DUE" && (
            <Badge className="border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
              Reminder due
            </Badge>
          )}
          {item.escalationState === "ESCALATED" && (
            <Badge className="border border-rose-500/30 bg-rose-500/10 text-rose-200">
              Escalated
            </Badge>
          )}
          <Badge className="border border-grid-bright bg-background-dimmed text-text-dimmed">
            {stateLabel(item)}
          </Badge>
        </div>
      </div>
      {item.instruction && (
        <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-text-dimmed">
          {item.instruction}
        </p>
      )}
      <div className="mt-3 text-xxs text-text-dimmed">
        Created {timestamp(item.createdAt)}
        {item.reminderAt ? ` · reminder ${timestamp(item.reminderAt)}` : ""}
        {item.escalationAt ? ` · escalation ${timestamp(item.escalationAt)}` : ""}
        {` · timeout ${timestamp(item.timeoutAt)}`}
      </div>

      {item.state === "WAITING" && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-xxs text-text-dimmed">
              Reviewer comment {item.requireComment ? "(required)" : "(optional)"}
            </span>
            <textarea
              className="w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400"
              value={comment}
              disabled={!item.canDecide || busy || attempt !== null}
              rows={3}
              maxLength={2_000}
              placeholder="Record the reason for this decision."
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary/small"
              disabled={!canSubmit || (attempt !== null && attempt.decision !== "approved")}
              onClick={() => submit("approved")}
            >
              Approve
            </Button>
            <Button
              variant="secondary/small"
              disabled={!canSubmit || (attempt !== null && attempt.decision !== "rejected")}
              onClick={() => submit("rejected")}
            >
              Reject
            </Button>
          </div>
          {attempt && fetcher.data && !fetcher.data.ok && fetcher.data.retryable && (
            <div className="text-xxs text-text-dimmed">
              Retry the same {attempt.decision} decision; its request identity and comment are
              locked.
            </div>
          )}
          {!item.canDecide && (
            <div className="text-xxs text-text-dimmed">
              Your current role cannot complete waitpoints in this environment.
            </div>
          )}
          {fetcher.data && !fetcher.data.ok && (
            <div className="rounded border border-rose-500/25 bg-rose-500/10 px-2.5 py-2 text-xxs text-rose-200">
              {fetcher.data.message}
            </div>
          )}
        </div>
      )}

      {item.decision && item.state !== "WAITING" && (
        <div className="mt-3 rounded border border-grid-dimmed bg-background-dimmed px-2.5 py-2 text-xs text-text-dimmed">
          <div>
            {item.decision === "approved" ? "Approved" : "Rejected"}
            {item.decidedAt ? ` at ${timestamp(item.decidedAt)}` : ""}
          </div>
          {item.comment && <div className="mt-1 whitespace-pre-wrap">{item.comment}</div>}
        </div>
      )}
    </article>
  );
}

export function WorkflowApprovalInboxPanel({
  inbox,
  commandPath,
}: {
  inbox: ApprovalInboxProjection;
  commandPath: string;
}) {
  return (
    <section
      data-testid="flowcordia-approval-inbox"
      data-waiting-count={inbox.waitingCount}
      className="border-b border-grid-bright bg-background-dimmed px-4 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-bright">Approval inbox</h3>
          <p className="mt-1 text-xs leading-5 text-text-dimmed">
            Durable human decisions for this exact project environment. Tokens and callback URLs
            never enter the browser.
          </p>
        </div>
        <div className="flex gap-1.5">
          {inbox.escalatedCount > 0 && (
            <Badge className="border border-rose-500/30 bg-rose-500/10 text-rose-200">
              {inbox.escalatedCount} escalated
            </Badge>
          )}
          {inbox.reminderDueCount > 0 && (
            <Badge className="border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
              {inbox.reminderDueCount} reminder due
            </Badge>
          )}
          <Badge className="border border-grid-bright bg-background-bright text-text-dimmed">
            {inbox.waitingCount} waiting
          </Badge>
        </div>
      </div>
      {!inbox.environment ? (
        <div className="mt-3 rounded border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          This environment is unavailable, so approvals cannot be listed.
        </div>
      ) : inbox.items.length === 0 ? (
        <div className="mt-3 rounded border border-grid-dimmed bg-background-bright px-3 py-3 text-xs text-text-dimmed">
          No Flowcordia approvals have been created in this environment.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {inbox.items.map((item) => (
            <ApprovalCard
              key={`${item.waitpointId}:${item.state}`}
              item={item}
              commandPath={commandPath}
            />
          ))}
        </div>
      )}
    </section>
  );
}
