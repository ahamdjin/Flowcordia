import { useFetcher, useRevalidator } from "@remix-run/react";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  PackageCheckIcon,
  RocketIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "~/utils/cn";
import type { StudioV2ReleaseProjection } from "./release-contract";
import type { StudioV2SourceControlProjection } from "./source-control-service.server";
import type { StudioV2WorkspaceProjection } from "./workspace-contract";
import type { StudioV2WorkspaceActionData } from "./workspace-http";

export interface StudioV2ReleaseControlsProps {
  workspace: StudioV2WorkspaceProjection;
  initialRelease: StudioV2ReleaseProjection | null;
  canWrite: boolean;
  environment: { slug: string; type: string };
  sourceControlConfigured: boolean;
}

type PendingIntent = "stage" | "deploy" | "push" | null;

function releaseMessage(
  release: StudioV2ReleaseProjection | null,
  environment: { slug: string; type: string }
): string {
  if (!release) return "No immutable release has been staged yet.";
  switch (release.status) {
    case "STAGED":
      return `Version ${release.workspaceVersion} is staged and ready for ${environment.slug}.`;
    case "DEPLOYING":
      return `Trigger.dev is building and deploying version ${release.workspaceVersion} to ${environment.slug}.`;
    case "DEPLOYED":
      return `Version ${release.workspaceVersion} is deployed in ${environment.slug}.`;
    case "FAILED":
      return release.failureMessage ?? `Deployment to ${environment.slug} failed and can be retried.`;
  }
}

