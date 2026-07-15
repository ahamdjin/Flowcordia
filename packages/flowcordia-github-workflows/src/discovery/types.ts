import type { GitHubRepositoryTarget, GitHubWorkflowAccessScope } from "../access/scope.js";

export interface GitHubWorkflowTreeEntry {
  path: string;
  blobSha: string;
  size: number | null;
}

export interface GitHubWorkflowTreeResult {
  commitSha: string;
  entries: readonly GitHubWorkflowTreeEntry[];
  truncated: boolean;
}

export interface GitHubWorkflowDiscoveryClient {
  resolveRevision(input: {
    repository: GitHubRepositoryTarget;
    revision: string;
  }): Promise<{ commitSha: string }>;

  listTree(input: {
    repository: GitHubRepositoryTarget;
    commitSha: string;
  }): Promise<GitHubWorkflowTreeResult>;
}

export interface GitHubWorkflowDiscoveryClientResolver {
  /**
   * The resolver must re-prove tenant, project, installation, repository, and branch ownership
   * before returning an installation-scoped client.
   */
  resolve(scope: GitHubWorkflowAccessScope): Promise<GitHubWorkflowDiscoveryClient>;
}

export interface GitHubWorkflowDiscoveryEntry extends GitHubWorkflowTreeEntry {
  workflowId: string;
}

export interface GitHubWorkflowDiscoverySnapshot {
  repository: GitHubRepositoryTarget;
  requestedRevision: string;
  commitSha: string;
  workflowRoot: string;
  entries: readonly GitHubWorkflowDiscoveryEntry[];
}

export type GitHubWorkflowDiscoveryErrorCode =
  | "invalid_input"
  | "access_denied"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "invalid_response"
  | "truncated_tree"
  | "catalog_limit_exceeded";

export interface GitHubWorkflowDiscoveryError {
  code: GitHubWorkflowDiscoveryErrorCode;
  message: string;
  retryable: boolean;
  requestId?: string;
  retryAfterMs?: number;
}

export type GitHubWorkflowDiscoveryResult =
  | { success: true; value: GitHubWorkflowDiscoverySnapshot }
  | { success: false; error: GitHubWorkflowDiscoveryError };
