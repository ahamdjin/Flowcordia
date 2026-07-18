import { useFetcher, useRevalidator } from "@remix-run/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import type { FlowcordiaFunctionValidationProjection } from "./presentation";

interface ValidationCommandResponse {
  ok: boolean;
  status?: "started";
  run?: {
    friendlyId: string;
    cached: boolean;
    proposalId: string;
    headSha: string;
    suiteDigest: string;
    functionCount: number;
    caseCount: number;
  };
  error?: string;
  message?: string;
  retryable?: boolean;
}

function validationTone(state: FlowcordiaFunctionValidationProjection["state"]): string {
  switch (state) {
    case "PASSED":
    case "NOT_REQUIRED":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
    case "WAITING_FOR_DEPLOYMENT":
    case "READY_TO_RUN":
    case "QUEUED":
    case "RUNNING":
      return "border-blue-500/25 bg-blue-500/10 text-blue-200";
    case "FAILED":
    case "BLOCKED":
      return "border-rose-500/25 bg-rose-500/10 text-rose-200";
    case "NOT_REQUESTED":
    case "CLOSED":
    case "UNAVAILABLE":
      return "border-grid-bright bg-background-bright text-text-dimmed";
  }
}

function shortIdentity(value: string): string {
  return value.slice(0, 8);
}

export function WorkflowFunctionValidationPanel({
  workflowId,
  validation,
  commandPath,
  canTrigger,
}: {
  workflowId: string;
  validation: FlowcordiaFunctionValidationProjection;
  commandPath: string;
  canTrigger: boolean;
}) {
  const fetcher = useFetcher<ValidationCommandResponse>();
  const revalidator = useRevalidator();
  const submitted = useRef(false);

  useEffect(() => {
    if (!submitted.current || fetcher.state !== "idle") return;
    submitted.current = false;
    revalidator.revalidate();
  }, [fetcher.state, revalidator]);

  useEffect(() => {
    if (!["WAITING_FOR_DEPLOYMENT", "QUEUED", "RUNNING"].includes(validation.state)) return;
    const interval = window.setInterval(() => revalidator.revalidate(), 5_000);
    return () => window.clearInterval(interval);
  }, [revalidator, validation.state]);

  const runValidation = () => {
    if (
      !canTrigger ||
      !validation.proposal?.headSha ||
      !["READY_TO_RUN", "FAILED"].includes(validation.state) ||
      fetcher.state !== "idle"
    ) {
      return;
    }
    submitted.current = true;
    fetcher.submit(
      {
        operation: "run",
        workflowId,
        expectedHeadSha: validation.proposal.headSha,
        requestId: crypto.randomUUID(),
      },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
  };

  const failedCases =
    validation.latestRun?.validation?.cases.filter((candidate) => candidate.status === "FAILED") ?? [];
  const active = ["WAITING_FOR_DEPLOYMENT", "QUEUED", "RUNNING"].includes(validation.state);

  return (
    <div className="shrink-0 border-b border-grid-bright">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs",
          validationTone(validation.state)
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {validation.state === "PASSED" || validation.state === "NOT_REQUIRED" ? (
            <CheckCircle2Icon className="size-4 shrink-0" />
          ) : validation.state === "FAILED" || validation.state === "BLOCKED" ? (
            <AlertTriangleIcon className="size-4 shrink-0" />
          ) : validation.state === "READY_TO_RUN" ? (
            <ShieldCheckIcon className="size-4 shrink-0" />
          ) : (
            <RefreshCwIcon className={cn("size-4 shrink-0", active && "animate-spin")} />
          )}
          <span>
            <strong className="font-medium">
              Function validation: {validation.state.toLowerCase().replaceAll("_", " ")}
            </strong>
            <span className="ml-2 opacity-80">{validation.message}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xxs">
          {validation.proposal?.headSha && (
            <span>head {shortIdentity(validation.proposal.headSha)}</span>
          )}
          {validation.suite && (
            <>
              <span>
                {validation.suite.functionCount} function
                {validation.suite.functionCount === 1 ? "" : "s"}
              </span>
              <span>
                {validation.suite.caseCount} case{validation.suite.caseCount === 1 ? "" : "s"}
              </span>
              <span>suite {shortIdentity(validation.suite.digest)}</span>
            </>
          )}
          {validation.latestRun && (
            <span>
              run {validation.latestRun.friendlyId}: {validation.latestRun.status.toLowerCase()}
            </span>
          )}
          {canTrigger && ["READY_TO_RUN", "FAILED"].includes(validation.state) && (
            <Button
              variant="secondary/small"
              disabled={fetcher.state !== "idle"}
              isLoading={fetcher.state !== "idle"}
              onClick={runValidation}
            >
              {validation.state === "FAILED" ? "Retry validation" : "Run validation"}
            </Button>
          )}
        </div>
      </div>

      {fetcher.data && !fetcher.data.ok && (
        <div className="border-t border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          {fetcher.data.message ?? "Repository function validation could not be started."}
        </div>
      )}
      {fetcher.data?.ok && fetcher.data.run && (
        <div className="border-t border-blue-500/25 bg-blue-500/10 px-4 py-2 text-xs text-blue-200">
          Validation run {fetcher.data.run.friendlyId} started on the exact proposal deployment.
        </div>
      )}
      {failedCases.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-rose-500/20 bg-background-dimmed px-4 py-2 text-xxs">
          <span className="font-medium text-rose-300">Failed fixtures</span>
          {failedCases.slice(0, 6).map((candidate) => (
            <span
              key={`${candidate.functionId}:${candidate.fixtureId}`}
              className="rounded border border-rose-500/25 px-2 py-1 font-mono text-rose-300"
            >
              {candidate.functionId}/{candidate.fixtureId}: {candidate.code ?? "failed"}
            </span>
          ))}
          {failedCases.length > 6 && (
            <span className="text-text-dimmed">+{failedCases.length - 6} more</span>
          )}
        </div>
      )}
    </div>
  );
}
