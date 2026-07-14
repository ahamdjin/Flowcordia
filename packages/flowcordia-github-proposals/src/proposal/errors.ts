import type {
  GitHubRepositoryTarget,
  GitHubWorkflowStoreError,
} from "@flowcordia/github-workflows";
import { GitHubTransportError } from "@flowcordia/github-workflows";

import type {
  GitHubProposalError,
  GitHubProposalOperation,
  GitHubProposalPhase,
} from "../types.js";

interface ErrorContext {
  operation: GitHubProposalOperation;
  phase: GitHubProposalPhase;
  repository?: GitHubRepositoryTarget;
  proposalId?: string;
  proposalBranch?: string;
  pullRequestNumber?: number;
}

function shared(context: ErrorContext) {
  return {
    operation: context.operation,
    phase: context.phase,
    repository: context.repository,
    proposalId: context.proposalId,
    proposalBranch: context.proposalBranch,
    pullRequestNumber: context.pullRequestNumber,
  };
}

export function invalidProposalInput(
  operation: GitHubProposalOperation,
  issues: string[]
): GitHubProposalError {
  return {
    code: "invalid_input",
    operation,
    phase: "validation",
    message: "GitHub proposal operation input is invalid.",
    retryable: false,
    inputIssues: issues,
  };
}

export function proposalCollision(
  context: ErrorContext,
  message = "Proposal identifier is already associated with different GitHub state."
): GitHubProposalError {
  return {
    ...shared(context),
    code: "proposal_collision",
    message,
    retryable: false,
  };
}

export function proposalConflict(
  context: ErrorContext,
  message: string,
  expectedHeadSha?: string,
  actualHeadSha?: string
): GitHubProposalError {
  return {
    ...shared(context),
    code: "conflict",
    message,
    retryable: false,
    expectedHeadSha,
    actualHeadSha,
  };
}

export function transportProposalError(
  error: unknown,
  context: ErrorContext,
  mutation: boolean
): GitHubProposalError {
  if (!(error instanceof GitHubTransportError)) {
    return {
      ...shared(context),
      code: mutation ? "ambiguous_mutation" : "unavailable",
      message: mutation
        ? "GitHub mutation outcome is unknown and must be reconciled before retrying."
        : "GitHub is temporarily unavailable.",
      retryable: !mutation,
    };
  }

  const metadata = {
    ...shared(context),
    requestId: error.requestId,
    retryAfterMs: error.retryAfterMs,
  };
  if (error.code === "rate_limited" || error.status === 429) {
    return {
      ...metadata,
      code: "rate_limited",
      message: "GitHub rate limit was exceeded.",
      retryable: true,
    };
  }
  if (
    mutation &&
    (error.mutationMayHaveSucceeded ||
      error.status === 408 ||
      (error.status !== undefined && error.status >= 500))
  ) {
    return {
      ...metadata,
      code: "ambiguous_mutation",
      message: "GitHub mutation outcome is unknown and must be reconciled before retrying.",
      retryable: false,
    };
  }
  if (error.status === 401 || error.status === 403) {
    return {
      ...metadata,
      code: "access_denied",
      message: "The GitHub installation cannot access this proposal operation.",
      retryable: false,
    };
  }
  if (error.status === 404) {
    return {
      ...metadata,
      code: "not_found",
      message: "The requested GitHub proposal resource was not found.",
      retryable: false,
    };
  }
  if (error.status === 409 || error.status === 422) {
    return {
      ...metadata,
      code: "conflict",
      message: "GitHub state changed while processing the proposal.",
      retryable: false,
    };
  }
  return {
    ...metadata,
    code: "unavailable",
    message: "GitHub is temporarily unavailable.",
    retryable: true,
  };
}

export function workflowProposalError(
  error: GitHubWorkflowStoreError,
  context: ErrorContext
): GitHubProposalError {
  const metadata = {
    ...shared(context),
    requestId: error.requestId,
    retryAfterMs: error.retryAfterMs,
    workflowIssues: error.workflowIssues,
  };
  switch (error.code) {
    case "invalid_input":
      return {
        ...metadata,
        code: "invalid_input",
        message: "Workflow proposal input is invalid.",
        retryable: false,
        inputIssues: error.inputIssues,
      };
    case "invalid_document":
    case "identity_conflict":
      return {
        ...metadata,
        code: "workflow_error",
        message: "Workflow cannot be stored in the proposal branch.",
        retryable: false,
      };
    case "not_found":
      return {
        ...metadata,
        code: "not_found",
        message: "Workflow was not found in the proposal branch.",
        retryable: false,
      };
    case "conflict":
      return {
        ...metadata,
        code: "conflict",
        message: "Workflow changed while the proposal was being created.",
        retryable: false,
      };
    case "access_denied":
      return {
        ...metadata,
        code: "access_denied",
        message: "The GitHub installation cannot access the workflow proposal.",
        retryable: false,
      };
    case "rate_limited":
      return {
        ...metadata,
        code: "rate_limited",
        message: "GitHub rate limit was exceeded.",
        retryable: true,
      };
    case "ambiguous_write":
      return {
        ...metadata,
        code: "ambiguous_mutation",
        message: "Workflow write outcome is unknown and must be reconciled before retrying.",
        retryable: false,
      };
    case "unavailable":
      return {
        ...metadata,
        code: "unavailable",
        message: "GitHub is temporarily unavailable.",
        retryable: true,
      };
  }
}
