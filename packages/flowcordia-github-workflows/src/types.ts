import type { WorkflowDefinition, WorkflowIssue, WorkflowMigration } from "@flowcordia/workflow";

import type {
  GitHubRepositoryTarget,
  GitHubWorkflowAccessScope,
  GitHubWorkflowMutationContext,
} from "./access/scope.js";
import type { GitHubWorkflowMutationOperation } from "./repository/commit-message.js";

export type GitHubWorkflowStoreOperation = "read" | "save" | "delete";

export type GitHubWorkflowStoreErrorCode =
  | "invalid_input"
  | "invalid_document"
  | "not_found"
  | "conflict"
  | "identity_conflict"
  | "access_denied"
  | "rate_limited"
  | "unavailable"
  | "ambiguous_write";

export interface GitHubWorkflowStoreError {
  code: GitHubWorkflowStoreErrorCode;
  operation: GitHubWorkflowStoreOperation;
  message: string;
  retryable: boolean;
  repository?: GitHubRepositoryTarget;
  path?: string;
  requestId?: string;
  retryAfterMs?: number;
  expectedBlobSha?: string | null;
  actualBlobSha?: string | null;
  inputIssues?: string[];
  workflowIssues?: WorkflowIssue[];
}

export type GitHubWorkflowStoreResult<T> =
  | { success: true; value: T }
  | { success: false; error: GitHubWorkflowStoreError };

export interface GitHubWorkflowSource {
  repository: GitHubRepositoryTarget;
  path: string;
  requestedRevision: string;
  commitSha: string;
  blobSha: string;
  sourceSchemaVersion?: string;
}

export interface GitHubWorkflowReadValue {
  workflow: WorkflowDefinition;
  source: GitHubWorkflowSource;
  appliedMigrations: ReadonlyArray<{ fromVersion: string; toVersion: string }>;
}

export interface GitHubWorkflowMutationAudit {
  operation: GitHubWorkflowMutationOperation;
  tenantId: string;
  projectId: string;
  installationId: number;
  repository: GitHubRepositoryTarget;
  path: string;
  actorId: string;
  correlationId: string;
  previousBlobSha: string | null;
  blobSha: string | null;
  commitSha: string;
}

export interface GitHubWorkflowSaveValue {
  workflow: WorkflowDefinition;
  source: GitHubWorkflowSource;
  previousBlobSha: string | null;
  noChange: boolean;
  audit: GitHubWorkflowMutationAudit | null;
}

export interface GitHubWorkflowDeleteValue {
  repository: GitHubRepositoryTarget;
  path: string;
  previousBlobSha: string;
  commitSha: string;
  audit: GitHubWorkflowMutationAudit;
}

export interface ReadGitHubWorkflowInput {
  scope: GitHubWorkflowAccessScope;
  workflowId: string;
  revision?: string;
}

export interface SaveGitHubWorkflowInput {
  scope: GitHubWorkflowAccessScope;
  workflow: WorkflowDefinition;
  expectedBlobSha: string | null;
  mutation: GitHubWorkflowMutationContext;
}

export interface DeleteGitHubWorkflowInput {
  scope: GitHubWorkflowAccessScope;
  workflowId: string;
  expectedBlobSha: string;
  mutation: GitHubWorkflowMutationContext;
}

export interface GitHubWorkflowStoreOptions {
  clientResolver: import("./transport/client.js").GitHubInstallationClientResolver;
  migrations?: readonly WorkflowMigration[];
  workflowRoot?: string;
  maxWorkflowBytes?: number;
  readRetry?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}
