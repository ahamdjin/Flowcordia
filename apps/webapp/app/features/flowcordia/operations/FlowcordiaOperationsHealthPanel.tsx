import { useFetcher } from "@remix-run/react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import type {
  FlowcordiaOperationsCheck,
  FlowcordiaOperationsCheckState,
  FlowcordiaOperationsProjection,
} from "./contract";

type OperationsResponse = {
  ok: boolean;
  status?: "checked";
  health?: FlowcordiaOperationsProjection;
  error?: string;
  message?: string;
  retryable?: boolean;
};

const CHECK_LABELS: Record<FlowcordiaOperationsCheck["key"], string> = {
  worker: "Worker heartbeat",
  outbox: "Event publication",
  reconciliation: "GitHub reconciliation",
  leases: "Operation leases",
  proposals: "Proposal state",
};

function tone(state: FlowcordiaOperationsCheckState): string {
  switch (state) {
    case "READY":
      return "text-emerald-300";
    case "ATTENTION":
      return "text-yellow-300";
    case "BLOCKED":
      return "text-rose-300";
  }
}

function verdictTone(state: FlowcordiaOperationsCheckState): string {
  switch (state) {
    case "READY":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "ATTENTION":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-100";
    case "BLOCKED":
      return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  }
}

function CheckIcon({ state }: { state: FlowcordiaOperationsCheckState }) {
  if (state === "READY") return <CheckCircle2Icon className="size-4" />;
  if (state === "ATTENTION") return <AlertTriangleIcon className="size-4" />;
  return <CircleSlashIcon className="size-4" />;
}

function metrics(check: FlowcordiaOperationsCheck): string[] {
  const values: string[] = [];
  if (check.count !== null) values.push(`${check.count} ${check.count === 1 ? "item" : "items"}`);
  if (check.ageSeconds !== null) values.push(`${check.ageSeconds}s age`);
  if (check.attempts !== null && check.attempts > 0) {
    values.push(`${check.attempts} ${check.attempts === 1 ? "attempt" : "attempts"}`);
  }
  return values;
}

export function FlowcordiaOperationsHealthPanel({
  commandPath,
  onHealthChange,
}: {
  commandPath: string;
  onHealthChange?: (state: FlowcordiaOperationsCheckState | "NOT_CHECKED") => void;
}) {
  const fetcher = useFetcher<OperationsResponse>();
  const health = fetcher.data?.ok ? fetcher.data.health : undefined;
  const checking = fetcher.state !== "idle";

  useEffect(() => {
    if (!fetcher.data) return;
    if (health) onHealthChange?.(health.state);
    else if (!fetcher.data.ok) onHealthChange?.("BLOCKED");
  }, [fetcher.data, health, onHealthChange]);

  const runCheck = () => {
    if (checking) return;
    onHealthChange?.("NOT_CHECKED");
    fetcher.submit(
      { operation: "check" },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
  };

  return (
    <section
      data-testid="flowcordia-operations-health"
      data-state={
        health?.state ?? (fetcher.data && !fetcher.data.ok ? "UNAVAILABLE" : "NOT_CHECKED")
      }
      className="border-b border-grid-bright bg-background-dimmed px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-grid-bright bg-background-bright">
            <ActivityIcon className="size-4 text-indigo-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-bright">Operations readiness</h3>
            <p className="mt-1 max-w-3xl text-xxs leading-4 text-text-dimmed">
              Check worker liveness, event publication, reconciliation, leases, and proposal state
              for this connected project before release acceptance.
            </p>
          </div>
        </div>
        <Button
          data-testid="flowcordia-operations-health-check"
          variant="secondary/small"
          LeadingIcon={RefreshCwIcon}
          isLoading={checking}
          disabled={checking}
          onClick={runCheck}
        >
          {health ? "Check again" : "Check operations"}
        </Button>
      </div>

      <div aria-live="polite">
        {fetcher.data && !fetcher.data.ok ? (
          <div className="mt-3 border-l-2 border-rose-400 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {fetcher.data.message ?? "Operations readiness could not be checked."}
          </div>
        ) : null}

        {health ? (
          <div className="mt-3">
            <div className={cn("border-l-2 px-3 py-2", verdictTone(health.state))}>
              <div className="flex items-center gap-2 text-xs font-medium">
                <CheckIcon state={health.state} />
                {health.state}
              </div>
              <p className="mt-1 text-xxs leading-4 opacity-80">{health.message}</p>
            </div>

            <ul className="mt-3 divide-y divide-grid-bright border-y border-grid-bright">
              {health.checks.map((check) => {
                const evidence = metrics(check);
                return (
                  <li
                    key={check.key}
                    data-check={check.key}
                    data-state={check.state}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <span className={cn("mt-0.5 shrink-0", tone(check.state))}>
                      <CheckIcon state={check.state} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-xs font-medium text-text-bright">
                          {CHECK_LABELS[check.key]}
                        </span>
                        {evidence.length > 0 ? (
                          <span className="font-mono text-xxs text-text-dimmed">
                            {evidence.join(" · ")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xxs leading-4 text-text-dimmed">{check.message}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 text-right text-xxs text-text-dimmed">
              Checked {health.checkedAt.replace("T", " ").slice(0, 19)} UTC
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
