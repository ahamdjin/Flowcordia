import { workflowSha256 } from "@flowcordia/control-plane";
import { buildProposalBranch } from "@flowcordia/github-proposals";
import type {
  GitHubRepositorySourcePatch,
  GitHubWorkflowDiscoveryError,
  GitHubWorkflowStoreError,
} from "@flowcordia/github-workflows";
import {
  serializeWorkflow,
  type JsonValue,
  type WorkflowDefinition,
  type WorkflowFunctionCatalog,
  type WorkflowFunctionDefinition,
} from "@flowcordia/workflow";
import { randomUUID } from "node:crypto";
import { createGitHubProposalAttemptInspector } from "../../proposals/github.server";
import { createProposalCommandService } from "../../proposals/service.server";
import { createSourceAwareProposalCommandService } from "../../proposals/source-command.server";
import { canonicalSourcePatchIdentity } from "../../proposals/source-patch-identity";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import type { WorkflowIndexScope } from "../index/types";
import { prepareFlowcordiaPreviewEnvironment } from "../preview/environment.server";
import { flowcordiaRollbackKey } from "./contract";
import { assertFlowcordiaRollbackContentAtHead } from "./content-verification";
import { FlowcordiaRollbackError, type FlowcordiaRollbackRecovery } from "./errors";
import {
  completeFlowcordiaRollbackIntent,
  claimFlowcordiaRollbackMutation,
  readLatestFlowcordiaRollbackIntent,
  recordFlowcordiaRollbackIntentFailure,
  renewFlowcordiaRollbackMutation,
  reserveFlowcordiaRollbackIntent,
  retireFlowcordiaRollbackIntent,
} from "./intent.server";
import {
  findFlowcordiaRollbackAttempt,
  findFlowcordiaRollbackTarget,
  queryFlowcordiaRollbackHistory,
} from "./repository.server";
import { isAbandonedFlowcordiaRollbackAttempt } from "./retry";
import { assertFlowcordiaRollbackSnapshot } from "./snapshot";
import { assertFlowcordiaRollbackSourcePatchesAtHead } from "./source-verification";
import { assertFlowcordiaRollbackDiffAtHead } from "./diff-attestation.server";

const ROLLBACK_MUTATION_LEASE_MS = 5 * 60_000;

function leaseExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + ROLLBACK_MUTATION_LEASE_MS);
}
import { classifyFlowcordiaRollbackProposalFailure } from "./proposal-failure";

function canonicalJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalJson(child)])
    );
  }
  return value;
}

function definitionSignature(definition: WorkflowFunctionDefinition): string {
  return JSON.stringify(canonicalJson(definition as unknown as JsonValue));
}

