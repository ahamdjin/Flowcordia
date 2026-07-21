import type { FlowcordiaInstallationProfile } from "./installation-preflight";

export type FlowcordiaDependencyState = "READY" | "BLOCKED" | "UNAVAILABLE";

export interface FlowcordiaDependencyObservation {
  databaseConnection: FlowcordiaDependencyState;
  databaseMigrations: FlowcordiaDependencyState;
  githubApp: FlowcordiaDependencyState;
  workerHeartbeat?: FlowcordiaDependencyState;
}

export interface FlowcordiaDependencyCheck {
  key: "database_connection" | "database_migrations" | "github_app" | "worker_heartbeat";
  state: FlowcordiaDependencyState;
  message: string;
}

export interface FlowcordiaDependencyProjection {
  schemaVersion: "0.1";
  profile: FlowcordiaInstallationProfile;
  state: FlowcordiaDependencyState;
  message: string;
  checkedAt: string;
  checks: FlowcordiaDependencyCheck[];
}

const CHECK_MESSAGES = {
  database_connection: {
    READY: "The configured PostgreSQL writer accepted a bounded read query.",
    BLOCKED: "The configured PostgreSQL writer rejected the live dependency check.",
    UNAVAILABLE: "The PostgreSQL live dependency check could not complete.",
  },
  database_migrations: {
    READY: "The database migration set exactly matches the repository release artifact.",
    BLOCKED: "The database migration set is incomplete, failed, rolled back, or incompatible with this release artifact.",
    UNAVAILABLE: "The database migration state could not be inspected safely.",
  },
  github_app: {
    READY: "GitHub accepted an application-authenticated identity request.",
    BLOCKED: "GitHub rejected the configured application identity or credentials.",
    UNAVAILABLE: "The GitHub application identity check could not complete.",
  },
  worker_heartbeat: {
    READY: "The dedicated proposal operations worker has a current durable heartbeat.",
    BLOCKED: "The dedicated proposal operations worker heartbeat is missing, expired, or temporally invalid.",
    UNAVAILABLE: "The proposal operations worker heartbeat could not be inspected safely.",
  },
} as const;

function dependencyCheck(
  key: FlowcordiaDependencyCheck["key"],
  state: FlowcordiaDependencyState
): FlowcordiaDependencyCheck {
  return { key, state, message: CHECK_MESSAGES[key][state] };
}

function overallState(checks: readonly FlowcordiaDependencyCheck[]): FlowcordiaDependencyState {
  if (checks.some((check) => check.state === "BLOCKED")) return "BLOCKED";
  if (checks.some((check) => check.state === "UNAVAILABLE")) return "UNAVAILABLE";
  return "READY";
}

export function presentFlowcordiaDependencyPreflight(input: {
  profile: FlowcordiaInstallationProfile;
  observation: FlowcordiaDependencyObservation;
  checkedAt: Date;
}): FlowcordiaDependencyProjection {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new TypeError("Flowcordia dependency preflight time is invalid.");
  }
  if (
    (input.profile === "worker" || input.profile === "release") &&
    !input.observation.workerHeartbeat
  ) {
    throw new TypeError("Flowcordia worker dependency evidence is required for this profile.");
  }

  const checks: FlowcordiaDependencyCheck[] = [
    dependencyCheck("database_connection", input.observation.databaseConnection),
    dependencyCheck("database_migrations", input.observation.databaseMigrations),
    dependencyCheck("github_app", input.observation.githubApp),
  ];
  if (input.profile === "worker" || input.profile === "release") {
    checks.push(dependencyCheck("worker_heartbeat", input.observation.workerHeartbeat!));
  }

  const state = overallState(checks);
  return {
    schemaVersion: "0.1",
    profile: input.profile,
    state,
    message:
      state === "READY"
        ? "Flowcordia live dependencies are ready for authenticated product checks."
        : state === "BLOCKED"
          ? "Flowcordia live dependencies are blocked and must not authorize rollout."
          : "Flowcordia live dependency evidence is unavailable and must be rechecked.",
    checkedAt: input.checkedAt.toISOString(),
    checks,
  };
}
