import {
  validateAccessScope,
  validateMutationContext,
  validateRevision,
  GitHubTransportError,
  type GitHubInstallationClientResolver,
  type GitHubWorkflowAccessScope,
  type GitHubWorkflowMutationContext,
} from "@flowcordia/github-workflows";
import { isValidProposalId } from "../branch/naming.js";
import {
  flowcordiaProposalClosureManifestEquals,
  flowcordiaProposalClosureManifestPath,
  parseFlowcordiaProposalClosureManifest,
  serializeFlowcordiaProposalClosureManifest,
  type FlowcordiaProposalClosureManifest,
} from "./workflow-closure.js";

const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_CLOSURE_MANIFEST_BYTES = 256 * 1024;

export type GitHubProposalClosureStoreErrorCode =
  | "invalid_input"
  | "invalid_document"
  | "not_found"
  | "conflict"
  | "access_denied"
  | "rate_limited"
  | "unavailable"
  | "ambiguous_write";

export interface GitHubProposalClosureStoreError {
  code: GitHubProposalClosureStoreErrorCode;
  message: string;
  retryable: boolean;
  requestId?: string;
  retryAfterMs?: number;
}

export type GitHubProposalClosureStoreResult<T> =
  | { success: true; value: T }
  | { success: false; error: GitHubProposalClosureStoreError };

export interface GitHubProposalClosureDocument {
  manifest: FlowcordiaProposalClosureManifest;
  path: string;
  requestedRevision: string;
  commitSha: string;
  blobSha: string;
}

export interface GitHubProposalClosureSaveValue extends GitHubProposalClosureDocument {
  noChange: boolean;
}

export interface GitHubProposalWorkflowClosureStoreOptions {
  clientResolver: GitHubInstallationClientResolver;
}

function encodeText(text: string): { contentBase64: string; byteLength: number } {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return { contentBase64: btoa(chunks.join("")), byteLength: bytes.length };
}

