import { workflowSha256 } from "@flowcordia/control-plane";
import type {
  GitHubRepositorySourcePatch,
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
import { createProposalCommandService } from "../../proposals/service.server";
import { createSourceAwareProposalCommandService } from "../../proposals/source-command.server";
import { canonicalSourcePatchIdentity } from "../../proposals/source-patch-identity";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import type { WorkflowIndexScope } from "../index/types";
import { prepareFlowcordiaPreviewEnvironment } from "../preview/environment.server";
import { flowcordiaRollbackProposalId } from "./contract";
import { FlowcordiaRollbackError } from "./errors";
import {
  completeFlowcordiaRollbackIntent,
  recordFlowcordiaRollbackIntentFailure,
  reserveFlowcordiaRollbackIntent,
} from "./intent.server";
import { findFlowcordiaRollbackTarget, queryFlowcordiaRollbackHistory } from "./repository.server";

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

async function rollbackSourcePatches(input: {
  scope: WorkflowIndexScope;
  workflow: WorkflowDefinition;
  targetRevision: string;
  currentRevision: string;
}): Promise<GitHubRepositorySourcePatch[]> {
  const { functionCatalog, sourcePatchStore } = await createWorkflowIndexGitHubGateway(input.scope);
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
  actorId: string;
  creatorReviewerId: string | null;
}) {
  const { workflowStore } = await createWorkflowIndexGitHubGateway(input.scope);
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
  if (target.desiredWorkflowSha256 === currentWorkflowSha256) {
    throw new FlowcordiaRollbackError(
      "no_changes",
      "The selected governed proposal has the same workflow definition as the live branch.",
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

  const proposalId = flowcordiaRollbackProposalId({
    workflowId: input.workflowId,
    currentProposalId: current.proposalId,
    currentMergeCommitSha: current.mergeCommitSha,
    targetProposalId: target.proposalId,
    targetMergeCommitSha: target.mergeCommitSha,
    baseCommitSha: currentWorkflow.value.source.commitSha,
  });
  const correlationId = `rollback:${randomUUID()}`;
  const intent = await reserveFlowcordiaRollbackIntent({
    scope: input.scope,
    workflowId: input.workflowId,
    sourceProposalId: target.proposalId,
    sourceHeadSha: target.headSha,
    sourceMergeCommitSha: target.mergeCommitSha,
    currentProposalId: current.proposalId,
    currentHeadSha: current.headSha,
    currentMergeCommitSha: current.mergeCommitSha,
    baseCommitSha: currentWorkflow.value.source.commitSha,
    baseBlobSha: currentWorkflow.value.source.blobSha,
    targetProposalId: proposalId,
    reason: input.reason,
    actorId: input.actorId,
    correlationId,
  });

  let preview: Awaited<ReturnType<typeof prepareFlowcordiaPreviewEnvironment>>;
  let result: import("@flowcordia/control-plane").ControlPlaneResult<
    import("@flowcordia/control-plane").ProposalCommandValue
  >;
  try {
    preview = await prepareFlowcordiaPreviewEnvironment({
      scope: input.scope,
      workflowId: input.workflowId,
      proposalId,
    });
    const proposalCommand = {
      scope: input.scope,
      proposalId,
      creatorReviewerId: input.creatorReviewerId,
      workflow: historicalWorkflow.value.workflow,
      expectedBaseCommitSha: currentWorkflow.value.source.commitSha,
      expectedBaseBlobSha: currentWorkflow.value.source.blobSha,
      actorId: input.actorId,
      correlationId,
    };
    result =
      sourceIdentity.patches.length > 0
        ? await (
            await createSourceAwareProposalCommandService(input.scope)
          ).create({
            ...proposalCommand,
            sourcePatches: sourceIdentity.patches,
            sourceDigest: sourceIdentity.digest,
          })
        : await (await createProposalCommandService(input.scope)).create(proposalCommand);
    if (!result.success) {
      throw new FlowcordiaRollbackError(
        "proposal_failed",
        result.error.message,
        result.error.retryable ? 503 : 409,
        result.error.retryable
      );
    }
    if (!result.value.proposal.headSha) {
      throw new FlowcordiaRollbackError(
        "proposal_failed",
        "The rollback proposal was created without a proven GitHub head.",
        503,
        true
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
    await recordFlowcordiaRollbackIntentFailure({
      intentId: intent.id,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
    });
    throw normalized;
  }

  try {
    await completeFlowcordiaRollbackIntent({
      intentId: intent.id,
      targetHeadSha: result.value.proposal.headSha,
      pullRequestNumber: result.value.proposal.pullRequestNumber,
      sourcePatchCount: sourceIdentity.patches.length,
    });
  } catch {
    throw new FlowcordiaRollbackError(
      "proposal_failed",
      "The rollback proposal exists, but its durable provenance could not be completed. Retry the same rollback command.",
      503,
      true
    );
  }

  return {
    proposalId: result.value.proposal.proposalId,
    state: result.value.proposal.state,
    headSha: result.value.proposal.headSha,
    pullRequestNumber: result.value.proposal.pullRequestNumber,
    sourcePatchCount: sourceIdentity.patches.length,
    targetProposalId: target.proposalId,
    targetMergeCommitSha: target.mergeCommitSha,
    currentProposalId: current.proposalId,
    currentMergeCommitSha: current.mergeCommitSha,
    preview,
  };
}
