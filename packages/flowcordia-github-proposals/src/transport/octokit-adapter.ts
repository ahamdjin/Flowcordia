import type { GitHubRepositoryTarget } from "@flowcordia/github-workflows";
import { GitHubTransportError } from "@flowcordia/github-workflows";

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
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MARK_READY_MUTATION = `mutation MarkFlowcordiaProposalReady($pullRequestId: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
    pullRequest { id isDraft }
  }
}`;

interface OctokitResponse<T> {
  data: T;
  headers?: Record<string, string | number | undefined>;
}

export interface FlowcordiaProposalOctokitLike {
  paginate(method: unknown, parameters: Record<string, unknown>): Promise<unknown[]>;
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
      getCombinedStatusForRef(input: {
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

function repositoryParameters(repository: GitHubRepositoryTarget) {
  return { owner: repository.owner, repo: repository.name };
}

function validObjectId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value);
}

function validPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function userId(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return undefined;
}

function parsePullRequest(
  value: unknown,
  detailed: boolean,
  mutationMayHaveSucceeded = false
): GitHubPullRequest {
  if (!isRecord(value) || !isRecord(value.head) || !isRecord(value.base) || !isRecord(value.user)) {
    throw invalidResponse(
      "GitHub returned an invalid pull request response.",
      mutationMayHaveSucceeded
    );
  }
  const authorId = userId(value.user.id);
  const merged = value.merged === true || typeof value.merged_at === "string";
  const mergeable = value.mergeable === true ? true : value.mergeable === false ? false : null;
  if (
    !validPositiveInteger(value.number) ||
    typeof value.node_id !== "string" ||
    value.node_id.length === 0 ||
    typeof value.html_url !== "string" ||
    (value.state !== "open" && value.state !== "closed") ||
    typeof value.draft !== "boolean" ||
    typeof value.head.ref !== "string" ||
    typeof value.base.ref !== "string" ||
    !validObjectId(value.head.sha) ||
    !authorId ||
    (value.body !== null && typeof value.body !== "string") ||
    (value.merge_commit_sha !== null &&
      value.merge_commit_sha !== undefined &&
      !validObjectId(value.merge_commit_sha)) ||
    (detailed && value.mergeable !== null && typeof value.mergeable !== "boolean")
  ) {
    throw invalidResponse(
      "GitHub returned an invalid pull request response.",
      mutationMayHaveSucceeded
    );
  }

  return {
    number: value.number,
    nodeId: value.node_id,
    url: value.html_url,
    state: value.state,
    draft: value.draft,
    merged,
    mergeCommitSha: validObjectId(value.merge_commit_sha) ? value.merge_commit_sha : null,
    baseBranch: value.base.ref,
    headBranch: value.head.ref,
    headSha: value.head.sha,
    authorId,
    body: value.body ?? null,
    mergeable,
    mergeableState: typeof value.mergeable_state === "string" ? value.mergeable_state : "unknown",
  };
}

function parseCheck(value: unknown): GitHubCheck {
  if (!isRecord(value)) throw invalidResponse("GitHub returned an invalid check response.");
  const rawStatus = value.status;
  const status =
    rawStatus === "completed"
      ? "completed"
      : rawStatus === "in_progress"
        ? "in_progress"
        : "queued";
  if (
    !validPositiveInteger(value.id) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    !validObjectId(value.head_sha) ||
    typeof rawStatus !== "string" ||
    (value.conclusion !== null && typeof value.conclusion !== "string") ||
    (value.started_at !== null && typeof value.started_at !== "string") ||
    (value.completed_at !== null && typeof value.completed_at !== "string")
  ) {
    throw invalidResponse("GitHub returned an invalid check response.");
  }
  return {
    id: value.id,
    name: value.name,
    commitSha: value.head_sha,
    status,
    conclusion: value.conclusion,
    startedAt: value.started_at,
    completedAt: value.completed_at,
  };
}

function parseStatus(value: unknown): GitHubCheck {
  if (
    !isRecord(value) ||
    !validPositiveInteger(value.id) ||
    typeof value.context !== "string" ||
    value.context.length === 0 ||
    !validObjectId(value.sha) ||
    typeof value.state !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    throw invalidResponse("GitHub returned an invalid commit status response.");
  }
  const pending = value.state === "pending";
  return {
    id: value.id,
    name: value.context,
    commitSha: value.sha,
    status: pending ? "in_progress" : "completed",
    conclusion: pending ? null : value.state === "success" ? "success" : "failure",
    startedAt: value.updated_at,
    completedAt: pending ? null : value.updated_at,
  };
}

function parseReview(value: unknown): GitHubReview {
  if (!isRecord(value) || !isRecord(value.user)) {
    throw invalidResponse("GitHub returned an invalid review response.");
  }
  const reviewerId = userId(value.user.id);
  const state = typeof value.state === "string" ? value.state.toLowerCase() : "";
  const submittedAt =
    typeof value.submitted_at === "string"
      ? value.submitted_at
      : state === "pending"
        ? ""
        : undefined;
  if (
    !validPositiveInteger(value.id) ||
    !reviewerId ||
    !["approved", "changes_requested", "commented", "dismissed", "pending"].includes(state) ||
    (value.commit_id !== null && !validObjectId(value.commit_id)) ||
    submittedAt === undefined
  ) {
    throw invalidResponse("GitHub returned an invalid review response.");
  }
  return {
    id: value.id,
    reviewerId,
    state: state as GitHubReview["state"],
    commitSha: value.commit_id,
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
      if (
        !isRecord(response.data) ||
        !isRecord(response.data.object) ||
        !validObjectId(response.data.object.sha)
      ) {
        throw invalidResponse("GitHub returned an invalid branch response.");
      }
      return { exists: true, sha: response.data.object.sha };
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
      if (
        !isRecord(response.data) ||
        !isRecord(response.data.object) ||
        !validObjectId(response.data.object.sha)
      ) {
        throw invalidResponse("GitHub returned an invalid branch creation response.", true);
      }
      return { sha: response.data.object.sha };
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
      const pullRequests = await this.#octokit.paginate(this.#octokit.rest.pulls.list, {
        ...repositoryParameters(input.repository),
        state: "all",
        base: input.baseBranch,
        head: `${input.repository.owner}:${input.headBranch}`,
        per_page: 100,
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
        this.#octokit.paginate(this.#octokit.rest.checks.listForRef, {
          ...repository,
          ref: pullRequest.headSha,
          per_page: 100,
        }),
        this.#octokit.paginate(this.#octokit.rest.repos.getCombinedStatusForRef, {
          ...repository,
          ref: pullRequest.headSha,
          per_page: 100,
        }),
        this.#octokit.paginate(this.#octokit.rest.pulls.listReviews, {
          ...repository,
          pull_number: input.pullRequestNumber,
          per_page: 100,
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
      if (!isRecord(response)) {
        throw invalidResponse("GitHub returned an invalid ready-for-review response.", true);
      }
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
      if (!isRecord(response.data) || typeof response.data.merged !== "boolean") {
        throw invalidResponse("GitHub returned an invalid merge response.", true);
      }
      const mergeCommitSha = validObjectId(response.data.sha) ? response.data.sha : null;
      if (response.data.merged && !mergeCommitSha) {
        throw invalidResponse("GitHub returned a merge without a commit object ID.", true);
      }
      return { merged: response.data.merged, mergeCommitSha };
    } catch (error) {
      throw transportError(error, { mutation: true, now: this.#now });
    }
  }
}