function referencedFunctions(input: {
  workflow: WorkflowDefinition;
  catalog: WorkflowFunctionCatalog;
}): WorkflowFunctionDefinition[] {
  const definitions = new Map(
    input.catalog.functions.map((definition) => [definition.id, definition])
  );
  const selected = new Map<string, WorkflowFunctionDefinition>();
  for (const node of input.workflow.nodes) {
    if (node.operation !== "code.task") continue;
    const functionId = node.configuration.functionId;
    if (
      typeof functionId !== "string" ||
      !node.codeReference ||
      node.codeReference.repository !== undefined ||
      node.codeReference.commit !== undefined
    ) {
      throw new FlowcordiaRollbackError(
        "function_catalog_conflict",
        "The historical workflow contains an unsupported repository function identity.",
        409,
        false
      );
    }
    const definition = definitions.get(functionId);
    if (
      !definition ||
      definition.codeReference.path !== node.codeReference.path ||
      definition.codeReference.exportName !== node.codeReference.exportName
    ) {
      throw new FlowcordiaRollbackError(
        "function_catalog_conflict",
        `Historical function "${functionId}" does not match its exact repository catalog.`,
        409,
        false
      );
    }
    selected.set(functionId, definition);
  }
  return [...selected.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function storeFailure(
  error: GitHubWorkflowStoreError,
  code:
    | "historical_snapshot_unavailable"
    | "function_catalog_conflict"
    | "source_snapshot_unavailable",
  message: string
): FlowcordiaRollbackError {
  return new FlowcordiaRollbackError(code, message, error.retryable ? 503 : 409, error.retryable);
}

function discoveryFailure(error: GitHubWorkflowDiscoveryError): FlowcordiaRollbackError {
  return new FlowcordiaRollbackError(
    "function_catalog_conflict",
    "The exact current workflow set could not be scanned for shared repository source ownership.",
    error.retryable ? 503 : 409,
    error.retryable
  );
}

function canonicalRepositoryPath(path: string): string {
  return path.replace(/^\.\//, "");
}

export function rollbackRecovery(input: {
  workflowId: string;
  proposalId: string;
  state: FlowcordiaRollbackRecovery["state"];
  action: FlowcordiaRollbackRecovery["action"];
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
  branchName?: string;
}): FlowcordiaRollbackRecovery {
  return {
    attemptProposalId: input.proposalId,
    branchName: input.branchName ?? buildProposalBranch(input.workflowId, input.proposalId),
    pullRequestNumber: input.pullRequestNumber ?? null,
    pullRequestUrl: input.pullRequestUrl ?? null,
    state: input.state,
    action: input.action,
  };
}

async function assertFailedAttemptIsAbandoned(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
  proposalId: string;
}): Promise<void> {
  let projection: Awaited<
    ReturnType<Awaited<ReturnType<typeof createGitHubProposalAttemptInspector>>["inspect"]>
  >;
  try {
    projection = await (
      await createGitHubProposalAttemptInspector(input.scope)
    ).inspect({
      workflowId: input.workflowId,
      proposalId: input.proposalId,
    });
  } catch {
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      "The failed rollback attempt could not be inspected safely. Retry after GitHub is available.",
      503,
      true,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: input.proposalId,
        state: "FAILED",
        action: "RETRY",
      })
    );
  }

  if (
    !isAbandonedFlowcordiaRollbackAttempt({
      branchExists: projection.branch.exists,
      pullRequests: projection.pullRequests,
    })
  ) {
    const pullRequest = projection.pullRequests.length === 1 ? projection.pullRequests[0] : null;
    const state: FlowcordiaRollbackRecovery["state"] =
      projection.pullRequests.length > 1
        ? "AMBIGUOUS"
        : pullRequest?.merged
          ? "MERGED"
          : pullRequest?.state === "open"
            ? "OPEN"
            : pullRequest?.state === "closed"
              ? "CLOSED"
              : projection.branch.exists
                ? "BRANCH_ONLY"
                : "ABSENT";
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      "The previous rollback branch or pull request is still active or ambiguous. Close its pull request without merging, or delete a branch that has no pull request, before retrying.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: input.proposalId,
        branchName: projection.branchName,
        pullRequestNumber: pullRequest?.number,
        pullRequestUrl: pullRequest?.url,
        state,
        action: state === "OPEN" ? "CLOSE" : "REVIEW",
      })
    );
  }
}

