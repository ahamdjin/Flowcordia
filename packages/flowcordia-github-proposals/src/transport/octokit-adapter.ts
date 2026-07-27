import type { GitHubRepositoryTarget } from "@flowcordia/github-workflows";
import {
  GitHubTransportError,
  parseGitHubBranchResponse,
  parseGitHubCheckResponse,
  parseGitHubCommitStatusResponse,
  parseGitHubGraphqlAcknowledgement,
  parseGitHubMergeResponse,
  parseGitHubObjectId,
  parseGitHubPullRequestResponse,
  parseGitHubReviewResponse,
} from "@flowcordia/github-workflows";

import type { GitHubMergeMethod } from "../types.js";
import type {
  GitHubBranchResult,
  GitHubCheck,
  GitHubMergeResult,
  GitHubProposalClient,
  GitHubProposalSnapshot,
  GitHubPullRequest,
  GitHubReview,
} from "./client.js";

type UnknownRecord = Record<string, unknown>;
const GITHUB_PAGE_SIZE = 100;
const MAX_MATCHING_PULL_REQUESTS = 100;
const MAX_CHECK_RUNS = 1_000;
const MAX_COMMIT_STATUSES = 1_000;
const MAX_REVIEWS = 1_000;
const MARK_READY_MUTATION = `mutation MarkFlowcordiaProposalReady($pullRequestId: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
    pullRequest { id isDraft }
  }
}`;

interface OctokitResponse<T> {
  data: T;
  headers?: Record<string, string | number | undefined>;
}

interface FlowcordiaPaginateIterator {
  iterator(
    method: unknown,
    parameters: Record<string, unknown>
  ): AsyncIterable<OctokitResponse<unknown[]>>;
}

export interface FlowcordiaProposalOctokitLike {
  paginate: FlowcordiaPaginateIterator;
  graphql(query: string, variables: Record<string, unknown>): Promise<unknown>;
  rest: {
    git: {
      getRef(input: {
        owner: string;
        repo: string;
        ref: string;
      }): Promise<OctokitResponse<unknown>>;
      createRef(input: {
        owner: string;
        repo: string;
        ref: string;
        sha: string;
      }): Promise<OctokitResponse<unknown>>;
    };
    pulls: {
      list(input: {
        owner: string;
        repo: string;
        state: "all";
        base: string;
        head: string;
        per_page: number;
      }): Promise<OctokitResponse<unknown>>;
      create(input: {
        owner: string;
        repo: string;
        base: string;
        head: string;
        title: string;
        body: string;
        draft: true;
      }): Promise<OctokitResponse<unknown>>;
      get(input: {
        owner: string;
        repo: string;
        pull_number: number;
      }): Promise<OctokitResponse<unknown>>;
      listReviews(input: {
        owner: string;
        repo: string;
        pull_number: number;
        per_page: number;
      }): Promise<OctokitResponse<unknown>>;
      merge(input: {
        owner: string;
        repo: string;
        pull_number: number;
        sha: string;
        merge_method: GitHubMergeMethod;
      }): Promise<OctokitResponse<unknown>>;
    };
    checks: {
      listForRef(input: {
        owner: string;
        repo: string;
        ref: string;
        per_page: number;
      }): Promise<OctokitResponse<unknown>>;
    };
    repos: {
      listCommitStatusesForRef(input: {
        owner: string;
        repo: string;
        ref: string;
        per_page: number;
      }): Promise<OctokitResponse<unknown>>;
    };
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function statusFromError(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  if (typeof error.status === "number") return error.status;
  if (isRecord(error.response) && typeof error.response.status === "number") {
    return error.response.status;
  }
  return undefined;
}

function headersFromError(error: unknown): Record<string, unknown> {
  if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.headers)) return {};
  return error.response.headers;
}

function headerValue(headers: Record<string, unknown>, name: string): string | undefined {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function rateLimitDelay(headers: Record<string, unknown>, now: () => number): number | undefined {
  const retryAfter = headerValue(headers, "retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now());
  }
  const reset = Number(headerValue(headers, "x-ratelimit-reset"));
  return Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - now()) : undefined;
}