export function StudioV2ReleaseControls({
  workspace,
  initialRelease,
  canWrite,
  environment,
  sourceControlConfigured,
}: StudioV2ReleaseControlsProps) {
  const fetcher = useFetcher<StudioV2WorkspaceActionData>();
  const revalidator = useRevalidator();
  const [release, setRelease] = useState(initialRelease);
  const [message, setMessage] = useState(releaseMessage(initialRelease, environment));
  const [pendingIntent, setPendingIntent] = useState<PendingIntent>(null);
  const [sourceControl, setSourceControl] = useState<StudioV2SourceControlProjection | null>(null);

  useEffect(() => {
    setRelease(initialRelease);
    setMessage(releaseMessage(initialRelease, environment));
  }, [environment, initialRelease]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    setPendingIntent(null);
    if (!data.ok) {
      setMessage(data.message);
      return;
    }
    if (data.intent === "push") {
      setSourceControl(data.sourceControl);
      setMessage(
        `Pushed immutable version ${release?.workspaceVersion ?? ""} to ${data.sourceControl.branch} and opened pull request #${data.sourceControl.pullRequestNumber}.`
      );
      return;
    }
    if (data.intent !== "stage" && data.intent !== "deploy") return;
    setRelease(data.release);
    setMessage(releaseMessage(data.release, environment));
  }, [environment, fetcher.data, release?.workspaceVersion]);

  useEffect(() => {
    if (release?.status !== "DEPLOYING") return;
    const interval = window.setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [release?.status, revalidator]);

  const tested =
    workspace.testedVersion === workspace.version && workspace.lastTestSucceeded === true;
  const stagedCurrentVersion = release?.workspaceVersion === workspace.version;
  const busy = fetcher.state !== "idle" || pendingIntent !== null;
  const canStage = canWrite && tested && !stagedCurrentVersion && !busy;
  const canDeploy =
    canWrite && !!release && ["STAGED", "FAILED"].includes(release.status) && !busy;
  const canPush = canWrite && sourceControlConfigured && !!release && !busy;

  const stage = () => {
    if (!canWrite) {
      setMessage("You do not have permission to stage this workspace.");
      return;
    }
    if (!tested) {
      setMessage("Save and structurally test the current version before staging it.");
      return;
    }
    if (stagedCurrentVersion) {
      setMessage(`Version ${workspace.version} already has an immutable release.`);
      return;
    }

    setPendingIntent("stage");
    setMessage(`Compiling and staging version ${workspace.version}…`);
    fetcher.submit(
      { intent: "stage", expectedVersion: workspace.version },
      { method: "post", encType: "application/json" }
    );
  };

  const push = () => {
    if (!release || !canPush) {
      if (!sourceControlConfigured) {
        setMessage("Connect a GitHub repository to push immutable Studio releases.");
      }
      return;
    }
    setPendingIntent("push");
    setMessage(`Creating a governed GitHub proposal for version ${release.workspaceVersion}…`);
    fetcher.submit(
      { intent: "push", releasePublicId: release.publicId },
      { method: "post", encType: "application/json" }
    );
  };

  const deploy = () => {
    if (!release || !canDeploy) return;
    setPendingIntent("deploy");
    setMessage(`Preparing version ${release.workspaceVersion} for Trigger.dev…`);
    fetcher.submit(
      { intent: "deploy", releasePublicId: release.publicId },
      { method: "post", encType: "application/json" }
    );
  };

  const statusTone =
    release?.status === "DEPLOYED"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
      : release?.status === "FAILED"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-300"
        : release?.status === "DEPLOYING"
          ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
          : stagedCurrentVersion
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
            : tested
              ? "border-indigo-400/25 bg-indigo-400/10 text-indigo-300"
              : "border-white/10 bg-white/[0.04] text-zinc-500";

  return (
    <section
      aria-label="Studio V2 release controls"
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0b0b0e] px-4 py-3 text-zinc-200"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", statusTone)}>
          {release?.status === "DEPLOYING" ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : release?.status === "DEPLOYED" ? (
            <RocketIcon className="size-4" />
          ) : release?.status === "FAILED" ? (
            <CircleAlertIcon className="size-4" />
          ) : stagedCurrentVersion ? (
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
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
              {environment.slug} · {environment.type}
            </span>
            {release && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[10px]",
                  release.status === "DEPLOYED"
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : release.status === "FAILED"
                      ? "border-rose-400/20 bg-rose-400/10 text-rose-300"
                      : release.status === "DEPLOYING"
                        ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
                        : "border-indigo-400/20 bg-indigo-400/10 text-indigo-300"
                )}
              >
                v{release.workspaceVersion} · {release.status.toLowerCase()}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[10px] text-zinc-500">
            {sourceControl ? (
              <a
                href={sourceControl.pullRequestUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-300 hover:text-indigo-200"
              >
                Pull request #{sourceControl.pullRequestNumber} · {sourceControl.branch}
              </a>
            ) : (
              message
            )}
          </div>
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
          {pendingIntent === "stage" ? "Staging…" : stagedCurrentVersion ? "Staged" : "Stage"}
        </button>
        <button
          type="button"
          onClick={push}
          disabled={!canPush}
          title={
            sourceControlConfigured
              ? release
                ? `Create a GitHub pull request for immutable version ${release.workspaceVersion}`
                : "Stage a release before pushing it."
              : "Connect a GitHub repository to enable Push."
          }
          className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GitBranchIcon className="size-3.5" />
          {pendingIntent === "push" ? "Pushing…" : "Push to GitHub"}
        </button>
        <button
          type="button"
          onClick={deploy}
          disabled={!canDeploy}
          title={
            release
              ? `Deploy immutable version ${release.workspaceVersion} to ${environment.slug}`
              : "Stage a tested release before deploying."
          }
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {release?.status === "DEPLOYING" ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <RocketIcon className="size-3.5" />
          )}
          {pendingIntent === "deploy"
            ? "Submitting…"
            : release?.status === "DEPLOYING"
              ? "Deploying…"
              : release?.status === "DEPLOYED"
                ? "Deployed"
                : release?.status === "FAILED"
                  ? "Retry deploy"
                  : "Deploy"}
        </button>
      </div>
    </section>
  );
}