function decodeText(input: { contentBase64: string; size: number }): string | null {
  if (input.size < 1 || input.size > MAX_CLOSURE_MANIFEST_BYTES) return null;
  try {
    const base64 = input.contentBase64.replace(/[\r\n\t ]/g, "");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    if (bytes.length !== input.size) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function invalidInput(issues: string[]): GitHubProposalClosureStoreResult<never> {
  return {
    success: false,
    error: {
      code: "invalid_input",
      message: `Proposal closure store input is invalid: ${issues.join(" ")}`,
      retryable: false,
    },
  };
}

function transportError(
  error: unknown,
  mutation: boolean
): GitHubProposalClosureStoreResult<never> {
  const transport = error instanceof GitHubTransportError ? error : undefined;
  const code: GitHubProposalClosureStoreErrorCode =
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
              : "unavailable";
  return {
    success: false,
    error: {
      code,
      message: mutation
        ? "Proposal closure manifest could not be stored safely."
        : "Proposal closure manifest could not be read safely.",
      retryable:
        code === "rate_limited" ||
        transport?.status === 408 ||
        transport?.status === undefined ||
        (transport.status !== undefined && transport.status >= 500),
      requestId: transport?.requestId,
      retryAfterMs: transport?.retryAfterMs,
    },
  };
}

export class GitHubProposalWorkflowClosureStore {
  readonly #clientResolver: GitHubInstallationClientResolver;

  constructor(options: GitHubProposalWorkflowClosureStoreOptions) {
    if (!options?.clientResolver || typeof options.clientResolver.resolve !== "function") {
      throw new TypeError("Proposal closure store requires an installation client resolver.");
    }
    this.#clientResolver = options.clientResolver;
  }

  async read(input: {
    scope: GitHubWorkflowAccessScope;
    proposalId: string;
    revision?: string;
  }): Promise<GitHubProposalClosureStoreResult<GitHubProposalClosureDocument>> {
    const revision = input?.revision ?? input?.scope?.repository?.branch;
    const issues = [...validateAccessScope(input?.scope)];
    if (typeof input?.proposalId !== "string" || !isValidProposalId(input.proposalId)) {
      issues.push("Proposal ID has an invalid format.");
    }
    if (typeof revision !== "string") issues.push("GitHub revision is required.");
    else {
      const revisionIssue = validateRevision(revision);
      if (revisionIssue) issues.push(revisionIssue);
    }
    if (issues.length > 0) return invalidInput(issues);

    const path = flowcordiaProposalClosureManifestPath(input.proposalId);
    try {
      const client = await this.#clientResolver.resolve(input.scope);
      const resolved = await client.resolveRevision({
        repository: input.scope.repository,
        revision,
      });
      if (!OBJECT_ID_PATTERN.test(resolved.commitSha)) {
        throw new GitHubTransportError("GitHub returned an invalid closure revision.", {
          code: "invalid_response",
        });
      }
      const file = await client.getFile({
        repository: input.scope.repository,
        path,
        commitSha: resolved.commitSha,
      });
      if (!file.found) {
        return {
          success: false,
          error: {
            code: "not_found",
            message: "Proposal closure manifest was not found.",
            retryable: false,
          },
        };
      }
      if (
        !OBJECT_ID_PATTERN.test(file.blobSha) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0
      ) {
        throw new GitHubTransportError("GitHub returned invalid closure file metadata.", {
          code: "invalid_response",
        });
      }
      const sourceText = decodeText(file);
      if (sourceText === null) {
        return {
          success: false,
          error: {
            code: "invalid_document",
            message: "Proposal closure manifest is not bounded UTF-8 text.",
            retryable: false,
          },
        };
      }
      const parsed = parseFlowcordiaProposalClosureManifest(sourceText);
      if (!parsed.success) {
        return {
          success: false,
          error: {
            code: "invalid_document",
            message: parsed.message,
            retryable: false,
          },
        };
      }
      return {
        success: true,
        value: {
          manifest: parsed.manifest,
          path,
          requestedRevision: revision,
          commitSha: resolved.commitSha,
          blobSha: file.blobSha,
        },
      };
    } catch (error) {
      return transportError(error, false);
    }
  }

  async save(input: {
    scope: GitHubWorkflowAccessScope;
    proposalId: string;
    manifest: FlowcordiaProposalClosureManifest;
    mutation: GitHubWorkflowMutationContext;
  }): Promise<GitHubProposalClosureStoreResult<GitHubProposalClosureSaveValue>> {
    const issues = [
      ...validateAccessScope(input?.scope),
      ...validateMutationContext(input?.mutation),
    ];
    if (typeof input?.proposalId !== "string" || !isValidProposalId(input.proposalId)) {
      issues.push("Proposal ID has an invalid format.");
    }
    const parsed = parseFlowcordiaProposalClosureManifest(
      serializeFlowcordiaProposalClosureManifest(input?.manifest)
    );
    if (!parsed.success) issues.push(parsed.message);
    if (issues.length > 0) return invalidInput(issues);

    const path = flowcordiaProposalClosureManifestPath(input.proposalId);
    const sourceText = serializeFlowcordiaProposalClosureManifest(input.manifest);
    const encoded = encodeText(sourceText);
    if (encoded.byteLength > MAX_CLOSURE_MANIFEST_BYTES) {
      return invalidInput(["Proposal closure manifest exceeds the byte limit."]);
    }

    try {
      const client = await this.#clientResolver.resolve(input.scope);
      const resolved = await client.resolveRevision({
        repository: input.scope.repository,
        revision: input.scope.repository.branch,
      });
      const current = await client.getFile({
        repository: input.scope.repository,
        path,
        commitSha: resolved.commitSha,
      });
      if (current.found) {
        const currentText = decodeText(current);
        if (currentText === null) {
          return {
            success: false,
            error: {
              code: "invalid_document",
              message: "Existing proposal closure manifest is invalid.",
              retryable: false,
            },
          };
        }
        const currentManifest = parseFlowcordiaProposalClosureManifest(currentText);
        if (!currentManifest.success) {
          return {
            success: false,
            error: {
              code: "invalid_document",
              message: currentManifest.message,
              retryable: false,
            },
          };
        }
        if (!flowcordiaProposalClosureManifestEquals(currentManifest.manifest, input.manifest)) {
          return {
            success: false,
            error: {
              code: "conflict",
              message: "Proposal closure membership is immutable after branch preparation.",
              retryable: false,
            },
          };
        }
        return {
          success: true,
          value: {
            manifest: currentManifest.manifest,
            path,
            requestedRevision: input.scope.repository.branch,
            commitSha: resolved.commitSha,
            blobSha: current.blobSha,
            noChange: true,
          },
        };
      }
      const saved = await client.putFile({
        repository: input.scope.repository,
        path,
        message: `flowcordia: lock proposal closure ${input.proposalId} [actor:${input.mutation.actorId}] [correlation:${input.mutation.correlationId}]`,
        contentBase64: encoded.contentBase64,
        expectedBlobSha: null,
      });
      return {
        success: true,
        value: {
          manifest: input.manifest,
          path,
          requestedRevision: input.scope.repository.branch,
          commitSha: saved.commitSha,
          blobSha: saved.blobSha,
          noChange: false,
        },
      };
    } catch (error) {
      return transportError(error, true);
    }
  }
}
