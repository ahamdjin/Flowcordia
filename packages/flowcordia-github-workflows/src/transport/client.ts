import type { GitHubRepositoryTarget, GitHubWorkflowAccessScope } from "../access/scope.js";

export interface GitHubResolvedRevision {
  commitSha: string;
}

export type GitHubFileResult =
  | {
      found: true;
      blobSha: string;
      size: number;
      contentBase64: string;
    }
  | { found: false };

export interface GitHubFileMutationResult {
  commitSha: string;
  blobSha: string;
}

export interface GitHubFileDeletionResult {
  commitSha: string;
}

export interface GitHubRepositoryClient {
  resolveRevision(input: {
    repository: GitHubRepositoryTarget;
    revision: string;
  }): Promise<GitHubResolvedRevision>;

  getFile(input: {
    repository: GitHubRepositoryTarget;
    path: string;
    commitSha: string;
  }): Promise<GitHubFileResult>;

  putFile(input: {
    repository: GitHubRepositoryTarget;
    path: string;
    message: string;
    contentBase64: string;
    expectedBlobSha: string | null;
  }): Promise<GitHubFileMutationResult>;

  deleteFile(input: {
    repository: GitHubRepositoryTarget;
    path: string;
    message: string;
    expectedBlobSha: string;
  }): Promise<GitHubFileDeletionResult>;
}

export interface GitHubInstallationClientResolver {
  /**
   * The resolver must verify tenant/project ownership of the installation and repository before
   * returning an installation-scoped client. The store never accepts user tokens or app secrets.
   */
  resolve(scope: GitHubWorkflowAccessScope): Promise<GitHubRepositoryClient>;
}
