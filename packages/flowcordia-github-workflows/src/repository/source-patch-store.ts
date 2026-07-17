import {
  validateAccessScope,
  validateMutationContext,
  validateRevision,
  type GitHubWorkflowAccessScope,
  type GitHubWorkflowMutationContext,
} from "../access/scope.js";
import type {
  GitHubFileResult,
  GitHubInstallationClientResolver,
  GitHubRepositoryClient,
} from "../transport/client.js";
import { GitHubTransportError } from "../transport/errors.js";
import type { GitHubWorkflowStoreError, GitHubWorkflowStoreResult } from "../types.js";
import {
  MAX_GITHUB_SOURCE_PATCH_BYTES,
  validateGitHubRepositorySourcePath,
  validateGitHubRepositorySourcePatches,
  type GitHubRepositorySourcePatch,
} from "./source-patch.js";

const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export interface GitHubRepositorySourceFile {
  path: string;
  sourceText: string;
  requestedRevision: string;
  commitSha: string;
  blobSha: string;
}

export interface GitHubRepositorySourcePatchSaveValue extends GitHubRepositorySourceFile {
  previousBlobSha: string | null;
  noChange: boolean;
}

export interface ReadGitHubRepositorySourceFileInput {
  scope: GitHubWorkflowAccessScope;
  path: string;
  revision?: string;
}

export interface SaveGitHubRepositorySourcePatchInput {
  scope: GitHubWorkflowAccessScope;
  patch: GitHubRepositorySourcePatch;
  mutation: GitHubWorkflowMutationContext;
}

export interface GitHubRepositorySourcePatchStoreOptions {
  clientResolver: GitHubInstallationClientResolver;
}

function encodeText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return btoa(chunks.join(""));
}

