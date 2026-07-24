import {
  analyzeFlowcordiaWorkflowDependencyGraph,
  collectFlowcordiaSubflowWorkflowIds,
  evaluateFlowcordiaSubflowCandidate,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import type { WorkflowIndexEntryRecord } from "../index/types";

export interface WorkflowSubflowCandidateProjection {
  workflowId: string;
  name: string;
  description: string | null;
  eligible: boolean;
  message: string | null;
}

export interface WorkflowSubflowCatalogProjection {
  state: "READY" | "BLOCKED" | "UNAVAILABLE";
  sourceCommitSha: string | null;
  candidates: WorkflowSubflowCandidateProjection[];
  issues: Array<{ code: string; message: string; path: string[] }>;
}

export function unavailableWorkflowSubflowCatalog(): WorkflowSubflowCatalogProjection {
  return { state: "UNAVAILABLE", sourceCommitSha: null, candidates: [], issues: [] };
}

export function presentWorkflowSubflowCatalog(input: {
  workflow: WorkflowDefinition;
  sourceCommitSha: string;
  entries: readonly WorkflowIndexEntryRecord[];
}): WorkflowSubflowCatalogProjection {
  const dependencyEntries = input.entries.map((entry) => ({
    workflowId: entry.workflowId,
    status: entry.status,
    sourceCommitSha: entry.sourceCommitSha,
    dependencyMetadataVersion: entry.dependencyMetadataVersion,
    subflowWorkflowIds: entry.subflowWorkflowIds,
  }));
  const analysis = analyzeFlowcordiaWorkflowDependencyGraph({
    rootWorkflowId: input.workflow.id,
    sourceCommitSha: input.sourceCommitSha,
    rootSubflowWorkflowIds: collectFlowcordiaSubflowWorkflowIds(input.workflow),
    entries: dependencyEntries,
  });
  const candidates = input.entries
    .filter((entry) => entry.workflowId !== input.workflow.id)
    .map((entry) => {
      const evaluation = evaluateFlowcordiaSubflowCandidate({
        rootWorkflowId: input.workflow.id,
        candidateWorkflowId: entry.workflowId,
        sourceCommitSha: input.sourceCommitSha,
        entries: dependencyEntries,
      });
      return {
        workflowId: entry.workflowId,
        name: entry.name ?? entry.workflowId,
        description: entry.description,
        eligible: evaluation.eligible,
        message: evaluation.message,
      };
    })
    .sort((left, right) => left.workflowId.localeCompare(right.workflowId));

  return {
    state: analysis.success ? "READY" : "BLOCKED",
    sourceCommitSha: input.sourceCommitSha,
    candidates,
    issues: analysis.success
      ? []
      : analysis.issues.map((dependencyIssue) => ({
          code: dependencyIssue.code,
          message: dependencyIssue.message,
          path: [...dependencyIssue.path],
        })),
  };
}
