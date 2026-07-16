import type { ControlPlaneScope } from "@flowcordia/control-plane";
import type { WorkflowDefinition, WorkflowIssue } from "@flowcordia/workflow";

export type WorkflowIndexEntryStatus = "VALID" | "INVALID";
export type WorkflowIndexSyncStatus = "PENDING" | "RUNNING" | "IDLE" | "FAILED";
export type WorkflowIndexSyncReason = "initial" | "manual" | "push" | "reconcile";

export interface WorkflowIndexScope extends ControlPlaneScope {
  githubAppInstallationId: string;
}

export interface WorkflowIndexEntryInput {
  workflowId: string;
  workflowPath: string;
  sourceCommitSha: string;
  sourceBlobSha: string;
  indexedAt: Date;
  status: WorkflowIndexEntryStatus;
  name: string | null;
  description: string | null;
  schemaVersion: string | null;
  nodeCount: number | null;
  edgeCount: number | null;
  canonicalSha256: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface WorkflowIndexEntryRecord extends WorkflowIndexEntryInput {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowIndexSyncRecord {
  id: string;
  status: WorkflowIndexSyncStatus;
  reason: string;
  requestedCommitSha: string | null;
  observedCommitSha: string | null;
  generation: bigint;
  entryCount: number;
  validCount: number;
  invalidCount: number;
  lockedBy: string | null;
  lockToken: string | null;
  lockExpiresAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimedWorkflowIndexSync extends WorkflowIndexSyncRecord {
  scope: WorkflowIndexScope;
}

export interface WorkflowIndexReadResult {
  entry: WorkflowIndexEntryRecord;
  workflow: WorkflowDefinition | null;
  issues: readonly WorkflowIssue[];
  stale: boolean;
}

export interface WorkflowIndexAuditInput {
  eventType:
    | "workflow_index.sync_requested"
    | "workflow_index.sync_started"
    | "workflow_index.sync_completed"
    | "workflow_index.sync_failed"
    | "workflow_index.push_scheduled"
    | "workflow_index.push_ignored";
  actorId: string;
  correlationId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}
