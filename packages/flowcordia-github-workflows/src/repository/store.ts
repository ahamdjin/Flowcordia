import {
  validateWorkflow,
  validateWorkflowIdentityTransition,
  type WorkflowDefinition,
  type WorkflowMigration,
} from "@flowcordia/workflow";

import {
  validateAccessScope,
  validateMutationContext,
  validateRevision,
  type GitHubWorkflowAccessScope,
} from "../access/scope.js";
import type {
  DeleteGitHubWorkflowInput,
  GitHubWorkflowDeleteValue,
  GitHubWorkflowReadValue,
  GitHubWorkflowSaveValue,
  GitHubWorkflowStoreOptions,
  GitHubWorkflowStoreResult,
  ReadGitHubWorkflowInput,
  SaveGitHubWorkflowInput,
} from "../types.js";
import type {
  GitHubFileResult,
  GitHubInstallationClientResolver,
  GitHubRepositoryClient,
} from "../transport/client.js";
import { GitHubTransportError } from "../transport/errors.js";
import { buildWorkflowCommitMessage } from "./commit-message.js";
import { DEFAULT_MAX_WORKFLOW_BYTES, decodeWorkflowFile, encodeWorkflow } from "./content.js";
import { buildWorkflowPath, isValidWorkflowId, normalizeWorkflowRoot } from "./path.js";
import { mutationAudit, workflowSource } from "./receipts.js";
import {
  executeReadWithRetry,
  normalizeReadRetryPolicy,
  type ReadRetryPolicy,
} from "./read-retry.js";
import {
  conflictError,
  invalidDocumentError,
  invalidInputError,
  transportStoreError,
} from "./store-errors.js";

const BLOB_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_CONFIGURED_WORKFLOW_BYTES = 1024 * 1024;

interface RepositorySnapshot {
  client: GitHubRepositoryClient;
  requestedRevision: string;
  commitSha: string;
  file: GitHubFileResult;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class GitHubWorkflowStore {
  readonly #clientResolver: GitHubInstallationClientResolver;
  readonly #migrations: readonly WorkflowMigration[];
  readonly #workflowRoot: string;
  readonly #maxWorkflowBytes: number;
  readonly #readRetry: ReadRetryPolicy;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #random: () => number;

  constructor(options: GitHubWorkflowStoreOptions) {
    if (!options?.clientResolver || typeof options.clientResolver.resolve !== "function") {
      throw new TypeError("GitHub workflow store requires an installation client resolver.");
    }
    if (options.sleep !== undefined && typeof options.sleep !== "function") {
      throw new TypeError("GitHub workflow store sleep option must be a function.");
    }
    if (options.random !== undefined && typeof options.random !== "function") {
      throw new TypeError("GitHub workflow store random option must be a function.");
    }

    const maxWorkflowBytes = options.maxWorkflowBytes ?? DEFAULT_MAX_WORKFLOW_BYTES;
    if (
      !Number.isSafeInteger(maxWorkflowBytes) ||
      maxWorkflowBytes < 1 ||
      maxWorkflowBytes > MAX_CONFIGURED_WORKFLOW_BYTES
    ) {
      throw new TypeError("Workflow byte limit must be between 1 and 1048576 bytes.");
    }

    this.#clientResolver = options.clientResolver;
    this.#migrations = options.migrations ?? [];
    this.#workflowRoot = normalizeWorkflowRoot(options.workflowRoot ?? ".flowcordia/workflows");
    this.#maxWorkflowBytes = maxWorkflowBytes;
    this.#readRetry = normalizeReadRetryPolicy(options.readRetry);
    this.#sleep = options.sleep ?? defaultSleep;
    this.#random = options.random ?? Math.random;
  }

  async #snapshot(
    scope: GitHubWorkflowAccessScope,
    path: string,
    revision: string
  ): Promise<RepositorySnapshot> {
    const client = await this.#clientResolver.resolve(scope);
    const resolved = await executeReadWithRetry(
      () => client.resolveRevision({ repository: scope.repository, revision }),
      this.#readRetry,
      this.#sleep,
      this.#random
    );
    if (!BLOB_SHA_PATTERN.test(resolved.commitSha)) {
      throw new GitHubTransportError("GitHub returned an invalid commit object ID.", {
        code: "invalid_response",
      });
    }
    const file = await executeReadWithRetry(
      () =>
        client.getFile({
          repository: scope.repository,
          path,
          commitSha: resolved.commitSha,
        }),
      this.#readRetry,
      this.#sleep,
      this.#random
    );
    if (
      file.found &&
      (!BLOB_SHA_PATTERN.test(file.blobSha) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        typeof file.contentBase64 !== "string")
    ) {
      throw new GitHubTransportError("GitHub returned invalid workflow file metadata.", {
        code: "invalid_response",
      });
    }

    return { client, requestedRevision: revision, commitSha: resolved.commitSha, file };
  }

