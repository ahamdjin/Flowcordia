import { parseFlowcordiaSubflowConfiguration } from "./subflow.js";
import type { WorkflowDefinition } from "./types.js";

export const FLOWCORDIA_DEPENDENCY_METADATA_VERSION = 1;
export const FLOWCORDIA_MAX_INDEXED_WORKFLOWS = 500;
export const FLOWCORDIA_MAX_SUBFLOW_DEPENDENCIES = 100;
export const FLOWCORDIA_MAX_DEPENDENCY_ISSUES = 20;

export interface FlowcordiaWorkflowDependencyEntry {
  workflowId: string;
  status: "VALID" | "INVALID";
  sourceCommitSha: string;
  dependencyMetadataVersion: number;
  subflowWorkflowIds: readonly string[];
}

export type FlowcordiaWorkflowDependencyIssueCode =
  | "duplicate_workflow"
  | "missing_root"
  | "invalid_root"
  | "stale_metadata"
  | "mixed_revision"
  | "missing_target"
  | "invalid_target"
  | "dependency_cycle"
  | "dependency_limit";

export interface FlowcordiaWorkflowDependencyIssue {
  code: FlowcordiaWorkflowDependencyIssueCode;
  workflowId: string;
  targetWorkflowId: string | null;
  path: readonly string[];
  message: string;
}

export type FlowcordiaWorkflowDependencyAnalysis =
  | { success: true; reachableWorkflowIds: readonly string[] }
  | { success: false; issues: readonly FlowcordiaWorkflowDependencyIssue[] };

export interface FlowcordiaSubflowCandidateEvaluation {
  eligible: boolean;
  message: string | null;
}

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;

export function collectFlowcordiaSubflowWorkflowIds(
  workflow: WorkflowDefinition
): readonly string[] {
  const workflowIds = new Set<string>();
  for (const node of workflow.nodes) {
    if (node.operation !== "subflow.invoke") continue;
    const parsed = parseFlowcordiaSubflowConfiguration(node.configuration);
    if (parsed.success) workflowIds.add(parsed.configuration.workflowId);
  }
  return [...workflowIds].sort();
}

function normalizeDependencies(value: readonly string[]): readonly string[] | null {
  if (value.length > FLOWCORDIA_MAX_SUBFLOW_DEPENDENCIES) return null;
  const normalized = [...new Set(value)].sort();
  if (
    normalized.length !== value.length ||
    normalized.some((workflowId) => !WORKFLOW_ID.test(workflowId))
  ) {
    return null;
  }
  return normalized;
}

function issue(
  code: FlowcordiaWorkflowDependencyIssueCode,
  workflowId: string,
  targetWorkflowId: string | null,
  path: readonly string[],
  message: string
): FlowcordiaWorkflowDependencyIssue {
  return { code, workflowId, targetWorkflowId, path, message };
}