function transportError(
  error: unknown,
  options: { mutation: boolean; now: () => number }
): GitHubTransportError {
  if (error instanceof GitHubTransportError) return error;
  const status = statusFromError(error);
  const headers = headersFromError(error);
  const limited =
    status === 429 || (status === 403 && headerValue(headers, "x-ratelimit-remaining") === "0");
  const mayHaveSucceeded =
    options.mutation && (status === undefined || status === 408 || status >= 500);
  return new GitHubTransportError(
    limited ? "GitHub rate limit was exceeded." : "GitHub request failed.",
    {
      code: limited ? "rate_limited" : status === undefined ? "network_error" : "http_error",
      status,
      requestId: headerValue(headers, "x-github-request-id"),
      retryAfterMs: limited ? rateLimitDelay(headers, options.now) : undefined,
      mutationMayHaveSucceeded: mayHaveSucceeded,
    }
  );
}

function invalidResponse(message: string, mutation = false): GitHubTransportError {
  return new GitHubTransportError(message, {
    code: "invalid_response",
    mutationMayHaveSucceeded: mutation,
  });
}

async function readBoundedPages(input: {
  octokit: FlowcordiaProposalOctokitLike;
  method: unknown;
  parameters: Record<string, unknown>;
  maximumItems: number;
  evidenceLabel: string;
}): Promise<unknown[]> {
  const items: unknown[] = [];
  for await (const response of input.octokit.paginate.iterator(input.method, {
    ...input.parameters,
    per_page: GITHUB_PAGE_SIZE,
  })) {
    if (!Array.isArray(response.data)) {
      throw invalidResponse(`GitHub returned invalid ${input.evidenceLabel} pagination data.`);
    }
    if (items.length + response.data.length > input.maximumItems) {
      throw invalidResponse(
        `GitHub returned more than ${input.maximumItems} ${input.evidenceLabel} records.`
      );
    }
    items.push(...response.data);
  }
  return items;
}

function repositoryParameters(repository: GitHubRepositoryTarget) {
  return { owner: repository.owner, repo: repository.name };
}

function parsePullRequest(
  value: unknown,
  detailed: boolean,
  mutationMayHaveSucceeded = false
): GitHubPullRequest {
  const parsed = parseGitHubPullRequestResponse(
    value,
    "GitHub returned an invalid pull request response.",
    mutationMayHaveSucceeded
  );
  if (detailed && parsed.mergeable !== null && typeof parsed.mergeable !== "boolean") {
    throw invalidResponse(
      "GitHub returned an invalid pull request response.",
      mutationMayHaveSucceeded
    );
  }
  const merged = parsed.merged === true || typeof parsed.merged_at === "string";
  const mergeable = parsed.mergeable === true ? true : parsed.mergeable === false ? false : null;
  return {
    number: parsed.number,
    nodeId: parsed.node_id,
    url: parsed.html_url,
    state: parsed.state,
    draft: parsed.draft,
    merged,
    mergeCommitSha: parsed.merge_commit_sha ?? null,
    baseBranch: parsed.base.ref,
    headBranch: parsed.head.ref,
    headSha: parsed.head.sha,
    authorId: String(parsed.user.id),
    body: parsed.body,
    mergeable,
    mergeableState: typeof parsed.mergeable_state === "string" ? parsed.mergeable_state : "unknown",
  };
}

function parseCheck(value: unknown): GitHubCheck {
  const parsed = parseGitHubCheckResponse(value, "GitHub returned an invalid check response.");
  const status =
    parsed.status === "completed"
      ? "completed"
      : parsed.status === "in_progress"
        ? "in_progress"
        : "queued";
  return {
    id: parsed.id,
    name: parsed.name,
    commitSha: parsed.head_sha,
    status,
    conclusion: parsed.conclusion,
    startedAt: parsed.started_at,
    completedAt: parsed.completed_at,
  };
}

