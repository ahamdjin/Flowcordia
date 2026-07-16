import type { GitHubRepositoryTarget } from "../access/scope.js";
import type {
  GitHubWorkflowDiscoveryClient,
  GitHubWorkflowTreeResult,
} from "../discovery/types.js";
import { GitHubTransportError } from "./errors.js";
import { OctokitGitHubRepositoryClient, type FlowcordiaOctokitLike } from "./octokit-adapter.js";

type UnknownRecord = Record<string, unknown>;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

interface OctokitResponse<T> {
  data: T;
}

export interface FlowcordiaWorkflowDiscoveryOctokitLike extends FlowcordiaOctokitLike {
  rest: FlowcordiaOctokitLike["rest"] & {
    git: {
      getTree(input: {
        owner: string;
        repo: string;
        tree_sha: string;
        recursive: "true";
      }): Promise<OctokitResponse<unknown>>;
    };
  };
}

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function statusFromError(error: unknown): number | undefined {
  const value = record(error);
  if (typeof value?.status === "number") return value.status;
  const response = record(value?.response);
  return typeof response?.status === "number" ? response.status : undefined;
}

function headersFromError(error: unknown): UnknownRecord {
  const response = record(record(error)?.response);
  return record(response?.headers) ?? {};
}

function header(headers: UnknownRecord, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function transportError(error: unknown): GitHubTransportError {
  if (error instanceof GitHubTransportError) return error;
  const status = statusFromError(error);
  const headers = headersFromError(error);
  const remaining = header(headers, "x-ratelimit-remaining");
  const limited = status === 429 || (status === 403 && remaining === "0");
  const retryAfter = Number(header(headers, "retry-after"));
  return new GitHubTransportError(
    limited ? "GitHub rate limit was exceeded." : "GitHub tree request failed.",
    {
      code: limited ? "rate_limited" : status === undefined ? "network_error" : "http_error",
      status,
      requestId: header(headers, "x-github-request-id"),
      retryAfterMs:
        limited && Number.isFinite(retryAfter) ? Math.max(0, retryAfter * 1000) : undefined,
    }
  );
}

function repositoryParameters(repository: GitHubRepositoryTarget) {
  return { owner: repository.owner, repo: repository.name };
}

export class OctokitGitHubWorkflowDiscoveryClient implements GitHubWorkflowDiscoveryClient {
  readonly #octokit: FlowcordiaWorkflowDiscoveryOctokitLike;
  readonly #repositoryClient: OctokitGitHubRepositoryClient;

  constructor(octokit: FlowcordiaWorkflowDiscoveryOctokitLike) {
    this.#octokit = octokit;
    this.#repositoryClient = new OctokitGitHubRepositoryClient(octokit);
  }

  resolveRevision(input: {
    repository: GitHubRepositoryTarget;
    revision: string;
  }): Promise<{ commitSha: string }> {
    return this.#repositoryClient.resolveRevision(input);
  }

  async listTree(input: {
    repository: GitHubRepositoryTarget;
    commitSha: string;
  }): Promise<GitHubWorkflowTreeResult> {
    try {
      const response = await this.#octokit.rest.git.getTree({
        ...repositoryParameters(input.repository),
        tree_sha: input.commitSha,
        recursive: "true",
      });
      const data = record(response.data);
      if (
        !data ||
        typeof data.sha !== "string" ||
        !OBJECT_ID_PATTERN.test(data.sha) ||
        typeof data.truncated !== "boolean" ||
        !Array.isArray(data.tree)
      ) {
        throw new GitHubTransportError("GitHub returned an invalid tree response.", {
          code: "invalid_response",
        });
      }

      const entries = data.tree.flatMap((item) => {
        const entry = record(item);
        if (entry?.type !== "blob") return [];
        if (
          typeof entry.path !== "string" ||
          entry.path.length < 1 ||
          entry.path.length > 4096 ||
          entry.path.includes("\0") ||
          typeof entry.sha !== "string" ||
          !OBJECT_ID_PATTERN.test(entry.sha) ||
          (entry.size !== undefined &&
            (typeof entry.size !== "number" || !Number.isSafeInteger(entry.size) || entry.size < 0))
        ) {
          throw new GitHubTransportError("GitHub returned an invalid tree entry.", {
            code: "invalid_response",
          });
        }
        return [
          {
            path: entry.path,
            blobSha: entry.sha,
            size: typeof entry.size === "number" ? entry.size : null,
          },
        ];
      });

      // GitHub returns the tree object's SHA in data.sha. The catalog identity remains the
      // immutable commit SHA supplied to this read; callers must never compare a tree SHA to it.
      return {
        commitSha: input.commitSha,
        entries,
        truncated: data.truncated,
      };
    } catch (error) {
      throw transportError(error);
    }
  }
}