export function analyzeFlowcordiaWorkflowDependencyGraph(input: {
  rootWorkflowId: string;
  sourceCommitSha: string;
  rootSubflowWorkflowIds: readonly string[];
  entries: readonly FlowcordiaWorkflowDependencyEntry[];
}): FlowcordiaWorkflowDependencyAnalysis {
  if (input.entries.length > FLOWCORDIA_MAX_INDEXED_WORKFLOWS) {
    return {
      success: false,
      issues: [
        issue(
          "dependency_limit",
          input.rootWorkflowId,
          null,
          [input.rootWorkflowId],
          `Subflow dependency validation supports at most ${FLOWCORDIA_MAX_INDEXED_WORKFLOWS} indexed workflows.`
        ),
      ],
    };
  }

  const entries = new Map<string, FlowcordiaWorkflowDependencyEntry>();
  const issues: FlowcordiaWorkflowDependencyIssue[] = [];
  for (const entry of input.entries) {
    if (entries.has(entry.workflowId)) {
      issues.push(
        issue(
          "duplicate_workflow",
          entry.workflowId,
          null,
          [entry.workflowId],
          `Workflow ${entry.workflowId} appears more than once in the exact repository index.`
        )
      );
      continue;
    }
    entries.set(entry.workflowId, entry);
  }
  if (issues.length > 0) return { success: false, issues };

  const root = entries.get(input.rootWorkflowId);
  if (!root) {
    return {
      success: false,
      issues: [
        issue(
          "missing_root",
          input.rootWorkflowId,
          null,
          [input.rootWorkflowId],
          `Workflow ${input.rootWorkflowId} is missing from the exact repository index.`
        ),
      ],
    };
  }
  if (root.status !== "VALID") {
    return {
      success: false,
      issues: [
        issue(
          "invalid_root",
          input.rootWorkflowId,
          null,
          [input.rootWorkflowId],
          `Workflow ${input.rootWorkflowId} is not valid in the exact repository index.`
        ),
      ],
    };
  }

  const rootDependencies = normalizeDependencies(input.rootSubflowWorkflowIds);
  if (!rootDependencies) {
    return {
      success: false,
      issues: [
        issue(
          "dependency_limit",
          input.rootWorkflowId,
          null,
          [input.rootWorkflowId],
          `Workflow ${input.rootWorkflowId} has invalid or excessive subflow dependency metadata.`
        ),
      ],
    };
  }

  const completed = new Set<string>();
  const active: string[] = [];
  const reachable = new Set<string>();

  const visit = (workflowId: string): void => {
    if (issues.length >= FLOWCORDIA_MAX_DEPENDENCY_ISSUES || completed.has(workflowId)) return;
    const entry = entries.get(workflowId);
    if (!entry) return;
    reachable.add(workflowId);

    if (entry.sourceCommitSha !== input.sourceCommitSha) {
      issues.push(
        issue(
          "mixed_revision",
          workflowId,
          null,
          [...active, workflowId],
          `Workflow ${workflowId} belongs to another repository revision. Synchronize before using subflows.`
        )
      );
      return;
    }
    if (
      workflowId !== input.rootWorkflowId &&
      entry.dependencyMetadataVersion !== FLOWCORDIA_DEPENDENCY_METADATA_VERSION
    ) {
      issues.push(
        issue(
          "stale_metadata",
          workflowId,
          null,
          [...active, workflowId],
          `Workflow ${workflowId} needs a fresh repository synchronization before subflow dependencies can be trusted.`
        )
      );
      return;
    }

    const dependencies =
      workflowId === input.rootWorkflowId
        ? rootDependencies
        : normalizeDependencies(entry.subflowWorkflowIds);
    if (!dependencies) {
      issues.push(
        issue(
          "dependency_limit",
          workflowId,
          null,
          [...active, workflowId],
          `Workflow ${workflowId} has invalid or excessive subflow dependency metadata.`
        )
      );
      return;
    }

    active.push(workflowId);
    for (const targetWorkflowId of dependencies) {
      if (issues.length >= FLOWCORDIA_MAX_DEPENDENCY_ISSUES) break;
      const cycleIndex = active.indexOf(targetWorkflowId);
      if (cycleIndex >= 0) {
        const cycle = [...active.slice(cycleIndex), targetWorkflowId];
        issues.push(
          issue(
            "dependency_cycle",
            workflowId,
            targetWorkflowId,
            cycle,
            `Subflow dependency cycle detected: ${cycle.join(" -> ")}.`
          )
        );
        continue;
      }
      const target = entries.get(targetWorkflowId);
      if (!target) {
        issues.push(
          issue(
            "missing_target",
            workflowId,
            targetWorkflowId,
            [...active, targetWorkflowId],
            `Subflow target ${targetWorkflowId} is missing from the exact repository index.`
          )
        );
        continue;
      }
      if (target.status !== "VALID") {
        issues.push(
          issue(
            "invalid_target",
            workflowId,
            targetWorkflowId,
            [...active, targetWorkflowId],
            `Subflow target ${targetWorkflowId} is invalid in the exact repository index.`
          )
        );
        continue;
      }
      visit(targetWorkflowId);
    }
    active.pop();
    completed.add(workflowId);
  };

  visit(input.rootWorkflowId);
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, reachableWorkflowIds: [...reachable].sort() };
}

export function evaluateFlowcordiaSubflowCandidate(input: {
  rootWorkflowId: string;
  candidateWorkflowId: string;
  sourceCommitSha: string;
  entries: readonly FlowcordiaWorkflowDependencyEntry[];
}): FlowcordiaSubflowCandidateEvaluation {
  if (input.candidateWorkflowId === input.rootWorkflowId) {
    return { eligible: false, message: "A workflow cannot invoke itself." };
  }
  const analysis = analyzeFlowcordiaWorkflowDependencyGraph({
    rootWorkflowId: input.rootWorkflowId,
    sourceCommitSha: input.sourceCommitSha,
    rootSubflowWorkflowIds: [input.candidateWorkflowId],
    entries: input.entries,
  });
  return analysis.success
    ? { eligible: true, message: null }
    : {
        eligible: false,
        message: analysis.issues[0]?.message ?? "The child workflow is unavailable.",
      };
}
