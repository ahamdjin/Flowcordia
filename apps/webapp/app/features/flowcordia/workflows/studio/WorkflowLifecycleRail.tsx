import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  GitPullRequestIcon,
  RocketIcon,
} from "lucide-react";
import { cn } from "~/utils/cn";
import type { FlowcordiaPreviewProjection } from "../preview/presentation";
import type { FlowcordiaProductionProjection } from "../production/presentation";
import type { FlowcordiaRepositoryReadinessProjection } from "../readiness/presentation";
import type { WorkflowStudioSyncStatus } from "./presentation";

export type FlowcordiaLifecycleStepId =
  | "repository"
  | "build"
  | "review"
  | "preview"
  | "production";

export type FlowcordiaLifecycleTone = "complete" | "active" | "blocked" | "idle";

export interface FlowcordiaLifecycleStep {
  id: FlowcordiaLifecycleStepId;
  label: string;
  detail: string;
  tone: FlowcordiaLifecycleTone;
}

export interface FlowcordiaLifecycleInput {
  syncState: WorkflowStudioSyncStatus["state"];
  loadErrorCode: string | null;
  readinessState: FlowcordiaRepositoryReadinessProjection["state"] | "NOT_CHECKED";
  workflowSelected: boolean;
  draftPresent: boolean;
  draftStale: boolean;
  proposalState: "NONE" | "OPEN" | "MERGED";
  previewState: FlowcordiaPreviewProjection["state"];
  productionState: FlowcordiaProductionProjection["state"];
}

function repositoryStep(input: FlowcordiaLifecycleInput): FlowcordiaLifecycleStep {
  const blocked =
    Boolean(input.loadErrorCode) ||
    input.syncState === "FAILED" ||
    input.readinessState === "BLOCKED" ||
    input.readinessState === "UNAVAILABLE";
  const complete = input.syncState === "IDLE" && input.readinessState === "READY";

  let detail = "Check connected repository";
  if (input.loadErrorCode) detail = input.loadErrorCode;
  else if (input.syncState === "FAILED") detail = "Synchronization failed";
  else if (input.readinessState === "BLOCKED") detail = "Readiness blocked";
  else if (input.readinessState === "UNAVAILABLE") detail = "Readiness unavailable";
  else if (complete) detail = "Connected and ready";
  else if (input.syncState === "RUNNING" || input.syncState === "PENDING") {
    detail = "Synchronizing repository";
  } else if (input.syncState === "NOT_INDEXED") detail = "Synchronization required";
  else if (input.readinessState === "NOT_CHECKED") detail = "Readiness check required";

  return {
    id: "repository",
    label: "Repository",
    detail,
    tone: blocked ? "blocked" : complete ? "complete" : "active",
  };
}

function buildStep(input: FlowcordiaLifecycleInput): FlowcordiaLifecycleStep {
  if (input.draftStale) {
    return {
      id: "build",
      label: "Build",
      detail: "Draft base changed",
      tone: "blocked",
    };
  }
  if (input.proposalState !== "NONE") {
    return {
      id: "build",
      label: "Build",
      detail: "Proposal generated",
      tone: "complete",
    };
  }
  if (input.draftPresent) {
    return {
      id: "build",
      label: "Build",
      detail: "Durable draft active",
      tone: "active",
    };
  }
  return {
    id: "build",
    label: "Build",
    detail: input.workflowSelected ? "Ready to edit" : "Select a workflow",
    tone: input.workflowSelected ? "active" : "idle",
  };
}

function reviewStep(input: FlowcordiaLifecycleInput): FlowcordiaLifecycleStep {
  switch (input.proposalState) {
    case "MERGED":
      return { id: "review", label: "Review", detail: "Proposal merged", tone: "complete" };
    case "OPEN":
      return { id: "review", label: "Review", detail: "Git review in progress", tone: "active" };
    case "NONE":
      return { id: "review", label: "Review", detail: "No proposal yet", tone: "idle" };
  }
}

function previewStep(input: FlowcordiaLifecycleInput): FlowcordiaLifecycleStep {
  const blocked = ["FAILED", "DISABLED", "UNAVAILABLE", "CLOSED"].includes(input.previewState);
  const active = ["WAITING_FOR_DEPLOYMENT", "DEPLOYING"].includes(input.previewState);
  return {
    id: "preview",
    label: "Preview",
    detail:
      input.previewState === "READY"
        ? "Preview proven"
        : input.previewState === "NOT_REQUESTED"
          ? "Not requested"
          : input.previewState.toLowerCase().replaceAll("_", " "),
    tone: blocked
      ? "blocked"
      : input.previewState === "READY"
        ? "complete"
        : active
          ? "active"
          : "idle",
  };
}

