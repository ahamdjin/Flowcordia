export const FLOWCORDIA_REPOSITORY_READINESS_CHECK_IDS = [
  "repository-binding",
  "github-installation",
  "contents-permission",
  "pull-request-permission",
  "checks-permission",
  "production-branch",
  "workflow-catalog",
  "workflow-index",
  "trigger-config",
  "generated-task-discovery",
  "preview-deployments",
] as const;

export type FlowcordiaRepositoryReadinessCheckId =
  (typeof FLOWCORDIA_REPOSITORY_READINESS_CHECK_IDS)[number];

export type FlowcordiaRepositoryReadinessCheckState = "PASSED" | "BLOCKED" | "UNAVAILABLE";

export interface FlowcordiaRepositoryReadinessCheck {
  id: FlowcordiaRepositoryReadinessCheckId;
  label: string;
  state: FlowcordiaRepositoryReadinessCheckState;
  message: string;
}

export interface FlowcordiaRepositoryReadinessProjection {
  state: "READY" | "BLOCKED" | "UNAVAILABLE";
  checkedAt: string;
  repository: {
    owner: string;
    name: string;
    branch: string;
    commitSha: string | null;
  } | null;
  checks: FlowcordiaRepositoryReadinessCheck[];
}

const order = new Map(FLOWCORDIA_REPOSITORY_READINESS_CHECK_IDS.map((id, index) => [id, index]));

function bounded(value: string, fallback: string): string {
  const normalized = value.trim();
  return (normalized || fallback).slice(0, 500);
}

export function summarizeFlowcordiaRepositoryReadiness(
  checks: readonly FlowcordiaRepositoryReadinessCheck[]
): FlowcordiaRepositoryReadinessProjection["state"] {
  if (checks.some((check) => check.state === "UNAVAILABLE")) return "UNAVAILABLE";
  if (checks.some((check) => check.state === "BLOCKED")) return "BLOCKED";
  return "READY";
}

export function presentFlowcordiaRepositoryReadiness(input: {
  checkedAt: Date;
  repository: FlowcordiaRepositoryReadinessProjection["repository"];
  checks: readonly FlowcordiaRepositoryReadinessCheck[];
}): FlowcordiaRepositoryReadinessProjection {
  const seen = new Set<FlowcordiaRepositoryReadinessCheckId>();
  const checks = input.checks
    .map((check) => {
      if (seen.has(check.id)) {
        throw new TypeError(`Duplicate Flowcordia repository readiness check: ${check.id}`);
      }
      seen.add(check.id);
      return {
        id: check.id,
        label: bounded(check.label, "Repository readiness"),
        state: check.state,
        message: bounded(check.message, "No readiness detail is available."),
      };
    })
    .sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999));

  return {
    state: summarizeFlowcordiaRepositoryReadiness(checks),
    checkedAt: input.checkedAt.toISOString(),
    repository: input.repository ? { ...input.repository } : null,
    checks,
  };
}
