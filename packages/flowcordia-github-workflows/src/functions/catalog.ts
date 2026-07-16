import { parseWorkflowFunctionCatalog, type WorkflowFunctionCatalog } from "@flowcordia/workflow";

import {
  validateAccessScope,
  validateRevision,
  type GitHubWorkflowAccessScope,
} from "../access/scope.js";
import { invalidInputError, transportStoreError } from "../repository/store-errors.js";
import type { GitHubInstallationClientResolver } from "../transport/client.js";
import type { GitHubWorkflowStoreError, GitHubWorkflowStoreResult } from "../types.js";

export const FLOWCORDIA_FUNCTION_CATALOG_PATH = ".flowcordia/functions.json";
export const DEFAULT_MAX_FUNCTION_CATALOG_BYTES = 256 * 1024;

export interface GitHubFunctionCatalogSource {
  path: typeof FLOWCORDIA_FUNCTION_CATALOG_PATH;
  requestedRevision: string;
  commitSha: string;
  blobSha: string;
}

export interface GitHubFunctionCatalogReadValue {
  catalog: WorkflowFunctionCatalog;
  source: GitHubFunctionCatalogSource;
}

export interface ReadGitHubFunctionCatalogInput {
  scope: GitHubWorkflowAccessScope;
  revision: string;
}

export interface GitHubFunctionCatalogStoreOptions {
  clientResolver: GitHubInstallationClientResolver;
  maxBytes?: number;
}

function decodeCatalogFile(file: {
  size: number;
  contentBase64: string;
}): { success: true; text: string } | { success: false; message: string } {
  const base64 = file.contentBase64.replace(/[\r\n\t ]/g, "");
  const expectedEncodedLength = Math.ceil(file.size / 3) * 4;
  if (
    base64.length === 0 ||
    base64.length !== expectedEncodedLength ||
    base64.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  ) {
    return { success: false, message: "GitHub returned malformed function catalog content." };
  }
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length !== file.size) {
      return {
        success: false,
        message: "GitHub function catalog size metadata did not match its content.",
      };
    }
    return {
      success: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { success: false, message: "GitHub function catalog content was not valid UTF-8." };
  }
}

function catalogError(
  error: Omit<GitHubWorkflowStoreError, "operation">
): GitHubWorkflowStoreError {
  return { ...error, operation: "read_function_catalog" };
}

export class GitHubFunctionCatalogStore {
  readonly #clientResolver: GitHubInstallationClientResolver;
  readonly #maxBytes: number;

  constructor(options: GitHubFunctionCatalogStoreOptions) {
    this.#clientResolver = options.clientResolver;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_FUNCTION_CATALOG_BYTES;
    if (!Number.isSafeInteger(this.#maxBytes) || this.#maxBytes <= 0) {
      throw new RangeError("Function catalog byte limit must be a positive safe integer.");
    }
  }

  async read(
    input: ReadGitHubFunctionCatalogInput
  ): Promise<GitHubWorkflowStoreResult<GitHubFunctionCatalogReadValue>> {
    const inputIssues = validateAccessScope(input.scope);
    if (typeof input.revision !== "string") {
      inputIssues.push("Function catalog revision is required.");
    } else {
      const revisionIssue = validateRevision(input.revision);
      if (revisionIssue) inputIssues.push(revisionIssue);
    }
    if (inputIssues.length > 0) {
      return {
        success: false,
        error: invalidInputError(
          "read_function_catalog",
          inputIssues,
          input.scope?.repository,
          FLOWCORDIA_FUNCTION_CATALOG_PATH
        ),
      };
    }

    const repository = input.scope.repository;
    try {
      const client = await this.#clientResolver.resolve(input.scope);
      const resolved = await client.resolveRevision({ repository, revision: input.revision });
      const file = await client.getFile({
        repository,
        path: FLOWCORDIA_FUNCTION_CATALOG_PATH,
        commitSha: resolved.commitSha,
      });
      if (!file.found) {
        return {
          success: false,
          error: catalogError({
            code: "not_found",
            message: "The repository does not define a Flowcordia function catalog.",
            retryable: false,
            repository,
            path: FLOWCORDIA_FUNCTION_CATALOG_PATH,
          }),
        };
      }
      if (file.size > this.#maxBytes) {
        return {
          success: false,
          error: catalogError({
            code: "invalid_document",
            message: `Function catalog exceeds the ${this.#maxBytes}-byte limit.`,
            retryable: false,
            repository,
            path: FLOWCORDIA_FUNCTION_CATALOG_PATH,
          }),
        };
      }
      const decoded = decodeCatalogFile(file);
      if (!decoded.success) {
        return {
          success: false,
          error: catalogError({
            code: "invalid_document",
            message: decoded.message,
            retryable: false,
            repository,
            path: FLOWCORDIA_FUNCTION_CATALOG_PATH,
          }),
        };
      }
      const parsed = parseWorkflowFunctionCatalog(decoded.text);
      if (!parsed.success) {
        return {
          success: false,
          error: catalogError({
            code: "invalid_document",
            message: "The repository function catalog does not satisfy the Flowcordia contract.",
            retryable: false,
            repository,
            path: FLOWCORDIA_FUNCTION_CATALOG_PATH,
            catalogIssues: parsed.issues,
          }),
        };
      }
      return {
        success: true,
        value: {
          catalog: parsed.catalog,
          source: {
            path: FLOWCORDIA_FUNCTION_CATALOG_PATH,
            requestedRevision: input.revision,
            commitSha: resolved.commitSha,
            blobSha: file.blobSha,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: transportStoreError(
          error,
          "read_function_catalog",
          repository,
          FLOWCORDIA_FUNCTION_CATALOG_PATH
        ),
      };
    }
  }
}
