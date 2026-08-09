import { randomUUID } from "node:crypto";
import { workflowSha256 } from "@flowcordia/control-plane";
import type { WorkflowDefinition } from "@flowcordia/workflow";
import { resolveCreatorReviewerId, resolveControlPlaneScope } from "../../proposals/scope.server";
import { createProposalCommandService } from "../../proposals/service.server";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import { getWorkflowIndexEntry } from "../index/repository.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import type { WorkflowIndexEntryRecord, WorkflowIndexScope } from "../index/types";
import type {
  StudioV2RepositoryProjection,
  StudioV2RepositoryProposalProjection,
} from "./repository-contract";
import type { StudioV2WorkspaceProjection, StudioV2WorkspaceScope } from "./workspace-contract";
import { getStudioV2Workspace } from "./workspace-repository.server";
import { saveStudioV2Workspace } from "./workspace-service.server";

export class StudioV2RepositoryError extends Error {
  constructor(
    readonly code:
      | "repository_unavailable"
      | "workflow_not_indexed"
      | "invalid_repository_workflow"
      | "stale_repository_source"
      | "workspace_not_found"
      | "workspace_conflict"
      | "no_repository_changes"
      | "proposal_failed",
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "StudioV2RepositoryError";
  }
}

function assertValidEntry(
  entry: WorkflowIndexEntryRecord | null,
  workflowId: string
): WorkflowIndexEntryRecord & { canonicalSha256: string } {
  if (!entry) {
    throw new StudioV2RepositoryError(
      "workflow_not_indexed",
      `Workflow ${workflowId} is not present in the synchronized repository index.`
    );
  }
  if (entry.status !== "VALID" || !entry.canonicalSha256) {
    throw new StudioV2RepositoryError(
      "invalid_repository_workflow",
      entry.failureMessage ?? "The indexed repository workflow is invalid."
    );
  }
  return entry as WorkflowIndexEntryRecord & { canonicalSha256: string };
}

async function exactRepositoryWorkflow(
  scope: WorkflowIndexScope,
  entry: WorkflowIndexEntryRecord & { canonicalSha256: string }
): Promise<WorkflowDefinition> {
  const { workflowStore } = await createWorkflowIndexGitHubGateway(scope);
  const result = await workflowStore.read({
    scope,
    workflowId: entry.workflowId,
    revision: entry.sourceCommitSha,
  });
  if (!result.success) {
    throw new StudioV2RepositoryError(
      result.error.retryable ? "repository_unavailable" : "stale_repository_source",
      result.error.retryable
        ? "The repository workflow is temporarily unavailable."
        : "The indexed workflow can no longer be proven against GitHub. Synchronize first.",
      result.error.retryable
    );
  }
  if (
    result.value.source.commitSha !== entry.sourceCommitSha ||
    result.value.source.blobSha !== entry.sourceBlobSha ||
    result.value.source.path !== entry.workflowPath ||
    result.value.workflow.id !== entry.workflowId ||
    workflowSha256(result.value.workflow) !== entry.canonicalSha256
  ) {
    throw new StudioV2RepositoryError(
      "stale_repository_source",
      "The indexed workflow no longer matches its exact GitHub source. Synchronize first."
    );
  }
  return result.value.workflow;
}

async function source(input: { organizationId: string; projectId: string; workflowId: string }) {
  const scope = await resolveWorkflowIndexScope(input);
  const entry = assertValidEntry(
    await getWorkflowIndexEntry(scope, input.workflowId),
    input.workflowId
  );
  return { scope, entry, workflow: await exactRepositoryWorkflow(scope, entry) };
}

export async function loadExactStudioV2RepositoryWorkflow(input: {
  organizationId: string;
  projectId: string;
  workflowId: string;
}): Promise<WorkflowDefinition> {
  return (await source(input)).workflow;
}

