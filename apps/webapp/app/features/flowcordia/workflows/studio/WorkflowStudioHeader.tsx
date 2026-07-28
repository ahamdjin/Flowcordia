import { Link } from "@remix-run/react";
import { CircleDotIcon, GitBranchIcon, GitPullRequestIcon, ShieldCheckIcon } from "lucide-react";
import { cn } from "~/utils/cn";
import type { FlowcordiaPreviewProjection } from "../preview/presentation";
import type { WorkflowStudioSyncStatus } from "./presentation";

function syncTone(state: WorkflowStudioSyncStatus["state"]): string {
  switch (state) {
    case "IDLE":
      return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
    case "RUNNING":
    case "PENDING":
      return "border-sky-400/25 bg-sky-400/10 text-sky-200";
    case "FAILED":
      return "border-rose-400/25 bg-rose-400/10 text-rose-200";
    case "NOT_INDEXED":
      return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  }
}

function previewTone(state: FlowcordiaPreviewProjection["state"]): string {
  switch (state) {
    case "READY":
      return "text-emerald-300";
    case "FAILED":
      return "text-rose-300";
    case "DEPLOYING":
    case "WAITING_FOR_DEPLOYMENT":
    case "WAITING_FOR_CLOSURE":
      return "text-sky-300";
    default:
      return "text-text-dimmed";
  }
}

export function WorkflowStudioHeader({
  repository,
  syncState,
  selectedWorkflowName,
  selectedWorkflowId,
  draftVersion,
  previewState,
  proposalPath,
}: {
  repository: { owner: string; name: string; branch: string };
  syncState: WorkflowStudioSyncStatus["state"];
  selectedWorkflowName: string | null;
  selectedWorkflowId: string | null;
  draftVersion: string | null;
  previewState: FlowcordiaPreviewProjection["state"];
  proposalPath: string;
}) {
  return (
    <header
      data-testid="flowcordia-studio-workspace-header"
      data-sync-state={syncState}
      data-preview-state={previewState}
      className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#18181b] px-4 py-2.5 text-[#f4f4f5] shadow-[0_1px_0_rgba(255,255,255,0.02)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-indigo-400/20 to-violet-500/10 text-indigo-200 shadow-inner shadow-white/5">
          <CircleDotIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
            <span>Flowcordia Studio</span>
            <span aria-hidden className="text-zinc-700">
              /
            </span>
            <span className="truncate normal-case tracking-normal text-zinc-400">
              {selectedWorkflowName ?? "Workflows"}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-zinc-400">
            <GitBranchIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate font-medium text-zinc-200">
              {repository.owner}/{repository.name}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="truncate font-mono text-[10px]">{repository.branch}</span>
            {selectedWorkflowId && (
              <>
                <span className="hidden text-zinc-700 sm:inline">·</span>
                <span className="hidden truncate font-mono text-[10px] sm:inline">
                  {selectedWorkflowId}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium sm:inline-flex",
            syncTone(syncState)
          )}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {syncState.replace("_", " ")}
        </span>
        {selectedWorkflowId && (
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] text-zinc-400 md:inline-flex">
            <ShieldCheckIcon
              className={cn("size-3", previewTone(previewState))}
              aria-hidden="true"
            />
            Preview {previewState.toLowerCase().replaceAll("_", " ")}
          </span>
        )}
        {draftVersion && (
          <span className="hidden rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2.5 py-1 text-[10px] font-medium text-indigo-200 lg:inline-flex">
            Draft v{draftVersion}
          </span>
        )}
        <Link
          to={proposalPath}
          aria-label="Open workflow proposals"
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-custom"
        >
          <GitPullRequestIcon className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Proposals</span>
        </Link>
      </div>
    </header>
  );
}
