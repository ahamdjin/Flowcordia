import { workflowSha256 } from "@flowcordia/control-plane";
import type { GitHubWorkflowStoreError } from "@flowcordia/github-workflows";
import { randomUUID } from "node:crypto";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import type { WorkflowIndexScope } from "../index/types";
import {
  completeFlowcordiaRollbackIntent,
  claimFlowcordiaRollbackMutation,
  readFlowcordiaRollbackIntentByProposal,
  recordFlowcordiaRollbackIntentFailure,
  renewFlowcordiaRollbackMutation,
  retireFlowcordiaRollbackIntent,
  type FlowcordiaRollbackRecoveryIntentRecord,
} from "./intent.server";
import { findFlowcordiaRollbackAttempt, findFlowcordiaRollbackTarget } from "./repository.server";
import { rollbackRecovery, rollbackSourcePatches } from "./service.server";
import { assertFlowcordiaRollbackSnapshot } from "./snapshot";
import { assertFlowcordiaRollbackSourcePatchesAtHead } from "./source-verification";
import { assertFlowcordiaRollbackContentAtHead } from "./content-verification";
import { assertFlowcordiaRollbackDiffAtHead } from "./diff-attestation.server";
import { FlowcordiaRollbackError } from "./errors";

const ROLLBACK_OBSERVATION_LEASE_MS = 5 * 60_000;

function observationLeaseExpiresAt(now: Date): Date {
  return new Date(now.getTime() + ROLLBACK_OBSERVATION_LEASE_MS);
}

function readFailure(error: GitHubWorkflowStoreError, message: string): FlowcordiaRollbackError {
  return new FlowcordiaRollbackError(
    "historical_snapshot_unavailable",
    message,
    error.retryable ? 503 : 409,
    error.retryable
  );
}

function terminalAttemptMessage(state: "FAILED" | "CLOSED"): string {
  return state === "CLOSED"
    ? "The governed rollback proposal was closed without promotion."
    : "The governed rollback proposal ended in a definitive failure.";
}

function result(input: {
  intent: FlowcordiaRollbackRecoveryIntentRecord;
  state: string;
  headSha: string;
  pullRequestNumber: number;
  sourcePatchCount: number;
}) {
  return {
    proposalId: input.intent.targetProposalId,
    state: input.state,
    headSha: input.headSha,
    pullRequestNumber: input.pullRequestNumber,
    sourcePatchCount: input.sourcePatchCount,
    resumedIntent: true,
    targetProposalId: input.intent.sourceProposalId,
    targetMergeCommitSha: input.intent.sourceMergeCommitSha,
    currentProposalId: input.intent.currentProposalId,
    currentMergeCommitSha: input.intent.currentMergeCommitSha,
  };
}