export async function queryStudioV2Repository(input: {
  organizationId: string;
  projectId: string;
  workflowId: string;
  localDocumentSha256: string;
}): Promise<StudioV2RepositoryProjection> {
  const scope = await resolveWorkflowIndexScope(input);
  const entry = assertValidEntry(
    await getWorkflowIndexEntry(scope, input.workflowId),
    input.workflowId
  );
  return {
    repository: `${scope.repository.owner}/${scope.repository.name}`,
    branch: scope.repository.branch,
    workflowId: entry.workflowId,
    workflowPath: entry.workflowPath,
    sourceCommitSha: entry.sourceCommitSha,
    sourceBlobSha: entry.sourceBlobSha,
    canonicalSha256: entry.canonicalSha256,
    status: input.localDocumentSha256 === entry.canonicalSha256 ? "SYNCHRONIZED" : "MODIFIED",
  };
}

export async function pullStudioV2RepositoryWorkflow(input: {
  organizationId: string;
  projectId: string;
  workflowId: string;
  workspaceScope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
  actorId: string;
}): Promise<{
  workspace: StudioV2WorkspaceProjection;
  repository: StudioV2RepositoryProjection;
}> {
  const { scope, entry, workflow } = await source(input);
  const workspace = await saveStudioV2Workspace({
    scope: input.workspaceScope,
    expectedVersion: input.expectedVersion,
    document: workflow,
    actorId: input.actorId,
  });
  return {
    workspace,
    repository: {
      repository: `${scope.repository.owner}/${scope.repository.name}`,
      branch: scope.repository.branch,
      workflowId: entry.workflowId,
      workflowPath: entry.workflowPath,
      sourceCommitSha: entry.sourceCommitSha,
      sourceBlobSha: entry.sourceBlobSha,
      canonicalSha256: entry.canonicalSha256,
      status: "SYNCHRONIZED",
    },
  };
}

export async function pushStudioV2RepositoryWorkflow(input: {
  organizationId: string;
  projectId: string;
  workflowId: string;
  workspaceScope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
  actorId: string;
}): Promise<StudioV2RepositoryProposalProjection> {
  const workspace = await getStudioV2Workspace(input.workspaceScope);
  if (!workspace) {
    throw new StudioV2RepositoryError(
      "workspace_not_found",
      "The Studio V2 workspace was not found."
    );
  }
  if (workspace.version !== input.expectedVersion) {
    throw new StudioV2RepositoryError(
      "workspace_conflict",
      "The workspace changed before the repository push began. Reload and try again."
    );
  }

  const indexScope = await resolveWorkflowIndexScope(input);
  const entry = assertValidEntry(
    await getWorkflowIndexEntry(indexScope, input.workflowId),
    input.workflowId
  );
  await exactRepositoryWorkflow(indexScope, entry);
  if (workspace.documentSha256 === entry.canonicalSha256) {
    throw new StudioV2RepositoryError(
      "no_repository_changes",
      "The workspace already matches the synchronized repository workflow."
    );
  }

  const proposalId = `studio-v2-${workspace.publicId.replaceAll("-", "")}-v${workspace.version}`;
  const controlScope = await resolveControlPlaneScope(input);
  const result = await (
    await createProposalCommandService(controlScope)
  ).create({
    scope: controlScope,
    proposalId,
    creatorReviewerId: await resolveCreatorReviewerId(input.actorId),
    workflow: workspace.document,
    expectedBaseCommitSha: entry.sourceCommitSha,
    expectedBaseBlobSha: entry.sourceBlobSha,
    actorId: input.actorId,
    correlationId: `studio-v2:${randomUUID()}`,
  });
  if (!result.success) {
    throw new StudioV2RepositoryError(
      "proposal_failed",
      result.error.message,
      result.error.retryable
    );
  }

  const proposal = result.value.proposal;
  return {
    proposalId: proposal.proposalId,
    state: proposal.state,
    pullRequestNumber: proposal.pullRequestNumber,
    headSha: proposal.headSha,
    url:
      proposal.pullRequestNumber === null
        ? null
        : `https://github.com/${controlScope.repository.owner}/${controlScope.repository.name}/pull/${proposal.pullRequestNumber}`,
    resumed: result.value.resumed,
  };
}