function decodeText(file: Extract<GitHubFileResult, { found: true }>): string | null {
  if (file.size > MAX_GITHUB_SOURCE_PATCH_BYTES) return null;
  try {
    const base64 = file.contentBase64.replace(/[\r\n\t ]/g, "");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    if (bytes.length !== file.size) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function inputError(
  operation: GitHubWorkflowStoreError["operation"],
  issues: string[]
): GitHubWorkflowStoreResult<never> {
  return {
    success: false,
    error: {
      code: "invalid_input",
      operation,
      message: "Repository source patch input is invalid.",
      retryable: false,
      inputIssues: issues,
    },
  };
}

function invalidDocument(
  operation: GitHubWorkflowStoreError["operation"],
  scope: GitHubWorkflowAccessScope,
  path: string
): GitHubWorkflowStoreResult<never> {
  return {
    success: false,
    error: {
      code: "invalid_document",
      operation,
      message: "Repository source file is not bounded UTF-8 text.",
      retryable: false,
      repository: scope.repository,
      path,
    },
  };
}

function transportError(
  error: unknown,
  operation: GitHubWorkflowStoreError["operation"],
  scope: GitHubWorkflowAccessScope,
  path: string,
  mutation: boolean
): GitHubWorkflowStoreResult<never> {
  const transport = error instanceof GitHubTransportError ? error : undefined;
  return {
    success: false,
    error: {
      code:
        transport?.status === 403
          ? "access_denied"
          : transport?.status === 404
            ? "not_found"
            : transport?.status === 409 || transport?.status === 422
              ? "conflict"
              : mutation && transport?.mutationMayHaveSucceeded
                ? "ambiguous_write"
                : transport?.status === 429
                  ? "rate_limited"
                  : "unavailable",
      operation,
      message: mutation
        ? "Repository source patch could not be stored safely."
        : "Repository source file could not be read safely.",
      retryable:
        transport?.status === 429 ||
        transport?.status === 408 ||
        transport?.status === undefined ||
        transport.status >= 500,
      repository: scope.repository,
      path,
      requestId: transport?.requestId,
      retryAfterMs: transport?.retryAfterMs,
    },
  };
}

export class GitHubRepositorySourcePatchStore {
  readonly #clientResolver: GitHubInstallationClientResolver;

  constructor(options: GitHubRepositorySourcePatchStoreOptions) {
    if (!options?.clientResolver || typeof options.clientResolver.resolve !== "function") {
      throw new TypeError("GitHub source patch store requires an installation client resolver.");
    }
    this.#clientResolver = options.clientResolver;
  }

  async #resolve(
    scope: GitHubWorkflowAccessScope,
    path: string,
    revision: string
  ): Promise<{ client: GitHubRepositoryClient; commitSha: string; file: GitHubFileResult }> {
    const client = await this.#clientResolver.resolve(scope);
    const resolved = await client.resolveRevision({ repository: scope.repository, revision });
    if (!OBJECT_ID_PATTERN.test(resolved.commitSha)) {
      throw new GitHubTransportError("GitHub returned an invalid commit object ID.", {
        code: "invalid_response",
      });
    }
    const file = await client.getFile({
      repository: scope.repository,
      path,
      commitSha: resolved.commitSha,
    });
    if (
      file.found &&
      (!OBJECT_ID_PATTERN.test(file.blobSha) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        typeof file.contentBase64 !== "string")
    ) {
      throw new GitHubTransportError("GitHub returned invalid source-file metadata.", {
        code: "invalid_response",
      });
    }
    return { client, commitSha: resolved.commitSha, file };
  }

  async read(
    input: ReadGitHubRepositorySourceFileInput
  ): Promise<GitHubWorkflowStoreResult<GitHubRepositorySourceFile>> {
    const operation = "read_source" as const;
    const revision = input?.revision ?? input?.scope?.repository?.branch;
    const issues = [...validateAccessScope(input?.scope)];
    if (typeof input?.path !== "string") issues.push("Source path is required.");
    else {
      const pathValidation = validateGitHubRepositorySourcePath(input.path);
      if (!pathValidation.success) issues.push(pathValidation.issue.message);
    }
    if (typeof revision !== "string") issues.push("GitHub revision is required.");
    else {
      const issue = validateRevision(revision);
      if (issue) issues.push(issue);
    }
    if (issues.length > 0) return inputError(operation, issues);

    try {
      const snapshot = await this.#resolve(input.scope, input.path, revision);
      if (!snapshot.file.found) {
        return {
          success: false,
          error: {
            code: "not_found",
            operation,
            message: "Repository source file was not found.",
            retryable: false,
            repository: input.scope.repository,
            path: input.path,
          },
        };
      }
      const sourceText = decodeText(snapshot.file);
      if (sourceText === null) return invalidDocument(operation, input.scope, input.path);
      return {
        success: true,
        value: {
          path: input.path,
          sourceText,
          requestedRevision: revision,
          commitSha: snapshot.commitSha,
          blobSha: snapshot.file.blobSha,
        },
      };
    } catch (error) {
      return transportError(error, operation, input.scope, input.path, false);
    }
  }

  async save(
    input: SaveGitHubRepositorySourcePatchInput
  ): Promise<GitHubWorkflowStoreResult<GitHubRepositorySourcePatchSaveValue>> {
    const operation = "save_source" as const;
    const issues = [
      ...validateAccessScope(input?.scope),
      ...validateMutationContext(input?.mutation),
    ];
    const validated = validateGitHubRepositorySourcePatches([input?.patch]);
    if (!validated.success) {
      return inputError(operation, [
        ...issues,
        ...validated.issues.map((issue) => issue.message),
      ]);
    }
    if (issues.length > 0) return inputError(operation, issues);
    const patch = validated.patches[0];
    if (!patch) return inputError(operation, ["A source patch is required."]);

    try {
      const snapshot = await this.#resolve(
        input.scope,
        patch.path,
        input.scope.repository.branch
      );
      const actualBlobSha = snapshot.file.found ? snapshot.file.blobSha : null;
      if (actualBlobSha !== patch.expectedBlobSha) {
        return {
          success: false,
          error: {
            code: "conflict",
            operation,
            message: "Repository source file changed before the patch could be stored.",
            retryable: false,
            repository: input.scope.repository,
            path: patch.path,
            expectedBlobSha: patch.expectedBlobSha,
            actualBlobSha,
          },
        };
      }
      if (snapshot.file.found) {
        const currentText = decodeText(snapshot.file);
        if (currentText === null) return invalidDocument(operation, input.scope, patch.path);
        if (currentText === patch.sourceText) {
          return {
            success: true,
            value: {
              path: patch.path,
              sourceText: patch.sourceText,
              requestedRevision: snapshot.commitSha,
              commitSha: snapshot.commitSha,
              blobSha: snapshot.file.blobSha,
              previousBlobSha: actualBlobSha,
              noChange: true,
            },
          };
        }
      }
      const mutation = await snapshot.client.putFile({
        repository: input.scope.repository,
        path: patch.path,
        message: `flowcordia: update ${patch.path} [actor:${input.mutation.actorId}] [correlation:${input.mutation.correlationId}]`,
        contentBase64: encodeText(patch.sourceText),
        expectedBlobSha: patch.expectedBlobSha,
      });
      return {
        success: true,
        value: {
          path: patch.path,
          sourceText: patch.sourceText,
          requestedRevision: input.scope.repository.branch,
          commitSha: mutation.commitSha,
          blobSha: mutation.blobSha,
          previousBlobSha: actualBlobSha,
          noChange: false,
        },
      };
    } catch (error) {
      return transportError(error, operation, input.scope, patch.path, true);
    }
  }
}