export async function observeFlowcordiaRollbackProposal(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
  attemptProposalId: string;
  now?: Date;
}) {
  let intent = await readFlowcordiaRollbackIntentByProposal({
    scope: input.scope,
    workflowId: input.workflowId,
    proposalId: input.attemptProposalId,
  });
  if (!intent) {
    throw new FlowcordiaRollbackError(
      "rollback_not_available",
      "The governed rollback attempt is not available in this repository scope.",
      404,
      false
    );
  }
  const now = input.now ?? new Date();
  if (intent.status === "FAILED") {
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      "This rollback proposal did not pass exact governed source verification.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: intent.targetProposalId,
        state: "FAILED",
        action: "RETRY",
        pullRequestNumber: intent.pullRequestNumber,
      })
    );
  }
  let attempt = await findFlowcordiaRollbackAttempt({
    scope: input.scope,
    workflowId: input.workflowId,
    proposalId: intent.targetProposalId,
  });
  if (!attempt) {
    const leaseActive =
      intent.status === "PENDING" &&
      intent.mutationLeaseExpiresAt !== null &&
      intent.mutationLeaseExpiresAt.getTime() > now.getTime();
    if (leaseActive) {
      throw new FlowcordiaRollbackError(
        "proposal_reconciling",
        "The governed rollback attempt is still reserving its proposal mutation.",
        409,
        false,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId: intent.targetProposalId,
          state: "PENDING",
          action: "WAIT",
        })
      );
    }
    const retired = await retireFlowcordiaRollbackIntent({
      intentId: intent.id,
      code: "proposal_missing",
      message: "The rollback mutation lease ended without a governed proposal record.",
      now,
      invalidateActiveLease: false,
    });
    if (!retired) {
      const [refreshedIntent, refreshedAttempt] = await Promise.all([
        readFlowcordiaRollbackIntentByProposal({
          scope: input.scope,
          workflowId: input.workflowId,
          proposalId: input.attemptProposalId,
        }),
        findFlowcordiaRollbackAttempt({
          scope: input.scope,
          workflowId: input.workflowId,
          proposalId: intent.targetProposalId,
        }),
      ]);
      if (refreshedIntent?.status === "FAILED") {
        throw new FlowcordiaRollbackError(
          "rollback_retry_required",
          "This rollback proposal did not pass exact governed source verification.",
          409,
          false,
          rollbackRecovery({
            workflowId: input.workflowId,
            proposalId: intent.targetProposalId,
            state: "FAILED",
            action: "RETRY",
            pullRequestNumber: refreshedIntent.pullRequestNumber,
          })
        );
      }
      if (refreshedIntent && refreshedAttempt) {
        intent = refreshedIntent;
        attempt = refreshedAttempt;
      } else {
        throw new FlowcordiaRollbackError(
          "proposal_reconciling",
          "The governed rollback attempt was claimed while its missing proposal was being inspected.",
          409,
          false,
          rollbackRecovery({
            workflowId: input.workflowId,
            proposalId: intent.targetProposalId,
            state: "PENDING",
            action: "WAIT",
          })
        );
      }
    } else {
      throw new FlowcordiaRollbackError(
        "rollback_retry_required",
        "The rollback attempt ended without a governed proposal. Retry it as a new numbered attempt.",
        409,
        false,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId: intent.targetProposalId,
          state: "ABSENT",
          action: "RETRY",
        })
      );
    }
  }
  if (attempt.state === "CREATING" || attempt.state === "RECONCILING") {
    throw new FlowcordiaRollbackError(
      "proposal_reconciling",
      "The rollback proposal has an uncertain GitHub outcome and is still being reconciled.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: intent.targetProposalId,
        state: "RECONCILING",
        action: "WAIT",
        pullRequestNumber: attempt.pullRequestNumber,
        pullRequestUrl: attempt.pullRequestUrl,
      })
    );
  }
  if (attempt.state === "FAILED" || attempt.state === "CLOSED") {
    await retireFlowcordiaRollbackIntent({
      intentId: intent.id,
      code: attempt.state === "CLOSED" ? "proposal_closed" : "proposal_failed",
      message: terminalAttemptMessage(attempt.state),
      now,
      invalidateActiveLease: true,
    });
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      terminalAttemptMessage(attempt.state),
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: intent.targetProposalId,
        state: attempt.state,
        action: "RETRY",
        pullRequestNumber: attempt.pullRequestNumber,
        pullRequestUrl: attempt.pullRequestUrl,
      })
    );
  }
  if (
    intent.status === "PENDING" &&
    intent.mutationLeaseExpiresAt !== null &&
    intent.mutationLeaseExpiresAt.getTime() > now.getTime()
  ) {
    throw new FlowcordiaRollbackError(
      "proposal_reconciling",
      "The rollback proposal is still owned by its active mutation request.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: intent.targetProposalId,
        state: attempt.state,
        action: "WAIT",
        pullRequestNumber: attempt.pullRequestNumber,
        pullRequestUrl: attempt.pullRequestUrl,
      })
    );
  }
  if (!attempt.headSha || attempt.pullRequestNumber === null) {
    throw new FlowcordiaRollbackError(
      "proposal_reconciling",
      "The rollback proposal does not yet have a proven GitHub head and pull request.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: intent.targetProposalId,
        state: "RECONCILING",
        action: "WAIT",
        pullRequestNumber: attempt.pullRequestNumber,
        pullRequestUrl: attempt.pullRequestUrl,
      })
    );
  }
  if (intent.status === "PROPOSAL_CREATED") {
    if (
      intent.targetHeadSha !== attempt.headSha ||
      intent.pullRequestNumber !== attempt.pullRequestNumber ||
      intent.sourcePatchCount === null
    ) {
      const recoveryState =
        attempt.merged || attempt.state === "MERGED"
          ? "MERGED"
          : attempt.pullRequestState === "open"
            ? "OPEN"
            : attempt.pullRequestState === "closed"
              ? "CLOSED"
              : attempt.pullRequestNumber === null
                ? "BRANCH_ONLY"
                : "AMBIGUOUS";
      const recoveryAction =
        recoveryState === "OPEN" ? "CLOSE" : recoveryState === "CLOSED" ? "RETRY" : "REVIEW";
      await retireFlowcordiaRollbackIntent({
        intentId: intent.id,
        code: "verified_proposal_changed",
        message: "The rollback proposal changed after exact-head verification.",
        now,
        invalidateActiveLease: true,
      });
      throw new FlowcordiaRollbackError(
        "rollback_retry_required",
        recoveryState === "OPEN"
          ? "The rollback proposal changed after exact-head verification. Close it without merging, then create a new numbered rollback attempt."
          : "The rollback proposal changed after exact-head verification. Review and abandon it before creating a new numbered rollback attempt.",
        409,
        false,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId: intent.targetProposalId,
          state: recoveryState,
          action: recoveryAction,
          pullRequestNumber: attempt.pullRequestNumber,
          pullRequestUrl: attempt.pullRequestUrl,
        })
      );
    }
    return result({
      intent,
      state: attempt.state,
      headSha: attempt.headSha,
      pullRequestNumber: attempt.pullRequestNumber,
      sourcePatchCount: intent.sourcePatchCount,
    });
  }

  const verificationLeaseToken = randomUUID();
  const claimed = await claimFlowcordiaRollbackMutation({
    intentId: intent.id,
    leaseToken: verificationLeaseToken,
    now,
    leaseExpiresAt: observationLeaseExpiresAt(now),
  });
  if (!claimed) {
    throw new FlowcordiaRollbackError(
      "proposal_reconciling",
      "Another request is already verifying this exact governed rollback attempt.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: intent.targetProposalId,
        state: "RECONCILING",
        action: "WAIT",
        pullRequestNumber: attempt.pullRequestNumber,
        pullRequestUrl: attempt.pullRequestUrl,
      })
    );
  }

  try {
    const [target, current] = await Promise.all([
      findFlowcordiaRollbackTarget({
        scope: input.scope,
        workflowId: input.workflowId,
        proposalId: intent.sourceProposalId,
      }),
      findFlowcordiaRollbackTarget({
        scope: input.scope,
        workflowId: input.workflowId,
        proposalId: intent.currentProposalId,
      }),
    ]);
    if (
      !target ||
      target.headSha !== intent.sourceHeadSha ||
      target.mergeCommitSha !== intent.sourceMergeCommitSha ||
      !current ||
      current.headSha !== intent.currentHeadSha ||
      current.mergeCommitSha !== intent.currentMergeCommitSha
    ) {
      throw new FlowcordiaRollbackError(
        "rollback_conflict",
        "The durable rollback proposal lineage could not be re-established.",
        409,
        false
      );
    }

    const { workflowStore, sourcePatchStore, repositoryComparison } =
      await createWorkflowIndexGitHubGateway(input.scope);
    const [historicalWorkflow, baseWorkflow] = await Promise.all([
      workflowStore.read({
        scope: input.scope,
        workflowId: input.workflowId,
        revision: intent.sourceMergeCommitSha,
      }),
      workflowStore.read({
        scope: input.scope,
        workflowId: input.workflowId,
        revision: intent.baseCommitSha,
      }),
    ]);
    if (!historicalWorkflow.success) {
      throw readFailure(
        historicalWorkflow.error,
        "The historical rollback workflow could not be re-read safely."
      );
    }
    if (!baseWorkflow.success) {
      throw readFailure(
        baseWorkflow.error,
        "The original rollback base workflow could not be re-read safely."
      );
    }
    if (
      historicalWorkflow.value.source.commitSha !== intent.sourceMergeCommitSha ||
      historicalWorkflow.value.source.path !== target.workflowPath ||
      baseWorkflow.value.source.commitSha !== intent.baseCommitSha ||
      baseWorkflow.value.source.blobSha !== intent.baseBlobSha ||
      baseWorkflow.value.source.path !== current.workflowPath ||
      workflowSha256(baseWorkflow.value.workflow) !== current.desiredWorkflowSha256
    ) {
      throw new FlowcordiaRollbackError(
        "rollback_conflict",
        "The reconciled rollback proposal does not match its immutable repository provenance.",
        409,
        false
      );
    }
    assertFlowcordiaRollbackSnapshot({
      workflow: historicalWorkflow.value.workflow,
      expectedWorkflowId: input.workflowId,
      expectedWorkflowSha256: target.desiredWorkflowSha256,
    });

    const sourcePatches = await rollbackSourcePatches({
      scope: input.scope,
      workflow: historicalWorkflow.value.workflow,
      targetRevision: intent.sourceMergeCommitSha,
      currentRevision: intent.baseCommitSha,
    });
    await Promise.all([
      assertFlowcordiaRollbackSourcePatchesAtHead({
        scope: input.scope,
        sourcePatchStore,
        sourcePatches,
        proposalHeadSha: attempt.headSha,
      }),
      assertFlowcordiaRollbackContentAtHead({
        scope: input.scope,
        workflowStore,
        workflow: historicalWorkflow.value.workflow,
        workflowPath: target.workflowPath,
        proposalHeadSha: attempt.headSha,
      }),
      assertFlowcordiaRollbackDiffAtHead({
        repositoryComparison,
        workflowId: input.workflowId,
        workflowPath: target.workflowPath,
        baseCommitSha: intent.baseCommitSha,
        proposalHeadSha: attempt.headSha,
        sourcePatches,
      }),
    ]);
    const renewalTime = new Date();
    const renewed = await renewFlowcordiaRollbackMutation({
      intentId: intent.id,
      leaseToken: verificationLeaseToken,
      now: renewalTime,
      leaseExpiresAt: observationLeaseExpiresAt(renewalTime),
    });
    if (!renewed) {
      throw new FlowcordiaRollbackError(
        "proposal_reconciling",
        "This request no longer owns exact-head rollback verification.",
        409,
        false
      );
    }
    await completeFlowcordiaRollbackIntent({
      intentId: intent.id,
      targetHeadSha: attempt.headSha,
      pullRequestNumber: attempt.pullRequestNumber,
      sourcePatchCount: sourcePatches.length,
      leaseToken: verificationLeaseToken,
    });
    return result({
      intent,
      state: attempt.state,
      headSha: attempt.headSha,
      pullRequestNumber: attempt.pullRequestNumber,
      sourcePatchCount: sourcePatches.length,
    });
  } catch (error) {
    const normalized =
      error instanceof FlowcordiaRollbackError
        ? error
        : new FlowcordiaRollbackError(
            "proposal_failed",
            "The reconciled rollback proposal could not be verified safely.",
            503,
            true
          );
    const terminal = !normalized.retryable && normalized.code !== "proposal_reconciling";
    const recorded = await recordFlowcordiaRollbackIntentFailure({
      intentId: intent.id,
      code: normalized.code,
      message: normalized.message,
      terminal,
      leaseToken: verificationLeaseToken,
    });
    if (!recorded || !terminal) {
      throw new FlowcordiaRollbackError(
        "proposal_reconciling",
        recorded
          ? normalized.message
          : "This request lost the rollback verification lease. Refresh the exact attempt.",
        409,
        false,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId: intent.targetProposalId,
          state: "RECONCILING",
          action: "WAIT",
          pullRequestNumber: attempt.pullRequestNumber,
          pullRequestUrl: attempt.pullRequestUrl,
        })
      );
    }
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      `${normalized.message} Close or delete the failed proposal attempt before retrying.`,
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: intent.targetProposalId,
        state: "FAILED",
        action: "RETRY",
        pullRequestNumber: attempt.pullRequestNumber,
        pullRequestUrl: attempt.pullRequestUrl,
      })
    );
  }
}
