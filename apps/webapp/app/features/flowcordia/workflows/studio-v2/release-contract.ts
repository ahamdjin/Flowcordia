import type { JsonObject, WorkflowDefinition } from "@flowcordia/workflow";
import type { StudioV2WorkspaceScope } from "./workspace-contract";

export type StudioV2ReleaseStatus = "STAGED" | "DEPLOYING" | "DEPLOYED" | "FAILED";

export interface StudioV2ReleaseRecord {
  id: string;
  publicId: string;
  workspaceId: string;
  scope: StudioV2WorkspaceScope;
  workspaceVersion: bigint;
  document: WorkflowDefinition;
  documentSha256: string;
  taskId: string;
  validationTaskId: string | null;
  exportName: string;
  generatedSource: string;
  sourceSha256: string;
  orderedNodeIds: string[];
  triggerBinding: JsonObject | null;
  warnings: string[];
  status: StudioV2ReleaseStatus;
  deploymentId: string | null;
  failureMessage: string | null;
  stagedByActorId: string;
  deployedByActorId: string | null;
  stagedAt: Date;
  deployedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudioV2ReleaseProjection {
  publicId: string;
  workspaceKey: string;
  workspaceVersion: string;
  documentSha256: string;
  taskId: string;
  validationTaskId: string | null;
  exportName: string;
  sourceSha256: string;
  orderedNodeIds: string[];
  triggerBinding: JsonObject | null;
  warnings: string[];
  status: StudioV2ReleaseStatus;
  deploymentId: string | null;
  failureMessage: string | null;
  stagedAt: string;
  deployedAt: string | null;
}

export type StudioV2ReleaseErrorCode =
  | "invalid_release"
  | "release_not_found"
  | "release_conflict"
  | "release_not_tested"
  | "compilation_failed"
  | "corrupt_release";

export class StudioV2ReleaseError extends Error {
  constructor(
    public readonly code: StudioV2ReleaseErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "StudioV2ReleaseError";
  }
}

export function projectStudioV2Release(release: StudioV2ReleaseRecord): StudioV2ReleaseProjection {
  return {
    publicId: release.publicId,
    workspaceKey: release.scope.workspaceKey,
    workspaceVersion: release.workspaceVersion.toString(),
    documentSha256: release.documentSha256,
    taskId: release.taskId,
    validationTaskId: release.validationTaskId,
    exportName: release.exportName,
    sourceSha256: release.sourceSha256,
    orderedNodeIds: [...release.orderedNodeIds],
    triggerBinding: release.triggerBinding,
    warnings: [...release.warnings],
    status: release.status,
    deploymentId: release.deploymentId,
    failureMessage: release.failureMessage,
    stagedAt: release.stagedAt.toISOString(),
    deployedAt: release.deployedAt?.toISOString() ?? null,
  };
}