function parseStatus(value: unknown): GitHubCheck {
  const parsed = parseGitHubCommitStatusResponse(
    value,
    "GitHub returned an invalid commit status response."
  );
  const pending = parsed.state === "pending";
  return {
    id: parsed.id,
    name: parsed.context,
    commitSha: parsed.sha,
    status: pending ? "in_progress" : "completed",
    conclusion: pending ? null : parsed.state === "success" ? "success" : "failure",
    startedAt: parsed.updated_at,
    completedAt: pending ? null : parsed.updated_at,
  };
}

function parseReview(value: unknown): GitHubReview {
  const parsed = parseGitHubReviewResponse(value, "GitHub returned an invalid review response.");
  const state = parsed.state.toLowerCase();
  const submittedAt = parsed.submitted_at ?? (state === "pending" ? "" : undefined);
  if (
    !["approved", "changes_requested", "commented", "dismissed", "pending"].includes(state) ||
    submittedAt === undefined
  ) {
    throw invalidResponse("GitHub returned an invalid review response.");
  }
  return {
    id: parsed.id,
    reviewerId: String(parsed.user.id),
    state: state as GitHubReview["state"],
    commitSha: parsed.commit_id,
    submittedAt,
  };
}

export class OctokitGitHubProposalClient implements GitHubProposalClient {
  readonly #octokit: FlowcordiaProposalOctokitLike;
  readonly #now: () => number;

  constructor(octokit: FlowcordiaProposalOctokitLike, options: { now?: () => number } = {}) {
    this.#octokit = octokit;
    this.#now = options.now ?? Date.now;
  }

