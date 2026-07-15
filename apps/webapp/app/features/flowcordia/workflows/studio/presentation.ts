import type { WorkflowDefinition, WorkflowIssue } from "@flowcordia/workflow";
import type {
  WorkflowIndexEntryRecord,
  WorkflowIndexSyncRecord,
} from "../index/types";

export interface WorkflowStudioListItem {
  workflowId: string;
  name: string;
  description: string | null;
  status: "VALID" | "INVALID";
  schemaVersion: string | null;
  nodeCount: number | null;
  edgeCount: number | null;
  indexedAt: string;
  sourceCommitSha: string;
  failure: { code: string; message: string } | null;
}

export interface WorkflowStudioNode {
  id: string;
  name: string;
  kind: WorkflowDefinition["nodes"][number]["kind"];
  operation: string;
  position: { x: number; y: number };
  configurationKeys: string[];
  credentialReferences: string[];
  runtime: {
    queue: string | null;
    concurrencyKey: string | null;
    machine: string | null;
    maxDurationSeconds: number | null;
    retry: {
      maxAttempts: number | null;
      minTimeoutMs: number | null;
      maxTimeoutMs: number | null;
      factor: number | null;
    } | null;
  } | null;
  codeReference: {
    repository: string | null;
    path: string;
    exportName: string;
    commit: string | null;
  } | null;
}

export interface WorkflowStudioGraph {
  workflowId: string;
  name: string;
  description: string | null;
  schemaVersion: string;
  labels: string[];
  nodes: WorkflowStudioNode[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
    condition: string | null;
  }>;
  source: {
    path: string;
    commitSha: string;
    blobSha: string;
    requestedRevision: string;
    sourceSchemaVersion: string;
    appliedMigrations: Array<{ fromVersion: string; toVersion: string }>;
  };
}

export interface WorkflowStudioSyncStatus {
  state: "NOT_INDEXED" | WorkflowIndexSyncRecord["status"];
  reason: string | null;
  requestedCommitSha: string | null;
  observedCommitSha: string | null;
  generation: string | null;
  entryCount: number;
  validCount: number;
  invalidCount: number;
  requestedAt: string | null;
  completedAt: string | null;
  failure: { code: string; message: string } | null;
}

export function presentWorkflowIndexEntry(entry: WorkflowIndexEntryRecord): WorkflowStudioListItem {
  return {
    workflowId: entry.workflowId,
    name: entry.name ?? entry.workflowId,
    description: entry.description,
    status: entry.status,
    schemaVersion: entry.schemaVersion,
    nodeCount: entry.nodeCount,
    edgeCount: entry.edgeCount,
    indexedAt: entry.indexedAt.toISOString(),
    sourceCommitSha: entry.sourceCommitSha,
    failure:
      entry.status === "INVALID"
        ? {
            code: entry.failureCode ?? "invalid_document",
            message: entry.failureMessage ?? "The workflow document is invalid.",
          }
        : null,
  };
}

export function presentWorkflowIndexSync(
  sync: WorkflowIndexSyncRecord | null
): WorkflowStudioSyncStatus {
  if (!sync) {
    return {
      state: "NOT_INDEXED",
      reason: null,
      requestedCommitSha: null,
      observedCommitSha: null,
      generation: null,
      entryCount: 0,
      validCount: 0,
      invalidCount: 0,
      requestedAt: null,
      completedAt: null,
      failure: null,
    };
  }
  return {
    state: sync.status,
    reason: sync.reason,
    requestedCommitSha: sync.requestedCommitSha,
    observedCommitSha: sync.observedCommitSha,
    generation: sync.generation.toString(),
    entryCount: sync.entryCount,
    validCount: sync.validCount,
    invalidCount: sync.invalidCount,
    requestedAt: sync.requestedAt.toISOString(),
    completedAt: sync.completedAt?.toISOString() ?? null,
    failure:
      sync.status === "FAILED"
        ? {
            code: sync.lastErrorCode ?? "workflow_index_failed",
            message: sync.lastErrorMessage ?? "Workflow indexing failed safely.",
          }
        : null,
  };
}

export function presentWorkflowGraph(input: {
  workflow: WorkflowDefinition;
  source: {
    path: string;
    commitSha: string;
    blobSha: string;
    requestedRevision: string;
    sourceSchemaVersion: string;
  };
  appliedMigrations: readonly { fromVersion: string; toVersion: string }[];
}): WorkflowStudioGraph {
  return {
    workflowId: input.workflow.id,
    name: input.workflow.name,
    description: input.workflow.description ?? null,
    schemaVersion: input.workflow.schemaVersion,
    labels: [...(input.workflow.labels ?? [])],
    nodes: input.workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name ?? node.operation,
      kind: node.kind,
      operation: node.operation,
      position: { ...node.position },
      configurationKeys: Object.keys(node.configuration).sort(),
      credentialReferences: [...(node.credentialReferences ?? [])],
      runtime: node.runtime
        ? {
            queue: node.runtime.queue ?? null,
            concurrencyKey: node.runtime.concurrencyKey ?? null,
            machine: node.runtime.machine ?? null,
            maxDurationSeconds: node.runtime.maxDurationSeconds ?? null,
            retry: node.runtime.retry
              ? {
                  maxAttempts: node.runtime.retry.maxAttempts ?? null,
                  minTimeoutMs: node.runtime.retry.minTimeoutMs ?? null,
                  maxTimeoutMs: node.runtime.retry.maxTimeoutMs ?? null,
                  factor: node.runtime.retry.factor ?? null,
                }
              : null,
          }
        : null,
      codeReference: node.codeReference
        ? {
            repository: node.codeReference.repository ?? null,
            path: node.codeReference.path,
            exportName: node.codeReference.exportName,
            commit: node.codeReference.commit ?? null,
          }
        : null,
    })),
    edges: input.workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      condition: edge.condition ?? null,
    })),
    source: {
      ...input.source,
      appliedMigrations: input.appliedMigrations.map((migration) => ({ ...migration })),
    },
  };
}

export function workflowIssueMessage(issues: readonly WorkflowIssue[] | undefined): string {
  return issues?.[0]?.message ?? "The workflow document does not satisfy the Flowcordia contract.";
}