export async function rollbackSourcePatches(input: {
  scope: WorkflowIndexScope;
  workflow: WorkflowDefinition;
  targetRevision: string;
  currentRevision: string;
}): Promise<GitHubRepositorySourcePatch[]> {
  const { catalog, functionCatalog, sourcePatchStore, workflowStore } =
    await createWorkflowIndexGitHubGateway(input.scope);
  const hasFunctions = input.workflow.nodes.some((node) => node.operation === "code.task");
  if (!hasFunctions) return [];

  const targetCatalog = await functionCatalog.read({
    scope: input.scope,
    revision: input.targetRevision,
  });
  if (!targetCatalog.success) {
    throw storeFailure(
      targetCatalog.error,
      "historical_snapshot_unavailable",
      "The historical function catalog could not be read safely."
    );
  }
  if (targetCatalog.value.source.commitSha !== input.targetRevision) {
    throw new FlowcordiaRollbackError(
      "historical_snapshot_unavailable",
      "The historical function catalog did not resolve to the exact rollback commit.",
      409,
      false
    );
  }

  const currentCatalog = await functionCatalog.read({
    scope: input.scope,
    revision: input.currentRevision,
  });
  if (!currentCatalog.success) {
    throw storeFailure(
      currentCatalog.error,
      "function_catalog_conflict",
      "The current function catalog could not be verified for rollback compatibility."
    );
  }
  if (currentCatalog.value.source.commitSha !== input.currentRevision) {
    throw new FlowcordiaRollbackError(
      "function_catalog_conflict",
      "The current function catalog did not resolve to the exact production-branch commit.",
      409,
      false
    );
  }

  const historicalDefinitions = referencedFunctions({
    workflow: input.workflow,
    catalog: targetCatalog.value.catalog,
  });
  const currentDefinitions = new Map(
    currentCatalog.value.catalog.functions.map((definition) => [definition.id, definition])
  );
  for (const historical of historicalDefinitions) {
    const current = currentDefinitions.get(historical.id);
    if (!current || definitionSignature(current) !== definitionSignature(historical)) {
      throw new FlowcordiaRollbackError(
        "function_catalog_conflict",
        `Function catalog identity "${historical.id}" changed after the rollback target. Restore or review the catalog before rolling back this workflow.`,
        409,
        false
      );
    }
  }

  const paths = [
    ...new Set(historicalDefinitions.map((definition) => definition.codeReference.path)),
  ].sort((left, right) => left.localeCompare(right));
  const patches: GitHubRepositorySourcePatch[] = [];
  for (const path of paths) {
    const historical = await sourcePatchStore.read({
      scope: input.scope,
      path,
      revision: input.targetRevision,
    });
    if (!historical.success) {
      throw storeFailure(
        historical.error,
        "source_snapshot_unavailable",
        `Historical source file "${path}" could not be read safely.`
      );
    }
    if (historical.value.commitSha !== input.targetRevision) {
      throw new FlowcordiaRollbackError(
        "source_snapshot_unavailable",
        `Historical source file "${path}" did not resolve to the exact rollback commit.`,
        409,
        false
      );
    }

    const current = await sourcePatchStore.read({
      scope: input.scope,
      path,
      revision: input.currentRevision,
    });
    if (!current.success && current.error.code !== "not_found") {
      throw storeFailure(
        current.error,
        "source_snapshot_unavailable",
        `Current source file "${path}" could not be read safely.`
      );
    }
    if (current.success && current.value.commitSha !== input.currentRevision) {
      throw new FlowcordiaRollbackError(
        "source_snapshot_unavailable",
        `Current source file "${path}" did not resolve to the exact production-branch commit.`,
        409,
        false
      );
    }
    if (current.success && current.value.sourceText === historical.value.sourceText) continue;
    patches.push({
      path,
      sourceText: historical.value.sourceText,
      expectedBlobSha: current.success ? current.value.blobSha : null,
    });
  }
  if (patches.length === 0) return patches;

  const discovered = await catalog.discover({
    scope: input.scope,
    revision: input.currentRevision,
  });
  if (!discovered.success) throw discoveryFailure(discovered.error);
  if (discovered.value.commitSha !== input.currentRevision) {
    throw new FlowcordiaRollbackError(
      "function_catalog_conflict",
      "Workflow ownership discovery did not resolve to the exact production-branch commit.",
      409,
      false
    );
  }
  if (!discovered.value.entries.some((entry) => entry.workflowId === input.workflow.id)) {
    throw new FlowcordiaRollbackError(
      "function_catalog_conflict",
      "The rollback workflow is missing from the exact current repository workflow set.",
      409,
      false
    );
  }

  const patchedPaths = new Set(patches.map((patch) => canonicalRepositoryPath(patch.path)));
  const otherEntries = discovered.value.entries.filter(
    (entry) => entry.workflowId !== input.workflow.id
  );
  for (let offset = 0; offset < otherEntries.length; offset += 8) {
    const batch = otherEntries.slice(offset, offset + 8);
    const reads = await Promise.all(
      batch.map(async (entry) => ({
        entry,
        read: await workflowStore.read({
          scope: input.scope,
          workflowId: entry.workflowId,
          revision: input.currentRevision,
        }),
      }))
    );
    for (const { entry, read } of reads) {
      if (!read.success) {
        throw storeFailure(
          read.error,
          "function_catalog_conflict",
          `Current workflow "${entry.workflowId}" could not be read while checking shared source ownership.`
        );
      }
      if (
        read.value.source.commitSha !== input.currentRevision ||
        read.value.source.path !== entry.path ||
        read.value.source.blobSha !== entry.blobSha
      ) {
        throw new FlowcordiaRollbackError(
          "function_catalog_conflict",
          `Current workflow "${entry.workflowId}" did not match its exact discovery identity.`,
          409,
          false
        );
      }
      const sharedNode = read.value.workflow.nodes.find(
        (node) =>
          node.operation === "code.task" &&
          node.codeReference !== undefined &&
          patchedPaths.has(canonicalRepositoryPath(node.codeReference.path))
      );
      if (sharedNode?.codeReference) {
        throw new FlowcordiaRollbackError(
          "function_catalog_conflict",
          `Source file "${sharedNode.codeReference.path}" is also used by workflow "${entry.workflowId}". Flowcordia will not replace a shared source file during rollback.`,
          409,
          false
        );
      }
    }
  }
  return patches;
}