  async getBranch(input: {
    repository: GitHubRepositoryTarget;
    branch: string;
  }): Promise<GitHubBranchResult> {
    try {
      const response = await this.#octokit.rest.git.getRef({
        ...repositoryParameters(input.repository),
        ref: `heads/${input.branch}`,
      });
      const branch = parseGitHubBranchResponse(
        response.data,
        "GitHub returned an invalid branch response."
      );
      return { exists: true, sha: branch.object.sha };
    } catch (error) {
      if (statusFromError(error) === 404) return { exists: false };
      throw transportError(error, { mutation: false, now: this.#now });
    }
  }

  async createBranch(input: {
    repository: GitHubRepositoryTarget;
    branch: string;
    fromCommitSha: string;
  }): Promise<{ sha: string }> {
    try {
      const response = await this.#octokit.rest.git.createRef({
        ...repositoryParameters(input.repository),
        ref: `refs/heads/${input.branch}`,
        sha: input.fromCommitSha,
      });
      const branch = parseGitHubBranchResponse(
        response.data,
        "GitHub returned an invalid branch creation response.",
        true
      );
      return { sha: branch.object.sha };
    } catch (error) {
      throw transportError(error, { mutation: true, now: this.#now });
    }
  }

  async findPullRequests(input: {
    repository: GitHubRepositoryTarget;
    baseBranch: string;
    headBranch: string;
  }): Promise<GitHubPullRequest[]> {
    try {
      const pullRequests = await readBoundedPages({
        octokit: this.#octokit,
        method: this.#octokit.rest.pulls.list,
        parameters: {
          ...repositoryParameters(input.repository),
          state: "all",
          base: input.baseBranch,
          head: `${input.repository.owner}:${input.headBranch}`,
        },
        maximumItems: MAX_MATCHING_PULL_REQUESTS,
        evidenceLabel: "matching pull request",
      });
      return pullRequests.map((pullRequest) => parsePullRequest(pullRequest, false));
    } catch (error) {
      throw transportError(error, { mutation: false, now: this.#now });
    }
  }

  async createPullRequest(input: {
    repository: GitHubRepositoryTarget;
    baseBranch: string;
    headBranch: string;
    title: string;
    body: string;
    draft: true;
  }): Promise<GitHubPullRequest> {
    try {
      const response = await this.#octokit.rest.pulls.create({
        ...repositoryParameters(input.repository),
        base: input.baseBranch,
        head: input.headBranch,
        title: input.title,
        body: input.body,
        draft: true,
      });
      return parsePullRequest(response.data, false, true);
    } catch (error) {
      throw transportError(error, { mutation: true, now: this.#now });
    }
  }

  async getProposalSnapshot(input: {
    repository: GitHubRepositoryTarget;
    pullRequestNumber: number;
  }): Promise<GitHubProposalSnapshot> {
    try {
      const repository = repositoryParameters(input.repository);
      const response = await this.#octokit.rest.pulls.get({
        ...repository,
        pull_number: input.pullRequestNumber,
      });
      const pullRequest = parsePullRequest(response.data, true);
      const [checks, statuses, reviews] = await Promise.all([
        readBoundedPages({
          octokit: this.#octokit,
          method: this.#octokit.rest.checks.listForRef,
          parameters: { ...repository, ref: pullRequest.headSha },
          maximumItems: MAX_CHECK_RUNS,
          evidenceLabel: "check run",
        }),
        readBoundedPages({
          octokit: this.#octokit,
          method: this.#octokit.rest.repos.listCommitStatusesForRef,
          parameters: { ...repository, ref: pullRequest.headSha },
          maximumItems: MAX_COMMIT_STATUSES,
          evidenceLabel: "commit status",
        }),
        readBoundedPages({
          octokit: this.#octokit,
          method: this.#octokit.rest.pulls.listReviews,
          parameters: { ...repository, pull_number: input.pullRequestNumber },
          maximumItems: MAX_REVIEWS,
          evidenceLabel: "review",
        }),
      ]);
      return {
        pullRequest,
        checks: [...checks.map(parseCheck), ...statuses.map(parseStatus)],
        reviews: reviews.map(parseReview),
      };
    } catch (error) {
      throw transportError(error, { mutation: false, now: this.#now });
    }
  }

  async markReadyForReview(input: {
    repository: GitHubRepositoryTarget;
    pullRequestNumber: number;
    expectedHeadSha: string;
  }): Promise<GitHubPullRequest> {
    let mutationAttempted = false;
    try {
      const repository = repositoryParameters(input.repository);
      const before = parsePullRequest(
        (
          await this.#octokit.rest.pulls.get({
            ...repository,
            pull_number: input.pullRequestNumber,
          })
        ).data,
        true
      );
      if (before.headSha !== input.expectedHeadSha) {
        throw new GitHubTransportError("Pull request head changed.", {
          code: "http_error",
          status: 409,
        });
      }
      if (!before.draft) return before;
      mutationAttempted = true;
      const response = await this.#octokit.graphql(MARK_READY_MUTATION, {
        pullRequestId: before.nodeId,
      });
      parseGitHubGraphqlAcknowledgement(
        response,
        "GitHub returned an invalid ready-for-review response.",
        true
      );
      return parsePullRequest(
        (
          await this.#octokit.rest.pulls.get({
            ...repository,
            pull_number: input.pullRequestNumber,
          })
        ).data,
        true,
        true
      );
    } catch (error) {
      throw transportError(error, { mutation: mutationAttempted, now: this.#now });
    }
  }

  async mergePullRequest(input: {
    repository: GitHubRepositoryTarget;
    pullRequestNumber: number;
    expectedHeadSha: string;
    method: GitHubMergeMethod;
  }): Promise<GitHubMergeResult> {
    try {
      const response = await this.#octokit.rest.pulls.merge({
        ...repositoryParameters(input.repository),
        pull_number: input.pullRequestNumber,
        sha: input.expectedHeadSha,
        merge_method: input.method,
      });
      const merge = parseGitHubMergeResponse(
        response.data,
        "GitHub returned an invalid merge response.",
        true
      );
      const mergeCommitSha = parseGitHubObjectId(merge.sha);
      if (merge.merged && !mergeCommitSha) {
        throw invalidResponse("GitHub returned a merge without a commit object ID.", true);
      }
      return {
        merged: merge.merged,
        mergeCommitSha,
      };
    } catch (error) {
      throw transportError(error, { mutation: true, now: this.#now });
    }
  }
}
