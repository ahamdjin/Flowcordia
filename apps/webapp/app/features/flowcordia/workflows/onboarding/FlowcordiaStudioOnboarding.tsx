import { CheckCircle2Icon, CircleDashedIcon, GitBranchIcon, RefreshCwIcon } from "lucide-react";
import { Badge } from "~/components/primitives/Badge";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import {
  buildFlowcordiaOnboardingProjection,
  type FlowcordiaOnboardingStepState,
} from "./contract";

function stepTone(state: FlowcordiaOnboardingStepState): string {
  switch (state) {
    case "complete":
      return "border-emerald-500/30 bg-emerald-500/10";
    case "active":
      return "border-indigo-500/35 bg-indigo-500/10";
    case "waiting":
    case "unknown":
      return "border-grid-bright bg-background-bright";
  }
}

function StepIcon({ state }: { state: FlowcordiaOnboardingStepState }) {
  if (state === "complete") {
    return <CheckCircle2Icon className="size-4 text-emerald-300" aria-hidden="true" />;
  }
  return (
    <CircleDashedIcon
      className={cn("size-4", state === "active" ? "text-indigo-300" : "text-text-dimmed")}
      aria-hidden="true"
    />
  );
}

export function FlowcordiaStudioOnboarding({
  configurationError,
  repositoryConnected,
  synchronizationAvailable,
  canWrite,
  githubInstallPath,
  integrationsPath,
  refreshing,
  onRefresh,
}: {
  configurationError: string | null;
  repositoryConnected: boolean;
  synchronizationAvailable: boolean;
  canWrite: boolean;
  githubInstallPath: string;
  integrationsPath: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const projection = buildFlowcordiaOnboardingProjection({
    configurationError,
    repositoryConnected,
    synchronizationAvailable,
    canWrite,
  });

  return (
    <div
      data-testid="flowcordia-studio-onboarding"
      data-state={projection.state}
      className="mx-auto flex h-full w-full max-w-5xl items-center px-4 py-8 sm:px-8"
    >
      <section className="w-full overflow-hidden rounded-xl border border-grid-bright bg-background-dimmed shadow-xl shadow-black/10">
        <header className="border-b border-grid-bright bg-background-bright px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-indigo-500/30 bg-indigo-500/10">
                <GitBranchIcon className="size-4 text-indigo-300" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-medium text-text-bright">{projection.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-text-dimmed">
                  {projection.message}
                </p>
              </div>
            </div>
            <Badge className="w-fit border border-grid-bright bg-background-dimmed text-text-dimmed">
              Guided setup
            </Badge>
          </div>
        </header>

        <div className="grid gap-3 p-5 sm:p-7 lg:grid-cols-3">
          {projection.steps.map((step, index) => (
            <article
              key={step.id}
              data-testid={`flowcordia-onboarding-step-${step.id}`}
              data-state={step.state}
              className={cn("rounded-lg border p-4", stepTone(step.state))}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <StepIcon state={step.state} />
                  <span className="text-xxs font-medium uppercase tracking-wide text-text-dimmed">
                    Step {index + 1}
                  </span>
                </div>
                <span className="text-xxs text-text-dimmed">
                  {step.state === "complete"
                    ? "Complete"
                    : step.state === "active"
                      ? "Next"
                      : "Pending"}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-medium text-text-bright">{step.label}</h3>
              <p className="mt-1 text-xs leading-5 text-text-dimmed">{step.detail}</p>
            </article>
          ))}
        </div>

        <footer className="flex flex-col gap-3 border-t border-grid-bright bg-background-bright px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="max-w-2xl text-xs leading-5 text-text-dimmed">
            Git remains the durable history, but ordinary builders should not need to configure files or copy repository coordinates by hand.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {projection.actions.some((action) => action.id === "install_github") && (
              <LinkButton variant="secondary/small" to={githubInstallPath}>
                Install GitHub App
              </LinkButton>
            )}
            {projection.actions.some((action) => action.id === "open_integrations") && (
              <LinkButton variant="minimal/small" to={integrationsPath}>
                Open integrations
              </LinkButton>
            )}
            <Button
              variant="minimal/small"
              LeadingIcon={RefreshCwIcon}
              isLoading={refreshing}
              onClick={onRefresh}
            >
              Check again
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