export async function createFlowcordiaRollbackProposal(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
  targetProposalId: string;
  expectedTargetHeadSha: string;
  expectedTargetMergeCommitSha: string;
  expectedCurrentProposalId: string;
  expectedCurrentHeadSha: string;
  expectedCurrentMergeCommitSha: string;
  expectedBaseCommitSha: string;
  expectedBaseBlobSha: string;
  reason: string;
  retryFailedIntent: boolean;
  actorId: string;
  creatorReviewerId: string | null;
}) {
  const { workflowStore, sourcePatchStore, repositoryComparison } =
    await createWorkflowIndexGitHubGateway(input.scope);
  const currentWorkflow = await workflowStore.read({
    scope: input.scope,
    workflowId: input.workflowId,
  });
  if (!currentWorkflow.success) {
    throw storeFailure(
      currentWorkflow.error,
      "historical_snapshot_unavailable",
      "The current repository workflow could not be read safely."
    );
  }
  if (
    currentWorkflow.value.workflow.id !== input.workflowId ||
    currentWorkflow.value.source.commitSha !== input.expectedBaseCommitSha ||
    currentWorkflow.value.source.blobSha !== input.expectedBaseBlobSha
  ) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The production branch base changed. Refresh Studio before creating rollback.",
      409,
      false
    );
  }
  const currentWorkflowSha256 = workflowSha256(currentWorkflow.value.workflow);
  const history = await queryFlowcordiaRollbackHistory({
    scope: input.scope,
    workflowId: input.workflowId,
    currentWorkflowSha256,
  });
  const current = history.current;
  if (
    !current ||
    current.proposalId !== input.expectedCurrentProposalId ||
    current.headSha !== input.expectedCurrentHeadSha ||
    current.mergeCommitSha !== input.expectedCurrentMergeCommitSha
  ) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The live workflow no longer matches the expected governed proposal. Refresh Studio before creating rollback.",
      409,
      false
    );
  }
  if (current.proposalId === input.targetProposalId) {
    throw new FlowcordiaRollbackError(
      "invalid_input",
      "Rollback target must be an earlier governed proposal.",
      400,
      false
    );
  }

  const target = await findFlowcordiaRollbackTarget({
    scope: input.scope,
    workflowId: input.workflowId,
    proposalId: input.targetProposalId,
  });
  if (!target?.mergeCommitSha || !target.headSha) {
    throw new FlowcordiaRollbackError(
      "rollback_not_available",
      "The selected historical proposal is not available for rollback.",
      404,
      false
    );
  }
  if (
    target.headSha !== input.expectedTargetHeadSha ||
    target.mergeCommitSha !== input.expectedTargetMergeCommitSha
  ) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "The selected historical workflow identity changed. Refresh Studio before creating rollback.",
      409,
      false
    );
  }
  if (!history.candidates.some((candidate) => candidate.proposalId === target.proposalId)) {
    throw new FlowcordiaRollbackError(
      "rollback_not_available",
      "The selected proposal is outside the bounded rollback history. Choose a version shown by Studio.",
      409,
      false
    );
  }

  const historicalWorkflow = await workflowStore.read({
    scope: input.scope,
    workflowId: input.workflowId,
    revision: target.mergeCommitSha,
  });
  if (!historicalWorkflow.success) {
    throw storeFailure(
      historicalWorkflow.error,
      "historical_snapshot_unavailable",
      "The historical workflow snapshot could not be read safely."
    );
  }
  if (
    historicalWorkflow.value.source.commitSha !== target.mergeCommitSha ||
    historicalWorkflow.value.source.path !== target.workflowPath
  ) {
    throw new FlowcordiaRollbackError(
      "historical_snapshot_unavailable",
      "The historical workflow did not resolve to the exact rollback commit and path.",
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
    targetRevision: target.mergeCommitSha,
    currentRevision: currentWorkflow.value.source.commitSha,
  });
  if (
    serializeWorkflow(currentWorkflow.value.workflow) ===
      serializeWorkflow(historicalWorkflow.value.workflow) &&
    sourcePatches.length === 0
  ) {
    throw new FlowcordiaRollbackError(
      "no_changes",
      "The selected governed version already matches the current repository workflow and source set.",
      409,
      false
    );
  }

  let sourceIdentity: ReturnType<typeof canonicalSourcePatchIdentity>;
  try {
    sourceIdentity = canonicalSourcePatchIdentity(sourcePatches);
  } catch {
    throw new FlowcordiaRollbackError(
      "source_snapshot_unavailable",
      "The historical referenced source set exceeds the governed source-patch boundary.",
      409,
      false
    );
  }

  const rollbackKey = flowcordiaRollbackKey({
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    githubAppInstallationId: input.scope.githubAppInstallationId,
    installationId: input.scope.installationId,
    repositoryId: input.scope.repositoryId,
    repositoryGithubId: input.scope.repositoryGithubId,
    repositoryOwner: input.scope.repository.owner,
    repositoryName: input.scope.repository.name,
    baseBranch: input.scope.repository.branch,
    workflowId: input.workflowId,
    currentProposalId: current.proposalId,
    currentHeadSha: current.headSha,
    currentMergeCommitSha: current.mergeCommitSha,
    targetProposalId: target.proposalId,
    targetHeadSha: target.headSha,
    targetMergeCommitSha: target.mergeCommitSha,
    baseCommitSha: currentWorkflow.value.source.commitSha,
    baseBlobSha: currentWorkflow.value.source.blobSha,
  });
  const latestIntent = await readLatestFlowcordiaRollbackIntent({
    scope: input.scope,
    rollbackKey,
  });
  if (latestIntent?.status === "FAILED" && !input.retryFailedIntent) {
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      "The previous rollback attempt is terminal. Review it, then explicitly retry as a new governed attempt.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId: latestIntent.targetProposalId,
        state: "FAILED",
        action: "RETRY",
        pullRequestNumber: latestIntent.pullRequestNumber,
      })
    );
  }
  if (latestIntent?.status === "FAILED" && input.retryFailedIntent) {
    await assertFailedAttemptIsAbandoned({
      scope: input.scope,
      workflowId: input.workflowId,
      proposalId: latestIntent.targetProposalId,
    });
  }
  const correlationId = `rollback:${randomUUID()}`;
  const intent = await reserveFlowcordiaRollbackIntent({
    scope: input.scope,
    workflowId: input.workflowId,
    rollbackKey,
    sourceProposalId: target.proposalId,
    sourceHeadSha: target.headSha,
    sourceMergeCommitSha: target.mergeCommitSha,
    currentProposalId: current.proposalId,
    currentHeadSha: current.headSha,
    currentMergeCommitSha: current.mergeCommitSha,
    baseCommitSha: currentWorkflow.value.source.commitSha,
    baseBlobSha: currentWorkflow.value.source.blobSha,
    reason: input.reason,
    actorId: input.actorId,
    creatorReviewerId: input.creatorReviewerId,
    correlationId,
    allowFailedRetry: input.retryFailedIntent,
    expectedFailedIntentId:
      latestIntent?.status === "FAILED" && input.retryFailedIntent ? latestIntent.id : null,
  });
  const proposalId = intent.targetProposalId;

  const existingAttempt = await findFlowcordiaRollbackAttempt({
    scope: input.scope,
    workflowId: input.workflowId,
    proposalId,
  });
  if (existingAttempt && existingAttempt.state !== "FAILED" && existingAttempt.state !== "CLOSED") {
    throw new FlowcordiaRollbackError(
      "proposal_reconciling",
      "The governed rollback proposal already exists. Refresh its exact attempt instead of repeating proposal mutation.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId,
        state:
          existingAttempt.state === "CREATING" || existingAttempt.state === "RECONCILING"
            ? "RECONCILING"
            : existingAttempt.state,
        action: "WAIT",
        pullRequestNumber: existingAttempt.pullRequestNumber,
        pullRequestUrl: existingAttempt.pullRequestUrl,
      })
    );
  }
  if (existingAttempt?.state === "FAILED" || existingAttempt?.state === "CLOSED") {
    await retireFlowcordiaRollbackIntent({
      intentId: intent.id,
      code: existingAttempt.state === "CLOSED" ? "proposal_closed" : "proposal_failed",
      message:
        existingAttempt.state === "CLOSED"
          ? "The governed proposal attempt was closed without promotion."
          : "The governed proposal attempt ended in a definitive failure.",
      now: new Date(),
      invalidateActiveLease: true,
    });
    throw new FlowcordiaRollbackError(
      "rollback_retry_required",
      "The previous rollback attempt is terminal. Review and abandon it before explicitly retrying.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId,
        state: existingAttempt.state === "CLOSED" ? "CLOSED" : "FAILED",
        action: "RETRY",
        pullRequestNumber: existingAttempt.pullRequestNumber,
        pullRequestUrl: existingAttempt.pullRequestUrl,
      })
    );
  }
  if (intent.status === "PROPOSAL_CREATED" && !existingAttempt) {
    throw new FlowcordiaRollbackError(
      "rollback_conflict",
      "Rollback intent provenance exists without its governed proposal record.",
      409,
      false
    );
  }

  const mutationLeaseToken = randomUUID();
  const claimTime = new Date();
  const claimed = await claimFlowcordiaRollbackMutation({
    intentId: intent.id,
    leaseToken: mutationLeaseToken,
    now: claimTime,
    leaseExpiresAt: leaseExpiresAt(claimTime),
  });
  if (!claimed) {
    throw new FlowcordiaRollbackError(
      "proposal_reconciling",
      "Another request is already creating this exact governed rollback attempt.",
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId,
        state: "PENDING",
        action: "WAIT",
      })
    );
  }

  let preview: Awaited<ReturnType<typeof prepareFlowcordiaPreviewEnvironment>>;
  let result: import("@flowcordia/control-plane").ControlPlaneResult<
    import("@flowcordia/control-plane").ProposalCommandValue
  >;
  let proposalMutationStarted = false;
  try {
    preview = await prepareFlowcordiaPreviewEnvironment({
      scope: input.scope,
      workflowId: input.workflowId,
      proposalId,
    });
    const proposalCommand = {
      scope: input.scope,
      proposalId,
      creatorReviewerId: intent.creatorReviewerId,
      workflow: historicalWorkflow.value.workflow,
      expectedBaseCommitSha: currentWorkflow.value.source.commitSha,
      expectedBaseBlobSha: currentWorkflow.value.source.blobSha,
      actorId: input.actorId,
      correlationId,
    };
    let executeProposalMutation: () => Promise<
      import("@flowcordia/control-plane").ControlPlaneResult<
        import("@flowcordia/control-plane").ProposalCommandValue
      >
    >;
    if (sourceIdentity.patches.length > 0) {
      const proposalService = await createSourceAwareProposalCommandService(input.scope);
      executeProposalMutation = () =>
        proposalService.create({
          ...proposalCommand,
          sourcePatches: sourceIdentity.patches,
          sourceDigest: sourceIdentity.digest,
        });
    } else {
      const proposalService = await createProposalCommandService(input.scope);
      executeProposalMutation = () => proposalService.create(proposalCommand);
    }
    const mutationStartTime = new Date();
    const mutationLeaseRenewed = await renewFlowcordiaRollbackMutation({
      intentId: intent.id,
      leaseToken: mutationLeaseToken,
      now: mutationStartTime,
      leaseExpiresAt: leaseExpiresAt(mutationStartTime),
    });
    if (!mutationLeaseRenewed) {
      throw new FlowcordiaRollbackError(
        "proposal_reconciling",
        "This request no longer owns the rollback mutation lease.",
        409,
        false,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId,
          state: "PENDING",
          action: "WAIT",
        })
      );
    }
    proposalMutationStarted = true;
    result = await executeProposalMutation();
    if (!result.success) {
      const failure = classifyFlowcordiaRollbackProposalFailure(result.error);
      throw new FlowcordiaRollbackError(
        failure.code,
        result.error.message,
        failure.status,
        failure.retryable,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId,
          branchName: result.error.github?.proposalBranch,
          pullRequestNumber: result.error.github?.pullRequestNumber,
          state: failure.state,
          action: failure.action,
        })
      );
    }
    if (!result.value.proposal.headSha || result.value.proposal.pullRequestNumber === null) {
      throw new FlowcordiaRollbackError(
        "proposal_failed",
        "The rollback proposal was created without a proven GitHub head and pull request.",
        503,
        true
      );
    }
    const renewalTime = new Date();
    const renewed = await renewFlowcordiaRollbackMutation({
      intentId: intent.id,
      leaseToken: mutationLeaseToken,
      now: renewalTime,
      leaseExpiresAt: leaseExpiresAt(renewalTime),
    });
    if (!renewed) {
      throw new FlowcordiaRollbackError(
        "proposal_reconciling",
        "The rollback proposal exists, but this request no longer owns its mutation lease.",
        409,
        false,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId,
          state: "RECONCILING",
          action: "WAIT",
          pullRequestNumber: result.value.proposal.pullRequestNumber,
        })
      );
    }
    await Promise.all([
      assertFlowcordiaRollbackSourcePatchesAtHead({
        scope: input.scope,
        sourcePatchStore,
        sourcePatches: sourceIdentity.patches,
        proposalHeadSha: result.value.proposal.headSha,
      }),
      assertFlowcordiaRollbackContentAtHead({
        scope: input.scope,
        workflowStore,
        workflow: historicalWorkflow.value.workflow,
        workflowPath: target.workflowPath,
        proposalHeadSha: result.value.proposal.headSha,
      }),
      assertFlowcordiaRollbackDiffAtHead({
        repositoryComparison,
        workflowId: input.workflowId,
        workflowPath: target.workflowPath,
        baseCommitSha: currentWorkflow.value.source.commitSha,
        proposalHeadSha: result.value.proposal.headSha,
        sourcePatches: sourceIdentity.patches,
      }),
    ]);
    const verificationTime = new Date();
    const verificationRenewed = await renewFlowcordiaRollbackMutation({
      intentId: intent.id,
      leaseToken: mutationLeaseToken,
      now: verificationTime,
      leaseExpiresAt: leaseExpiresAt(verificationTime),
    });
    if (!verificationRenewed) {
      throw new FlowcordiaRollbackError(
        "proposal_reconciling",
        "The rollback source set was verified, but this request no longer owns provenance completion.",
        409,
        false,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId,
          state: "RECONCILING",
          action: "WAIT",
          pullRequestNumber: result.value.proposal.pullRequestNumber,
        })
      );
    }
  } catch (error) {
    const normalized =
      error instanceof FlowcordiaRollbackError
        ? error
        : new FlowcordiaRollbackError(
            "proposal_failed",
            "The rollback proposal could not be created safely.",
            503,
            true
          );
    const terminal = !normalized.retryable && normalized.code !== "proposal_reconciling";
    const recovery =
      normalized.recovery ??
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId,
        state: terminal ? "FAILED" : proposalMutationStarted ? "RECONCILING" : "PENDING",
        action: terminal ? "RETRY" : proposalMutationStarted ? "WAIT" : "RETRY",
      });
    const enriched = new FlowcordiaRollbackError(
      normalized.code,
      normalized.message,
      normalized.status,
      normalized.retryable,
      recovery
    );
    const recorded = await recordFlowcordiaRollbackIntentFailure({
      intentId: intent.id,
      code: enriched.code,
      message: enriched.message,
      terminal,
      leaseToken: mutationLeaseToken,
    });
    if (!recorded) {
      throw new FlowcordiaRollbackError(
        "proposal_reconciling",
        "This request lost the rollback mutation lease. Refresh the exact governed attempt.",
        409,
        false,
        rollbackRecovery({
          workflowId: input.workflowId,
          proposalId,
          state: "RECONCILING",
          action: "WAIT",
        })
      );
    }
    if (terminal && enriched.code !== "rollback_retry_required") {
      throw new FlowcordiaRollbackError(
        "rollback_retry_required",
        `${enriched.message} Review and abandon the failed attempt before explicitly retrying.`,
        409,
        false,
        recovery
      );
    }
    throw enriched;
  }

  try {
    await completeFlowcordiaRollbackIntent({
      intentId: intent.id,
      targetHeadSha: result.value.proposal.headSha,
      pullRequestNumber: result.value.proposal.pullRequestNumber,
      sourcePatchCount: sourceIdentity.patches.length,
      leaseToken: mutationLeaseToken,
    });
  } catch (error) {
    const message =
      error instanceof FlowcordiaRollbackError
        ? error.message
        : "The rollback proposal exists, but its durable provenance could not be completed.";
    throw new FlowcordiaRollbackError(
      "proposal_reconciling",
      `${message} Refresh the exact governed attempt.`,
      409,
      false,
      rollbackRecovery({
        workflowId: input.workflowId,
        proposalId,
        state: "RECONCILING",
        action: "WAIT",
        pullRequestNumber: result.value.proposal.pullRequestNumber,
      })
    );
  }

  return {
    proposalId: result.value.proposal.proposalId,
    state: result.value.proposal.state,
    headSha: result.value.proposal.headSha,
    pullRequestNumber: result.value.proposal.pullRequestNumber,
    sourcePatchCount: sourceIdentity.patches.length,
    resumedIntent: intent.resumed,
    targetProposalId: target.proposalId,
    targetMergeCommitSha: target.mergeCommitSha,
    currentProposalId: current.proposalId,
    currentMergeCommitSha: current.mergeCommitSha,
    preview,
  };
}
