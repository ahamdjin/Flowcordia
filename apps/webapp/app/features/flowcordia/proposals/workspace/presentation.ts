import type {
  ControlPlaneError,
  ProposalOperation,
  ProposalState,
  WorkflowProposalAggregate,
} from "@flowcordia/control-plane";

export const flowcordiaProposalStateFilters = [
  "CREATING",
  "DRAFT",
  "READY",
  "PROMOTING",
  "RECONCILING",
  "MERGED",
  "CLOSED",
  "FAILED",
] as const satisfies readonly ProposalState[];

export type FlowcordiaProposalWorkspaceAction = "submit" | "promote";

export type FlowcordiaProposalCommandAcknowledgement = {
  ok: true;
  proposalId: string;
  state: ProposalState;
  updatedAt: string;
};

export type FlowcordiaProposalCommandError = {
  error: { code: string; message: string; retryable: boolean };
};

export type FlowcordiaProposalWorkspaceCursor = {
  updatedAt: string;
  proposalId: string;
};

export type FlowcordiaProposalWorkspaceItem = {
  proposalId: string;
  workflow: {
    id: string;
    path: string;
    desiredSha256: string;
  };
  repository: {
    owner: string;
    name: string;
  };
  git: {
    baseBranch: string;
    baseCommitSha: string;
    proposalBranch: string;
    headSha: string | null;
  };
  pullRequest: {
    number: number;
    url: string | null;
    draft: boolean | null;
    state: "open" | "closed" | null;
    merged: boolean;
    mergeCommitSha: string | null;
  } | null;
  state: ProposalState;
  operation: ProposalOperation;
  availableAction: FlowcordiaProposalWorkspaceAction | null;
  lastError: { code: string | null; message: string } | null;
  activity: {
    githubEventAt: string | null;
    pullRequestEventAt: string | null;
    reconciledAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type FlowcordiaProposalWorkspaceSummary = {
  total: number;
  active: number;
  awaitingReview: number;
  needsAttention: number;
  merged: number;
};

function safeExternalUrl(
  value: string | null,
  repository: { owner: string; name: string },
  pullRequestNumber: number
): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
      return null;
    }
    const path = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (
      path.length !== 4 ||
      path[0]?.toLowerCase() !== repository.owner.toLowerCase() ||
      path[1]?.toLowerCase() !== repository.name.toLowerCase() ||
      path[2] !== "pull" ||
      path[3] !== String(pullRequestNumber)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeErrorCode(value: string | null): string | null {
  return value && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : null;
}

function safeErrorMessage(code: string | null): string {
  switch (code) {
    case "policy_blocked":
      return "GitHub review, check, or branch policy is not satisfied yet.";
    case "invalid_input":
      return "The proposal command was rejected as invalid.";
    case "rate_limited":
      return "GitHub rate limiting delayed this proposal operation.";
    case "ambiguous_mutation":
      return "The GitHub result is uncertain; reconciliation must finish before retrying.";
    case "access_denied":
    case "scope_changed":
      return "The connected GitHub installation can no longer prove access to this proposal.";
    case "not_found":
    case "remote_not_found":
      return "The expected GitHub proposal state could not be found.";
    case "proposal_collision":
      return "Multiple GitHub resources claim this proposal identity.";
    case "conflict":
    case "concurrency_conflict":
      return "The proposal changed concurrently; refresh before retrying.";
    case "workflow_error":
    case "workflow_mismatch":
      return "The repository workflow does not match the governed proposal content.";
    case "identity_mismatch":
      return "GitHub proposal identity does not match the durable record.";
    case "github_unavailable":
    case "unavailable":
    case "invalid_remote_response":
      return "GitHub proposal state is temporarily unavailable.";
    case "persistence_failed":
      return "The proposal service is temporarily unavailable.";
    case "github_operation_failed":
      return "The GitHub proposal operation did not complete.";
    default:
      return "The last proposal operation did not complete.";
  }
}

function availableAction(
  proposal: WorkflowProposalAggregate
): FlowcordiaProposalWorkspaceAction | null {
  // The UI deliberately fails closed while reconciliation is in progress even
  // though the command service can resume an explicitly retried operation.
  if (!proposal.headSha) return null;
  if (proposal.state === "DRAFT") return "submit";
  if (proposal.state === "READY") return "promote";
  return null;
}

export function presentFlowcordiaProposal(
  proposal: WorkflowProposalAggregate
): FlowcordiaProposalWorkspaceItem {
  return {
    proposalId: proposal.proposalId,
    workflow: {
      id: proposal.workflowId,
      path: proposal.workflowPath,
      desiredSha256: proposal.desiredWorkflowSha256,
    },
    repository: { owner: proposal.repository.owner, name: proposal.repository.name },
    git: {
      baseBranch: proposal.baseBranch,
      baseCommitSha: proposal.baseCommitSha,
      proposalBranch: proposal.proposalBranch,
      headSha: proposal.headSha,
    },
    pullRequest:
      proposal.pullRequestNumber !== null
        ? {
            number: proposal.pullRequestNumber,
            url: safeExternalUrl(
              proposal.pullRequestUrl,
              proposal.repository,
              proposal.pullRequestNumber
            ),
            draft: proposal.pullRequestDraft,
            state: proposal.pullRequestState,
            merged: proposal.merged,
            mergeCommitSha: proposal.mergeCommitSha,
          }
        : null,
    state: proposal.state,
    operation: proposal.operation,
    availableAction: availableAction(proposal),
    lastError:
      proposal.lastErrorCode || proposal.lastErrorMessage
        ? {
            code: safeErrorCode(proposal.lastErrorCode),
            // Persisted provider text stays server-side. The workspace exposes a
            // stable explanation selected from the normalized failure code.
            message: safeErrorMessage(proposal.lastErrorCode),
          }
        : null,
    activity: {
      githubEventAt: proposal.lastGithubEventAt?.toISOString() ?? null,
      pullRequestEventAt: proposal.lastPullRequestEventAt?.toISOString() ?? null,
      reconciledAt: proposal.lastReconciledAt?.toISOString() ?? null,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    },
  };
}

export function presentFlowcordiaProposalCommandAcknowledgement(
  proposal: WorkflowProposalAggregate
): FlowcordiaProposalCommandAcknowledgement {
  return {
    ok: true,
    proposalId: proposal.proposalId,
    state: proposal.state,
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

export function presentFlowcordiaProposalCommandError(
  error: ControlPlaneError
): FlowcordiaProposalCommandError {
  return {
    error: {
      code: error.code,
      message: safeErrorMessage(error.github?.code ?? error.code),
      retryable: error.retryable,
    },
  };
}

export function presentFlowcordiaProposalWorkspaceCursor(
  proposal: WorkflowProposalAggregate
): FlowcordiaProposalWorkspaceCursor {
  return {
    updatedAt: proposal.updatedAt.toISOString(),
    proposalId: proposal.proposalId,
  };
}

export function summarizeFlowcordiaProposals(
  proposals: readonly FlowcordiaProposalWorkspaceItem[]
): FlowcordiaProposalWorkspaceSummary {
  return proposals.reduce<FlowcordiaProposalWorkspaceSummary>(
    (summary, proposal) => {
      summary.total += 1;
      if (["CREATING", "DRAFT", "READY", "PROMOTING", "RECONCILING"].includes(proposal.state)) {
        summary.active += 1;
      }
      if (proposal.state === "READY") summary.awaitingReview += 1;
      if (proposal.state === "FAILED" || proposal.state === "RECONCILING") {
        summary.needsAttention += 1;
      }
      if (proposal.state === "MERGED") summary.merged += 1;
      return summary;
    },
    { total: 0, active: 0, awaitingReview: 0, needsAttention: 0, merged: 0 }
  );
}

export function flowcordiaProposalStateLabel(state: ProposalState): string {
  switch (state) {
    case "CREATING":
      return "Creating";
    case "DRAFT":
      return "Draft";
    case "READY":
      return "Ready for promotion";
    case "PROMOTING":
      return "Promoting";
    case "MERGED":
      return "Merged";
    case "CLOSED":
      return "Closed";
    case "RECONCILING":
      return "Reconciling";
    case "FAILED":
      return "Needs attention";
  }
}
