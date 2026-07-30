import { useFetcher } from "@remix-run/react";
import { CheckCircle2Icon, PackageCheckIcon, RocketIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "~/utils/cn";
import type { StudioV2ReleaseProjection } from "./release-contract";
import type { StudioV2WorkspaceProjection } from "./workspace-contract";
import type { StudioV2WorkspaceActionData } from "./workspace-http";

export interface StudioV2ReleaseControlsProps {
  workspace: StudioV2WorkspaceProjection;
  initialRelease: StudioV2ReleaseProjection | null;
  canWrite: boolean;
}

export function StudioV2ReleaseControls({
  workspace,
  initialRelease,
  canWrite,
}: StudioV2ReleaseControlsProps) {
  const fetcher = useFetcher<StudioV2WorkspaceActionData>();
  const [release, setRelease] = useState(initialRelease);
  const [message, setMessage] = useState(
    initialRelease
      ? `Version ${initialRelease.workspaceVersion} is staged as an immutable release.`
      : "No immutable release has been staged yet."
  );

  useEffect(() => {
    setRelease(initialRelease);
  }, [initialRelease]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (!data.ok) {
      setMessage(data.message);
      return;
    }
    if (data.intent !== "stage") return;
    setRelease(data.release);
    setMessage(
      `Version ${data.release.workspaceVersion} staged with source ${data.release.sourceSha256.slice(0, 12)}.`
    );
  }, [fetcher.data]);

  const tested =
    workspace.testedVersion === workspace.version && workspace.lastTestSucceeded === true;
  const currentRelease =
    release?.workspaceVersion === workspace.version && release.status === "STAGED";
  const busy = fetcher.state !== "idle";
  const canStage = canWrite && tested && !currentRelease && !busy;

  const stage = () => {
    if (!canWrite) {
      setMessage("You do not have permission to stage this workspace.");
      return;
    }
    if (!tested) {
      setMessage("Save and structurally test the current version before staging it.");
      return;
    }
    if (currentRelease) {
      setMessage(`Version ${workspace.version} is already staged.`);
      return;
    }

    setMessage(`Compiling and staging version ${workspace.version}…`);
    fetcher.submit(
      { intent: "stage", expectedVersion: workspace.version },
      { method: "post", encType: "application/json" }
    );
  };

  return (
    <section
      aria-label="Studio V2 release controls"
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0b0b0e] px-4 py-3 text-zinc-200"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg border",
            currentRelease
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
              : tested
                ? "border-indigo-400/25 bg-indigo-400/10 text-indigo-300"
                : "border-white/10 bg-white/[0.04] text-zinc-500"
          )}
        >
          {currentRelease ? (
            <ShieldCheckIcon className="size-4" />
          ) : tested ? (
            <CheckCircle2Icon className="size-4" />
          ) : (
            <PackageCheckIcon className="size-4" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span>Release</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
              workspace v{workspace.version}
            </span>
            {release && (
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                staged v{release.workspaceVersion}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[10px] text-zinc-500">{message}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={stage}
          disabled={!canStage}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-400/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PackageCheckIcon className="size-3.5" />
          {busy ? "Staging…" : currentRelease ? "Staged" : "Stage"}
        </button>
        <button
          type="button"
          disabled
          title="Deployment is enabled after the immutable release is packaged for the Trigger.dev native build service."
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-zinc-950 opacity-40"
        >
          <RocketIcon className="size-3.5" /> Deploy
        </button>
      </div>
    </section>
  );
}
