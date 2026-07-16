import {
  validateAccessScope,
  validateRevision,
  type GitHubWorkflowAccessScope,
} from "../access/scope.js";
import { isValidWorkflowId, normalizeWorkflowRoot } from "../repository/path.js";
import { GitHubTransportError } from "../transport/errors.js";
import type {
  GitHubWorkflowDiscoveryClientResolver,
  GitHubWorkflowDiscoveryError,
  GitHubWorkflowDiscoveryResult,
} from "./types.js";

const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DEFAULT_MAX_ENTRIES = 500;
const MAX_CONFIGURED_ENTRIES = 5_000;

export interface GitHubWorkflowCatalogOptions {
  clientResolver: GitHubWorkflowDiscoveryClientResolver;
  workflowRoot?: string;
  maxEntries?: number;
}

function discoveryError(error: unknown): GitHubWorkflowDiscoveryError {
  if (!(error instanceof GitHubTransportError)) {
    return {
      code: "unavailable",
      message: "GitHub workflow discovery is temporarily unavailable.",
      retryable: true,
    };
  }

  if (error.code === "rate_limited") {
    return {
      code: "rate_limited",
      message: "GitHub workflow discovery was rate limited.",
      retryable: true,
      requestId: error.requestId,
      retryAfterMs: error.retryAfterMs,
    };
  }
  if (error.status === 401 || error.status === 403) {
    return {
      code: "access_denied",
      message: "The GitHub App cannot read the connected repository.",
      retryable: false,
      requestId: error.requestId,
    };
  }
  if (error.status === 404) {
    return {
      code: "not_found",
      message: "The connected repository or revision was not found.",
      retryable: false,
      requestId: error.requestId,
    };
  }
  if (error.code === "invalid_response") {
    return {
      code: "invalid_response",
      message: "GitHub returned an invalid workflow discovery response.",
      retryable: false,
      requestId: error.requestId,
    };
  }
  return {
    code: "unavailable",
    message: "GitHub workflow discovery is temporarily unavailable.",
    retryable: true,
    requestId: error.requestId,
  };
}

export class GitHubWorkflowCatalog {
  readonly #clientResolver: GitHubWorkflowDiscoveryClientResolver;
  readonly #workflowRoot: string;
  readonly #maxEntries: number;

  constructor(options: GitHubWorkflowCatalogOptions) {
    if (!options?.clientResolver || typeof options.clientResolver.resolve !== "function") {
      throw new TypeError("GitHub workflow catalog requires an installation client resolver.");
    }
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    if (
      !Number.isSafeInteger(maxEntries) ||
      maxEntries < 1 ||
      maxEntries > MAX_CONFIGURED_ENTRIES
    ) {
      throw new TypeError("Workflow catalog limit must be between 1 and 5000 entries.");
    }
    this.#clientResolver = options.clientResolver;
    this.#workflowRoot = normalizeWorkflowRoot(options.workflowRoot ?? ".flowcordia/workflows");
    this.#maxEntries = maxEntries;
  }

  async discover(input: {
    scope: GitHubWorkflowAccessScope;
    revision?: string;
  }): Promise<GitHubWorkflowDiscoveryResult> {
    const issues = validateAccessScope(input?.scope);
    const revision = input?.revision ?? input?.scope?.repository?.branch;
    if (typeof revision !== "string") {
      issues.push("GitHub revision is required.");
      return {
        success: false,
        error: {
          code: "invalid_input",
          message: "Workflow discovery input is invalid.",
          retryable: false,
        },
      };
    }

    const revisionIssue = validateRevision(revision);
    if (revisionIssue) issues.push(revisionIssue);
    if (issues.length > 0) {
      return {
        success: false,
        error: {
          code: "invalid_input",
          message: "Workflow discovery input is invalid.",
          retryable: false,
        },
      };
    }

    const scope = input.scope;
    try {
      const client = await this.#clientResolver.resolve(scope);
      const resolved = await client.resolveRevision({
        repository: scope.repository,
        revision,
      });
      if (!OBJECT_ID_PATTERN.test(resolved.commitSha)) {
        return {
          success: false,
          error: {
            code: "invalid_response",
            message: "GitHub returned an invalid resolved commit.",
            retryable: false,
          },
        };
      }
      const tree = await client.listTree({
        repository: scope.repository,
        commitSha: resolved.commitSha,
      });
      if (tree.commitSha !== resolved.commitSha || !OBJECT_ID_PATTERN.test(tree.commitSha)) {
        return {
          success: false,
          error: {
            code: "invalid_response",
            message: "GitHub returned a tree for a different commit.",
            retryable: false,
          },
        };
      }
      if (tree.truncated) {
        return {
          success: false,
          error: {
            code: "truncated_tree",
            message: "GitHub truncated the repository tree; the workflow index was not changed.",
            retryable: true,
          },
        };
      }

      const prefix = `${this.#workflowRoot}/`;
      const entries = tree.entries
        .filter((entry) => entry.path.startsWith(prefix) && entry.path.endsWith(".json"))
        .flatMap((entry) => {
          const relative = entry.path.slice(prefix.length);
          if (relative.includes("/")) return [];
          const workflowId = relative.slice(0, -".json".length);
          if (!isValidWorkflowId(workflowId)) return [];
          return [{ ...entry, workflowId }];
        })
        .sort((left, right) => left.path.localeCompare(right.path));

      if (entries.length > this.#maxEntries) {
        return {
          success: false,
          error: {
            code: "catalog_limit_exceeded",
            message: `The repository contains more than ${this.#maxEntries} Flowcordia workflows.`,
            retryable: false,
          },
        };
      }

      return {
        success: true,
        value: {
          repository: { ...scope.repository },
          requestedRevision: revision,
          commitSha: resolved.commitSha,
          workflowRoot: this.#workflowRoot,
          entries,
        },
      };
    } catch (error) {
      return { success: false, error: discoveryError(error) };
    }
  }
}
