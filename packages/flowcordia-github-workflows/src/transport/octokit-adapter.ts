import type { GitHubRepositoryTarget } from "../access/scope.js";
import type {
  GitHubFileDeletionResult,
  GitHubFileMutationResult,
  GitHubFileResult,
  GitHubRepositoryClient,
  GitHubResolvedRevision,
} from "./client.js";
import { GitHubTransportError } from "./errors.js";

type UnknownRecord = Record<string, unknown>;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

interface OctokitResponse<T> {
  data: T;
  headers?: Record<string, string | number | undefined>;
}

export interface FlowcordiaOctokitLike {
  rest: {
    repos: {
      getCommit(input: {
        owner: string;
        repo: string;
        ref: string;
      }): Promise<OctokitResponse<unknown>>;
      getContent(input: {
        owner: string;
        repo: string;
        path: string;
        ref: string;
      }): Promise<OctokitResponse<unknown>>;
      createOrUpdateFileContents(input: {
        owner: string;
        repo: string;
        path: string;
        branch: string;
        message: string;
        content: string;
        sha?: string;
      }): Promise<OctokitResponse<unknown>>;
      deleteFile(input: {
        owner: string;
        repo: string;
        path: string;
        branch: string;
        message: string;
        sha: string;
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
  if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.headers)) {
    return {};
  }
  return error.response.headers;
}

function headerValue(headers: Record<string, unknown>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function retryAfterMs(headers: Record<string, unknown>, now: () => number): number | undefined {
  const retryAfter = headerValue(headers, "retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);

    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now());
  }

  const reset = Number(headerValue(headers, "x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(0, reset * 1000 - now());
  }

  return undefined;
}

function transportError(
  error: unknown,
  options: { mutation: boolean; now: () => number }
): GitHubTransportError {
  if (error instanceof GitHubTransportError) return error;

  const status = statusFromError(error);
  const headers = headersFromError(error);
  const remaining = headerValue(headers, "x-ratelimit-remaining");
  const limited = status === 429 || (status === 403 && remaining === "0");
  const code = limited ? "rate_limited" : status === undefined ? "network_error" : "http_error";
  const mayHaveSucceeded =
    options.mutation && (status === undefined || status >= 500 || status === 408);

  return new GitHubTransportError(
    limited ? "GitHub rate limit was exceeded." : "GitHub request failed.",
    {
      code,
      status,
      requestId: headerValue(headers, "x-github-request-id"),
      retryAfterMs: limited ? retryAfterMs(headers, options.now) : undefined,
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

export class OctokitGitHubRepositoryClient implements GitHubRepositoryClient {
  readonly #octokit: FlowcordiaOctokitLike;
  readonly #now: () => number;

  constructor(octokit: FlowcordiaOctokitLike, options: { now?: () => number } = {}) {
    this.#octokit = octokit;
    this.#now = options.now ?? Date.now;
  }

  async resolveRevision(input: {
    repository: GitHubRepositoryTarget;
    revision: string;
  }): Promise<GitHubResolvedRevision> {
    try {
      const response = await this.#octokit.rest.repos.getCommit({
        ...repositoryParameters(input.repository),
        ref: input.revision,
      });
      if (
        !isRecord(response.data) ||
        typeof response.data.sha !== "string" ||
        !OBJECT_ID_PATTERN.test(response.data.sha)
      ) {
        throw invalidResponse("GitHub returned an invalid commit response.");
      }
      return { commitSha: response.data.sha };
    } catch (error) {
      throw transportError(error, { mutation: false, now: this.#now });
    }
  }

  async getFile(input: {
    repository: GitHubRepositoryTarget;
    path: string;
    commitSha: string;
  }): Promise<GitHubFileResult> {
    try {
      const response = await this.#octokit.rest.repos.getContent({
        ...repositoryParameters(input.repository),
        path: input.path,
        ref: input.commitSha,
      });
      const data = response.data;
      if (
        !isRecord(data) ||
        data.type !== "file" ||
        typeof data.sha !== "string" ||
        !OBJECT_ID_PATTERN.test(data.sha) ||
        typeof data.size !== "number" ||
        !Number.isSafeInteger(data.size) ||
        data.size < 0
      ) {
        throw invalidResponse("GitHub returned an invalid file response.");
      }

      const largeFileWithoutInlineContent =
        data.size > 1024 * 1024 && data.encoding === "none" && data.content === "";
      if (
        !largeFileWithoutInlineContent &&
        (data.encoding !== "base64" || typeof data.content !== "string")
      ) {
        throw invalidResponse("GitHub returned an invalid file response.");
      }

      return {
        found: true,
        blobSha: data.sha,
        size: data.size,
        contentBase64: largeFileWithoutInlineContent ? "" : (data.content as string),
      };
    } catch (error) {
      if (statusFromError(error) === 404) return { found: false };
      throw transportError(error, { mutation: false, now: this.#now });
    }
  }

  async putFile(input: {
    repository: GitHubRepositoryTarget;
    path: string;
    message: string;
    contentBase64: string;
    expectedBlobSha: string | null;
  }): Promise<GitHubFileMutationResult> {
    try {
      const request = {
        ...repositoryParameters(input.repository),
        path: input.path,
        branch: input.repository.branch,
        message: input.message,
        content: input.contentBase64,
        ...(input.expectedBlobSha ? { sha: input.expectedBlobSha } : {}),
      };
      const response = await this.#octokit.rest.repos.createOrUpdateFileContents(request);
      const data = response.data;
      if (
        !isRecord(data) ||
        !isRecord(data.commit) ||
        typeof data.commit.sha !== "string" ||
        !OBJECT_ID_PATTERN.test(data.commit.sha) ||
        !isRecord(data.content) ||
        typeof data.content.sha !== "string" ||
        !OBJECT_ID_PATTERN.test(data.content.sha)
      ) {
        throw invalidResponse("GitHub returned an invalid file mutation response.", true);
      }

      return { commitSha: data.commit.sha, blobSha: data.content.sha };
    } catch (error) {
      throw transportError(error, { mutation: true, now: this.#now });
    }
  }

  async deleteFile(input: {
    repository: GitHubRepositoryTarget;
    path: string;
    message: string;
    expectedBlobSha: string;
  }): Promise<GitHubFileDeletionResult> {
    try {
      const response = await this.#octokit.rest.repos.deleteFile({
        ...repositoryParameters(input.repository),
        path: input.path,
        branch: input.repository.branch,
        message: input.message,
        sha: input.expectedBlobSha,
      });
      const data = response.data;
      if (
        !isRecord(data) ||
        !isRecord(data.commit) ||
        typeof data.commit.sha !== "string" ||
        !OBJECT_ID_PATTERN.test(data.commit.sha)
      ) {
        throw invalidResponse("GitHub returned an invalid file deletion response.", true);
      }

      return { commitSha: data.commit.sha };
    } catch (error) {
      throw transportError(error, { mutation: true, now: this.#now });
    }
  }
}
