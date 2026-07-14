import type { GitHubRepositoryTarget, GitHubWorkflowAccessScope } from "../access/scope.js";
import type { GitHubWorkflowMutationAudit, GitHubWorkflowSource } from "../types.js";

export function workflowSource(input: {
  repository: GitHubRepositoryTarget;
  path: string;
  requestedRevision: string;
  commitSha: string;
  blobSha: string;
  sourceSchemaVersion?: string;
}): GitHubWorkflowSource {
  return input;
}

export function mutationAudit(input: {
  operation: "create" | "update" | "delete";
  scope: GitHubWorkflowAccessScope;
  path: string;
  actorId: string;
  correlationId: string;
  previousBlobSha: string | null;
  blobSha: string | null;
  commitSha: string;
}): GitHubWorkflowMutationAudit {
  return {
    operation: input.operation,
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    installationId: input.scope.installationId,
    repository: input.scope.repository,
    path: input.path,
    actorId: input.actorId,
    correlationId: input.correlationId,
    previousBlobSha: input.previousBlobSha,
    blobSha: input.blobSha,
    commitSha: input.commitSha,
  };
}
