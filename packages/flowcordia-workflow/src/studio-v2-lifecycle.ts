export type StudioV2LifecyclePhase = "draft" | "testing" | "staging" | "deployed";

export interface StudioV2LifecycleState {
  phase: StudioV2LifecyclePhase;
  revision: number;
  testedRevision?: number;
  stagedRevision?: number;
  deployedRevision?: number;
  lastTestSucceeded?: boolean;
}

export type StudioV2LifecycleCommand =
  | { type: "save_draft" }
  | { type: "begin_test" }
  | { type: "complete_test"; success: boolean }
  | { type: "promote_to_staging" }
  | { type: "deploy" }
  | { type: "return_to_draft" };

export type StudioV2LifecycleTransition =
  | { success: true; state: StudioV2LifecycleState }
  | {
      success: false;
      code: "invalid_transition" | "untested_revision" | "unstaged_revision";
      message: string;
      state: StudioV2LifecycleState;
    };

export function createStudioV2LifecycleState(): StudioV2LifecycleState {
  return {
    phase: "draft",
    revision: 1,
  };
}

export function transitionStudioV2Lifecycle(
  state: StudioV2LifecycleState,
  command: StudioV2LifecycleCommand
): StudioV2LifecycleTransition {
  switch (command.type) {
    case "save_draft":
      return {
        success: true,
        state: {
          ...state,
          phase: "draft",
          revision: state.revision + 1,
          testedRevision: undefined,
          stagedRevision: undefined,
          lastTestSucceeded: undefined,
        },
      };
    case "begin_test":
      if (state.phase !== "draft" && state.phase !== "testing") {
        return {
          success: false,
          code: "invalid_transition",
          message: "Only a draft revision can enter testing.",
          state,
        };
      }
      return {
        success: true,
        state: { ...state, phase: "testing", lastTestSucceeded: undefined },
      };
    case "complete_test":
      if (state.phase !== "testing") {
        return {
          success: false,
          code: "invalid_transition",
          message: "A test result can only complete an active testing phase.",
          state,
        };
      }
      return {
        success: true,
        state: {
          ...state,
          phase: "draft",
          testedRevision: command.success ? state.revision : undefined,
          stagedRevision: undefined,
          lastTestSucceeded: command.success,
        },
      };
    case "promote_to_staging":
      if (state.testedRevision !== state.revision || state.lastTestSucceeded !== true) {
        return {
          success: false,
          code: "untested_revision",
          message: "The current draft revision must pass testing before promotion to staging.",
          state,
        };
      }
      return {
        success: true,
        state: {
          ...state,
          phase: "staging",
          stagedRevision: state.revision,
        },
      };
    case "deploy":
      if (state.phase !== "staging" || state.stagedRevision !== state.revision) {
        return {
          success: false,
          code: "unstaged_revision",
          message: "The current revision must be staged before deployment.",
          state,
        };
      }
      return {
        success: true,
        state: {
          ...state,
          phase: "deployed",
          deployedRevision: state.revision,
        },
      };
    case "return_to_draft":
      return {
        success: true,
        state: {
          ...state,
          phase: "draft",
          stagedRevision: undefined,
        },
      };
  }
}

export interface StudioV2SourceControlStatus {
  available: boolean;
  connected: boolean;
  provider?: string;
  lastSynchronizedRevision?: number;
}

export interface StudioV2SourceControlDiff {
  localRevision: number;
  remoteRevision?: string;
  summary: readonly string[];
}

export type StudioV2SourceControlResult<T> =
  | { success: true; value: T }
  | { success: false; code: "provider_unavailable" | "not_connected"; message: string };

export interface StudioV2SourceControlProvider {
  status(): Promise<StudioV2SourceControlStatus>;
  previewDiff(
    localRevision: number
  ): Promise<StudioV2SourceControlResult<StudioV2SourceControlDiff>>;
  push(localRevision: number): Promise<StudioV2SourceControlResult<void>>;
  pull(): Promise<StudioV2SourceControlResult<{ remoteRevision: string }>>;
}

const SOURCE_CONTROL_DISABLED_MESSAGE =
  "Source control is optional and is not configured for this Studio workspace.";

export function createDisabledStudioV2SourceControlProvider(): StudioV2SourceControlProvider {
  const unavailable = <T>(): StudioV2SourceControlResult<T> => ({
    success: false,
    code: "provider_unavailable",
    message: SOURCE_CONTROL_DISABLED_MESSAGE,
  });

  return {
    async status() {
      return { available: false, connected: false };
    },
    async previewDiff() {
      return unavailable();
    },
    async push() {
      return unavailable();
    },
    async pull() {
      return unavailable();
    },
  };
}
