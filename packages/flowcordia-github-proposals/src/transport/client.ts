import type {
  GitHubRepositoryTarget,
  GitHubWorkflowAccessScope,
} from "@flowcordia/github-workflows";

import type { GitHubMergeMethod } from "../types.js";

export type GitHubBranchResult = { exists: true; sha: string } | { exists: false };

export interface GitHubPullRequest {
  number: number;
  nodeId: string;
  url: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  mergeCommitSha: string | null;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  authorId: string;
  body: string | null;
  mergeable: boolean | null;
  mergeableState: string;
}

export interface GitHubCheck {
  id: number;
  name: string;
  commitSha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GitHubReview {
  id: number;
  reviewerId: string;
  state: "approved" | "changes_requested" | "commented" | "dismissed" | "pending";
  commitSha: string | null;
  submittedAt: string;
}

export interface GitHubProposalSnapshot {
  pullRequest: GitHubPullRequest;
  checks: GitHubCheck[];
  reviews: GitHubReview[];
}

export interface GitHubMergeResult {
  merged: boolean;
  mergeCommitSha: string | null;
}

export interface GitHubProposalClient {
  getBranch(input: {
    repository: GitHubRepositoryTarget;
    branch: string;
  }): Promise<GitHubBranchResult>;

  createBranch(input: {
    repository: GitHubRepositoryTarget;
    branch: string;
    fromCommitSha: string;
  }): Promise<{ sha: string }>;

  findPullRequests(input: {
    repository: GitHubRepositoryTarget;
    baseBranch: string;
    headBranch: string;
  }): Promise<GitHubPullRequest[]>;

  createPullRequest(input: {
    repository: GitHubRepositoryTarget;
    baseBranch: string;
    headBranch: string;
    title: string;
    body: string;
    draft: true;
  }): Promise<GitHubPullRequest>;

  getProposalSnapshot(input: {
    repository: GitHubRepositoryTarget;
    pullRequestNumber: number;
  }): Promise<GitHubProposalSnapshot>;

  markReadyForReview(input: {
    repository: GitHubRepositoryTarget;
    pullRequestNumber: number;
    expectedHeadSha: string;
  }): Promise<GitHubPullRequest>;

  mergePullRequest(input: {
    repository: GitHubRepositoryTarget;
    pullRequestNumber: number;
    expectedHeadSha: string;
    method: GitHubMergeMethod;
  }): Promise<GitHubMergeResult>;
}

export interface GitHubProposalClientResolver {
  /**
   * Resolve only after authorizing tenant, project, installation, repository, and base branch.
   * The returned client must use installation credentials, never a caller-provided token.
   */
  resolve(scope: GitHubWorkflowAccessScope): Promise<GitHubProposalClient>;
}
