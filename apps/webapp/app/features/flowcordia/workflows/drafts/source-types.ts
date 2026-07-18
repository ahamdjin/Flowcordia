import { createHash } from "node:crypto";

export interface WorkflowDraftSourceFileRecord {
  id: string;
  publicId: string;
  draftId: string;
  functionId: string;
  sourcePath: string;
  exportName: string;
  baseCommitSha: string;
  baseBlobSha: string;
  baseSourceText: string;
  baseSourceSha256: string;
  sourceText: string;
  sourceSha256: string;
  version: bigint;
  createdByActorId: string;
  updatedByActorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowDraftSourceAuditInput {
  eventType:
    | "workflow_draft_source.started"
    | "workflow_draft_source.resumed"
    | "workflow_draft_source.edited"
    | "workflow_draft_source.reset";
  actorId: string;
  correlationId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface WorkflowDraftSourceIdentity {
  functionId: string;
  sourcePath: string;
  exportName: string;
  baseCommitSha: string;
  baseBlobSha: string;
}

export function sourceTextSha256(sourceText: string): string {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

export function isWorkflowDraftSourceChanged(source: WorkflowDraftSourceFileRecord): boolean {
  return source.sourceSha256 !== source.baseSourceSha256;
}