function productionStep(input: FlowcordiaLifecycleInput): FlowcordiaLifecycleStep {
  const blocked = ["FAILED", "UNAVAILABLE", "OUT_OF_SYNC"].includes(input.productionState);
  const active = ["WAITING_FOR_DEPLOYMENT", "DEPLOYING"].includes(input.productionState);
  return {
    id: "production",
    label: "Production",
    detail:
      input.productionState === "READY"
        ? "Production proven"
        : input.productionState === "NOT_PROMOTED"
          ? "Not promoted"
          : input.productionState.toLowerCase().replaceAll("_", " "),
    tone: blocked
      ? "blocked"
      : input.productionState === "READY"
        ? "complete"
        : active
          ? "active"
          : "idle",
  };
}

export function buildWorkflowLifecycleSteps(
  input: FlowcordiaLifecycleInput
): readonly FlowcordiaLifecycleStep[] {
  return [
    repositoryStep(input),
    buildStep(input),
    reviewStep(input),
    previewStep(input),
    productionStep(input),
  ];
}

export function findDefaultLifecycleStep(
  steps: readonly FlowcordiaLifecycleStep[]
): FlowcordiaLifecycleStepId {
  return (
    steps.find((step) => step.tone === "blocked") ??
    steps.find((step) => step.tone === "active") ??
    steps.at(-1) ?? {
      id: "repository" as const,
    }
  ).id;
}

function toneClass(tone: FlowcordiaLifecycleTone, selected: boolean): string {
  if (selected) {
    return "bg-indigo-500/10 text-text-bright ring-1 ring-inset ring-indigo-500/30";
  }
  switch (tone) {
    case "complete":
      return "text-emerald-200 hover:bg-emerald-500/5";
    case "active":
      return "text-indigo-200 hover:bg-indigo-500/5";
    case "blocked":
      return "text-rose-200 hover:bg-rose-500/5";
    case "idle":
      return "text-text-dimmed hover:bg-background-bright";
  }
}

function iconClass(tone: FlowcordiaLifecycleTone): string {
  switch (tone) {
    case "complete":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-300";
    case "active":
      return "border-indigo-500/40 bg-indigo-500/10 text-indigo-300";
    case "blocked":
      return "border-rose-500/40 bg-rose-500/10 text-rose-300";
    case "idle":
      return "border-grid-bright bg-background-bright text-text-dimmed";
  }
}

function StepIcon({ step }: { step: FlowcordiaLifecycleStep }) {
  const Icon =
    step.tone === "complete"
      ? CheckCircle2Icon
      : step.tone === "blocked"
        ? AlertTriangleIcon
        : step.id === "review"
          ? GitPullRequestIcon
          : step.id === "production"
            ? RocketIcon
            : CircleDotIcon;
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border",
        iconClass(step.tone)
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

const TONE_LABEL: Record<FlowcordiaLifecycleTone, string> = {
  complete: "Complete",
  active: "In progress",
  blocked: "Blocked",
  idle: "Waiting",
};

export function WorkflowLifecycleRail({
  steps,
  selectedStepId,
  onSelectStep,
}: {
  steps: readonly FlowcordiaLifecycleStep[];
  selectedStepId: FlowcordiaLifecycleStepId;
  onSelectStep: (stepId: FlowcordiaLifecycleStepId) => void;
}) {
  return (
    <nav
      aria-label="Workflow release lifecycle"
      data-testid="flowcordia-lifecycle-rail"
      className="shrink-0 overflow-x-auto border-b border-grid-bright bg-background-dimmed px-3 py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600"
    >
      <ol className="flex min-w-[44rem] items-stretch">
        {steps.map((step, index) => {
          const selected = step.id === selectedStepId;
          return (
            <li key={step.id} className="relative min-w-0 flex-1">
              {index > 0 && (
                <span aria-hidden className="absolute -left-1/2 top-4 h-px w-full bg-grid-bright" />
              )}
              <button
                type="button"
                data-step={step.id}
                data-tone={step.tone}
                aria-current={selected ? "step" : undefined}
                aria-label={`${step.label}: ${step.detail}. ${TONE_LABEL[step.tone]}`}
                className={cn(
                  "relative z-10 flex h-full w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-custom",
                  toneClass(step.tone, selected)
                )}
                onClick={() => onSelectStep(step.id)}
              >
                <StepIcon step={step} />
                <span className="min-w-0 pt-0.5">
                  <span className="block truncate text-xs font-medium">{step.label}</span>
                  <span className="mt-0.5 block truncate text-xxs opacity-75">{step.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
