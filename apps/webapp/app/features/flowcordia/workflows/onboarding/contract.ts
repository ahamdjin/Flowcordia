export const FLOWCORDIA_ONBOARDING_STEP_IDS = [
  "github_app",
  "repository",
  "synchronization",
] as const;

export type FlowcordiaOnboardingStepId = (typeof FLOWCORDIA_ONBOARDING_STEP_IDS)[number];
export type FlowcordiaOnboardingStepState = "complete" | "active" | "waiting" | "unknown";
export type FlowcordiaOnboardingActionId = "install_github" | "open_integrations" | "refresh";

export interface FlowcordiaOnboardingStep {
  id: FlowcordiaOnboardingStepId;
  label: string;
  detail: string;
  state: FlowcordiaOnboardingStepState;
}

export interface FlowcordiaOnboardingAction {
  id: FlowcordiaOnboardingActionId;
  label: string;
  kind: "primary" | "secondary" | "refresh";
}

export interface FlowcordiaOnboardingProjection {
  state: "ACTION_REQUIRED" | "READ_ONLY";
  title: string;
  message: string;
  steps: FlowcordiaOnboardingStep[];
  actions: FlowcordiaOnboardingAction[];
}

export function buildFlowcordiaOnboardingProjection(input: {
  configurationError: string | null;
  repositoryConnected: boolean;
  synchronizationAvailable: boolean;
  canWrite: boolean;
}): FlowcordiaOnboardingProjection {
  const repositoryState: FlowcordiaOnboardingStepState = input.repositoryConnected
    ? "complete"
    : "active";
  const synchronizationState: FlowcordiaOnboardingStepState = input.synchronizationAvailable
    ? "complete"
    : input.repositoryConnected
      ? "active"
      : "waiting";

  const steps: FlowcordiaOnboardingStep[] = [
    {
      id: "github_app",
      label: "Install the GitHub App",
      detail:
        "Grant repository-scoped access. Studio never uses a personal token or asks the browser for installation credentials.",
      state: "unknown",
    },
    {
      id: "repository",
      label: "Choose a repository and production branch",
      detail:
        "Flowcordia binds the project to one server-resolved repository identity and reads workflow history from exact commits.",
      state: repositoryState,
    },
    {
      id: "synchronization",
      label: "Synchronize or bootstrap the first workflow",
      detail:
        "After the repository is connected, return to Studio to index existing workflows or create the governed starter workflow.",
      state: synchronizationState,
    },
  ];

  if (!input.canWrite) {
    return {
      state: "READ_ONLY",
      title: "A project writer needs to finish setup",
      message:
        input.configurationError ??
        "You can inspect Flowcordia after a project writer connects GitHub and selects the production repository branch.",
      steps,
      actions: [{ id: "refresh", label: "Check again", kind: "refresh" }],
    };
  }

  return {
    state: "ACTION_REQUIRED",
    title: "Finish connecting Flowcordia",
    message:
      input.configurationError ??
      "Connect GitHub, select the repository and production branch, then return here to create or synchronize the first workflow.",
    steps,
    actions: [
      { id: "install_github", label: "Install GitHub App", kind: "primary" },
      { id: "open_integrations", label: "Open project integrations", kind: "secondary" },
      { id: "refresh", label: "Check again", kind: "refresh" },
    ],
  };
}
