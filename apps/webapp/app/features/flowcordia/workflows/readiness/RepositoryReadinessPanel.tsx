import { useFetcher } from "@remix-run/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import type {
  FlowcordiaRepositoryReadinessCheck,
  FlowcordiaRepositoryReadinessProjection,
} from "./presentation";

interface ReadinessResponse {
  ok: boolean;
  readiness?: FlowcordiaRepositoryReadinessProjection;
  message?: string;
}

function stateTone(
  state:
    | FlowcordiaRepositoryReadinessProjection["state"]
    | FlowcordiaRepositoryReadinessCheck["state"]
): string {
  switch (state) {
    case "READY":
    case "PASSED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "BLOCKED":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
    case "UNAVAILABLE":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  }
}

function CheckIcon({ state }: { state: FlowcordiaRepositoryReadinessCheck["state"] }) {
  switch (state) {
    case "PASSED":
      return <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-300" />;
    case "BLOCKED":
      return <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-yellow-300" />;
    case "UNAVAILABLE":
      return <CircleSlashIcon className="mt-0.5 size-4 shrink-0 text-rose-300" />;
  }
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 8) : "unresolved";
}

export function RepositoryReadinessPanel({ commandPath }: { commandPath: string }) {
  const fetcher = useFetcher<ReadinessResponse>();
  const readiness = fetcher.data?.ok ? fetcher.data.readiness : undefined;
  const checking = fetcher.state !== "idle";

  const runCheck = () => {
    if (checking) return;
    fetcher.submit(
      { operation: "check" },
      { method: "POST", action: commandPath, encType: "application/json" }
    );
  };

  return (
    <section className="border-b border-grid-bright bg-background-bright px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-grid-bright bg-background-dimmed">
            <ShieldCheckIcon className="size-4 text-indigo-300" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium text-text-bright">Connected rollout readiness</h2>
              {readiness && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xxs font-medium",
                    stateTone(readiness.state)
                  )}
                >
                  {readiness.state.toLowerCase()}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-3xl text-xxs leading-4 text-text-dimmed">
              Proves the server-owned repository binding, GitHub App installation permissions, exact
              production head, workflow index, Trigger.dev task discovery, and preview deployment
              setting. It never returns tokens, installation IDs, database IDs, or raw provider
              errors.
            </p>
          </div>
        </div>
        <Button
          variant="secondary/small"
          LeadingIcon={RefreshCwIcon}
          isLoading={checking}
          disabled={checking}
          onClick={runCheck}
        >
          {readiness ? "Check again" : "Check readiness"}
        </Button>
      </div>

      {fetcher.data && !fetcher.data.ok && (
        <div className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {fetcher.data.message ?? "The readiness request failed safely."}
        </div>
      )}

      {readiness && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xxs text-text-dimmed">
            {readiness.repository ? (
              <>
                <span className="font-mono">
                  {readiness.repository.owner}/{readiness.repository.name}
                </span>
                <span>{readiness.repository.branch}</span>
                <span className="font-mono">{shortSha(readiness.repository.commitSha)}</span>
              </>
            ) : (
              <span>Repository identity is unavailable.</span>
            )}
            <span>{readiness.checkedAt.replace("T", " ").slice(0, 19)} UTC</span>
          </div>
          <details className="mt-3" open={readiness.state !== "READY"}>
            <summary className="cursor-pointer select-none text-xs font-medium text-text-bright">
              {readiness.checks.filter((item) => item.state === "PASSED").length} passed ·{" "}
              {readiness.checks.filter((item) => item.state === "BLOCKED").length} blocked ·{" "}
              {readiness.checks.filter((item) => item.state === "UNAVAILABLE").length} unavailable
            </summary>
            <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {readiness.checks.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-2 rounded border px-3 py-2.5",
                    stateTone(item.state)
                  )}
                >
                  <CheckIcon state={item.state} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{item.label}</div>
                    <div className="mt-1 text-xxs leading-4 opacity-80">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
