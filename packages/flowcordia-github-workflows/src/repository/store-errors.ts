import type { WorkflowIssue } from "@flowcordia/workflow";

import type { GitHubRepositoryTarget } from "../access/scope.js";
import type { GitHubWorkflowStoreError, GitHubWorkflowStoreOperation } from "../types.js";
import { GitHubTransportError } from "../transport/errors.js";

export function invalidInputError(
  operation: GitHubWorkflowStoreOperation,
  issues: string[],
  repository?: GitHubRepositoryTarget,
  path?: string
): GitHubWorkflowStoreError {
  return {
    code: "invalid_input",
    operation,
    message: "GitHub workflow operation input is invalid.",
    retryable: false,
    repository,
    path,
    inputIssues: issues,
  };
}

export function invalidDocumentError(
  operation: GitHubWorkflowStoreOperation,
  message: string,
  repository: GitHubRepositoryTarget,
  path: string,
  issues?: WorkflowIssue[]
): GitHubWorkflowStoreError {
  return {
    code: "invalid_document",
    operation,
    message,
    retryable: false,
    repository,
    path,
    workflowIssues: issues,
  };
}

export function conflictError(
  operation: GitHubWorkflowStoreOperation,
  repository: GitHubRepositoryTarget,
  path: string,
  expectedBlobSha: string | null,
  actualBlobSha: string | null
): GitHubWorkflowStoreError {
  return {
    code: "conflict",
    operation,
    message: "Workflow changed in GitHub. Read the latest revision before retrying.",
    retryable: false,
    repository,
    path,
    expectedBlobSha,
    actualBlobSha,
  };
}

export function transportStoreError(
  error: unknown,
  operation: GitHubWorkflowStoreOperation,
  repository?: GitHubRepositoryTarget,
  path?: string,
  mutation = false
): GitHubWorkflowStoreError {
  if (!(error instanceof GitHubTransportError)) {
    return {
      code: mutation ? "ambiguous_write" : "unavailable",
      operation,
      message: mutation
        ? "GitHub write outcome is unknown and must be reconciled before retrying."
        : "GitHub is temporarily unavailable.",
      retryable: !mutation,
      repository,
      path,
    };
  }

  const shared = {
    operation,
    repository,
    path,
    requestId: error.requestId,
    retryAfterMs: error.retryAfterMs,
  };
  if (
    mutation &&
    (error.mutationMayHaveSucceeded ||
      error.code === "invalid_response" ||
      error.code === "network_error" ||
      error.status === 408 ||
      (error.status !== undefined && error.status >= 500))
  ) {
    return {
      ...shared,
      code: "ambiguous_write",
      message: "GitHub write outcome is unknown and must be reconciled before retrying.",
      retryable: false,
    };
  }
  if (error.code === "rate_limited" || error.status === 429) {
    return {
      ...shared,
      code: "rate_limited",
      message: "GitHub rate limit was exceeded.",
      retryable: true,
    };
  }
  if (error.status === 401 || error.status === 403) {
    return {
      ...shared,
      code: "access_denied",
      message: "The GitHub installation cannot access this repository operation.",
      retryable: false,
    };
  }
  if (error.status === 404) {
    return {
      ...shared,
      code: "not_found",
      message: "The GitHub repository revision or workflow was not found.",
      retryable: false,
    };
  }
  if (mutation && (error.status === 409 || error.status === 422)) {
    return {
      ...shared,
      code: "conflict",
      message: "GitHub rejected the write because the repository changed.",
      retryable: false,
    };
  }

  return {
    ...shared,
    code: "unavailable",
    message: "GitHub is temporarily unavailable.",
    retryable: true,
  };
}