  async read(
    input: ReadGitHubWorkflowInput
  ): Promise<GitHubWorkflowStoreResult<GitHubWorkflowReadValue>> {
    const operation = "read" as const;
    const scopeIssues = validateAccessScope(input?.scope);
    const workflowId = input?.workflowId;
    const revision = input?.revision ?? input?.scope?.repository?.branch;
    const inputIssues = [...scopeIssues];
    if (typeof workflowId !== "string" || !isValidWorkflowId(workflowId)) {
      inputIssues.push("Workflow ID has an invalid format.");
    }
    if (typeof revision !== "string") {
      inputIssues.push("GitHub revision is required.");
    } else {
      const revisionIssue = validateRevision(revision);
      if (revisionIssue) inputIssues.push(revisionIssue);
    }
    if (inputIssues.length > 0) {
      return { success: false, error: invalidInputError(operation, inputIssues) };
    }

    const scope = input.scope;
    const path = buildWorkflowPath(workflowId, this.#workflowRoot);
    try {
      const snapshot = await this.#snapshot(scope, path, revision);
      if (!snapshot.file.found) {
        return {
          success: false,
          error: {
            code: "not_found",
            operation,
            message: "Workflow was not found in the requested GitHub revision.",
            retryable: false,
            repository: scope.repository,
            path,
          },
        };
      }

      const decoded = decodeWorkflowFile(snapshot.file, {
        maxWorkflowBytes: this.#maxWorkflowBytes,
        migrations: this.#migrations,
      });
      if (!decoded.success) {
        return {
          success: false,
          error: invalidDocumentError(
            operation,
            decoded.message,
            scope.repository,
            path,
            decoded.issues
          ),
        };
      }

      return {
        success: true,
        value: {
          workflow: decoded.workflow,
          source: workflowSource({
            repository: scope.repository,
            path,
            requestedRevision: snapshot.requestedRevision,
            commitSha: snapshot.commitSha,
            blobSha: snapshot.file.blobSha,
            sourceSchemaVersion: decoded.sourceSchemaVersion,
          }),
          appliedMigrations: decoded.appliedMigrations,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: transportStoreError(error, operation, scope.repository, path),
      };
    }
  }

  async save(
    input: SaveGitHubWorkflowInput
  ): Promise<GitHubWorkflowStoreResult<GitHubWorkflowSaveValue>> {
    const operation = "save" as const;
    const scopeIssues = validateAccessScope(input?.scope);
    const mutationIssues = validateMutationContext(input?.mutation);
    const inputIssues = [...scopeIssues, ...mutationIssues];
    if (
      input?.expectedBlobSha !== null &&
      (typeof input?.expectedBlobSha !== "string" || !BLOB_SHA_PATTERN.test(input.expectedBlobSha))
    ) {
      inputIssues.push("Expected blob SHA must be null or a hexadecimal Git object ID.");
    }
    if (inputIssues.length > 0) {
      return { success: false, error: invalidInputError(operation, inputIssues) };
    }

    const validated = validateWorkflow(input.workflow);
    if (!validated.success) {
      return {
        success: false,
        error: {
          code: "invalid_document",
          operation,
          message: "Workflow does not satisfy the Flowcordia contract.",
          retryable: false,
          repository: input.scope.repository,
          workflowIssues: validated.issues,
        },
      };
    }

    const scope = input.scope;
    const workflow = validated.workflow;
    const path = buildWorkflowPath(workflow.id, this.#workflowRoot);
    const encoded = encodeWorkflow(workflow);
    if (encoded.byteLength > this.#maxWorkflowBytes) {
      return {
        success: false,
        error: invalidDocumentError(
          operation,
          `Workflow exceeds the ${this.#maxWorkflowBytes}-byte storage limit.`,
          scope.repository,
          path
        ),
      };
    }

    try {
      const snapshot = await this.#snapshot(scope, path, scope.repository.branch);
      const actualBlobSha = snapshot.file.found ? snapshot.file.blobSha : null;
      if (input.expectedBlobSha !== actualBlobSha) {
        return {
          success: false,
          error: conflictError(
            operation,
            scope.repository,
            path,
            input.expectedBlobSha,
            actualBlobSha
          ),
        };
      }

      let previousWorkflow: WorkflowDefinition | undefined;
      let previousText: string | undefined;
      if (snapshot.file.found) {
        const decoded = decodeWorkflowFile(snapshot.file, {
          maxWorkflowBytes: this.#maxWorkflowBytes,
          migrations: this.#migrations,
        });
        if (!decoded.success) {
          return {
            success: false,
            error: invalidDocumentError(
              operation,
              decoded.message,
              scope.repository,
              path,
              decoded.issues
            ),
          };
        }
        previousWorkflow = decoded.workflow;
        previousText = decoded.text;
      }

      if (previousWorkflow) {
        const identityIssues = validateWorkflowIdentityTransition(previousWorkflow, workflow);
        if (identityIssues.length > 0) {
          return {
            success: false,
            error: {
              code: "identity_conflict",
              operation,
              message: "Workflow edit reuses a stable node or edge ID for a different identity.",
              retryable: false,
              repository: scope.repository,
              path,
              workflowIssues: identityIssues,
            },
          };
        }
      }

      if (snapshot.file.found && previousText === encoded.text) {
        return {
          success: true,
          value: {
            workflow,
            source: workflowSource({
              repository: scope.repository,
              path,
              requestedRevision: snapshot.requestedRevision,
              commitSha: snapshot.commitSha,
              blobSha: snapshot.file.blobSha,
              sourceSchemaVersion: workflow.schemaVersion,
            }),
            previousBlobSha: snapshot.file.blobSha,
            noChange: true,
            audit: null,
          },
        };
      }

      const mutationOperation = snapshot.file.found ? "update" : "create";
      let mutation;
      try {
        mutation = await snapshot.client.putFile({
          repository: scope.repository,
          path,
          message: buildWorkflowCommitMessage(mutationOperation, workflow.id, input.mutation),
          contentBase64: encoded.contentBase64,
          expectedBlobSha: actualBlobSha,
        });
        if (
          !BLOB_SHA_PATTERN.test(mutation.commitSha) ||
          !BLOB_SHA_PATTERN.test(mutation.blobSha)
        ) {
          throw new GitHubTransportError("GitHub returned invalid mutation object IDs.", {
            code: "invalid_response",
            mutationMayHaveSucceeded: true,
          });
        }
      } catch (error) {
        return {
          success: false,
          error: transportStoreError(error, operation, scope.repository, path, true),
        };
      }

      const audit = mutationAudit({
        operation: mutationOperation,
        scope,
        path,
        actorId: input.mutation.actorId,
        correlationId: input.mutation.correlationId,
        previousBlobSha: actualBlobSha,
        blobSha: mutation.blobSha,
        commitSha: mutation.commitSha,
      });
      return {
        success: true,
        value: {
          workflow,
          source: workflowSource({
            repository: scope.repository,
            path,
            requestedRevision: scope.repository.branch,
            commitSha: mutation.commitSha,
            blobSha: mutation.blobSha,
            sourceSchemaVersion: workflow.schemaVersion,
          }),
          previousBlobSha: actualBlobSha,
          noChange: false,
          audit,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: transportStoreError(error, operation, scope.repository, path),
      };
    }
  }

  async delete(
    input: DeleteGitHubWorkflowInput
  ): Promise<GitHubWorkflowStoreResult<GitHubWorkflowDeleteValue>> {
    const operation = "delete" as const;
    const scopeIssues = validateAccessScope(input?.scope);
    const mutationIssues = validateMutationContext(input?.mutation);
    const inputIssues = [...scopeIssues, ...mutationIssues];
    if (typeof input?.workflowId !== "string" || !isValidWorkflowId(input.workflowId)) {
      inputIssues.push("Workflow ID has an invalid format.");
    }
    if (
      typeof input?.expectedBlobSha !== "string" ||
      !BLOB_SHA_PATTERN.test(input.expectedBlobSha)
    ) {
      inputIssues.push("Expected blob SHA must be a hexadecimal Git object ID.");
    }
    if (inputIssues.length > 0) {
      return { success: false, error: invalidInputError(operation, inputIssues) };
    }

    const scope = input.scope;
    const path = buildWorkflowPath(input.workflowId, this.#workflowRoot);
    try {
      const snapshot = await this.#snapshot(scope, path, scope.repository.branch);
      if (!snapshot.file.found) {
        return {
          success: false,
          error: {
            code: "not_found",
            operation,
            message: "Workflow was not found in the configured GitHub branch.",
            retryable: false,
            repository: scope.repository,
            path,
          },
        };
      }
      if (snapshot.file.blobSha !== input.expectedBlobSha) {
        return {
          success: false,
          error: conflictError(
            operation,
            scope.repository,
            path,
            input.expectedBlobSha,
            snapshot.file.blobSha
          ),
        };
      }

      let deletion;
      try {
        deletion = await snapshot.client.deleteFile({
          repository: scope.repository,
          path,
          message: buildWorkflowCommitMessage("delete", input.workflowId, input.mutation),
          expectedBlobSha: input.expectedBlobSha,
        });
        if (!BLOB_SHA_PATTERN.test(deletion.commitSha)) {
          throw new GitHubTransportError("GitHub returned an invalid deletion commit ID.", {
            code: "invalid_response",
            mutationMayHaveSucceeded: true,
          });
        }
      } catch (error) {
        return {
          success: false,
          error: transportStoreError(error, operation, scope.repository, path, true),
        };
      }

      const audit = mutationAudit({
        operation: "delete",
        scope,
        path,
        actorId: input.mutation.actorId,
        correlationId: input.mutation.correlationId,
        previousBlobSha: input.expectedBlobSha,
        blobSha: null,
        commitSha: deletion.commitSha,
      });
      return {
        success: true,
        value: {
          repository: scope.repository,
          path,
          previousBlobSha: input.expectedBlobSha,
          commitSha: deletion.commitSha,
          audit,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: transportStoreError(error, operation, scope.repository, path),
      };
    }
  }
}
