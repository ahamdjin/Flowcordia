import { buildGeneratedWorkflowPath } from "@flowcordia/github-workflows";
import { compileWorkflowToTriggerTask } from "@flowcordia/runtime";
import { randomUUID } from "node:crypto";
import { createProposalCommandService } from "../../proposals/service.server";
import { createWorkflowIndexGitHubGateway } from "../index/github.server";
import type { WorkflowIndexScope } from "../index/types";
import { prepareFlowcordiaPreviewEnvironment } from "../preview/environment.server";
import { createFlowcordiaStarterWorkflow } from "./contract";
import { FlowcordiaBootstrapError } from "./errors";
import { flowcordiaBootstrapProposalId } from "./proposal-identity.server";

function repositoryReadError(input: {
  retryable: boolean;
  target: "workflow" | "generated task";
}): FlowcordiaBootstrapError {
  return new FlowcordiaBootstrapError(
    "repository_unavailable",
    `The target ${input.target} path could not be verified safely.`,
    input.retryable ? 503 : 409,
    input.retryable
  );
}

export async function bootstrapFlowcordiaRepository(input: {
  scope: WorkflowIndexScope;
  workflowId: string;
  name: string;
  description?: string;
  actorId: string;
  creatorReviewerId: string | null;
}) {
  const gateway = await createWorkflowIndexGitHubGateway(input.scope);
  const catalog = await gateway.catalog.discover({ scope: input.scope });
  if (!catalog.success) {
    throw new FlowcordiaBootstrapError(
      "repository_unavailable",
      catalog.error.message,
      catalog.error.retryable ? 503 : 409,
      catalog.error.retryable
    );
  }
  if (catalog.value.entries.length > 0) {
    throw new FlowcordiaBootstrapError(
      "repository_not_empty",
      "Repository bootstrap is available only before the first Flowcordia workflow exists.",
      409,
      false
    );
  }

  const [existingWorkflow, existingArtifact] = await Promise.all([
    gateway.workflowStore.read({
      scope: input.scope,
      workflowId: input.workflowId,
      revision: catalog.value.commitSha,
    }),
    gateway.workflowStore.readGeneratedArtifact({
      scope: input.scope,
      workflowId: input.workflowId,
      revision: catalog.value.commitSha,
    }),
  ]);
  if (existingWorkflow.success || existingArtifact.success) {
    throw new FlowcordiaBootstrapError(
      "workflow_conflict",
      "The workflow ID already owns a workflow or generated task at the production commit.",
      409,
      false
    );
  }
  if (existingWorkflow.error.code !== "not_found") {
    throw repositoryReadError({
      retryable: existingWorkflow.error.retryable,
      target: "workflow",
    });
  }
  if (existingArtifact.error.code !== "not_found") {
    throw repositoryReadError({
      retryable: existingArtifact.error.retryable,
      target: "generated task",
    });
  }

  const workflow = createFlowcordiaStarterWorkflow({
    workflowId: input.workflowId,
    name: input.name,
    description: input.description,
  });
  const compilation = compileWorkflowToTriggerTask(workflow);
  if (!compilation.success) {
    throw new FlowcordiaBootstrapError(
      "invalid_input",
      compilation.issues[0]?.message ?? "The starter workflow could not be compiled.",
      400,
      false
    );
  }

  const proposalId = flowcordiaBootstrapProposalId({
    workflow,
    baseCommitSha: catalog.value.commitSha,
  });
  const preview = await prepareFlowcordiaPreviewEnvironment({
    scope: input.scope,
    workflowId: workflow.id,
    proposalId,
  });
  const result = await (
    await createProposalCommandService(input.scope)
  ).create({
    scope: input.scope,
    proposalId,
    creatorReviewerId: input.creatorReviewerId,
    workflow,
    expectedBaseCommitSha: catalog.value.commitSha,
    expectedBaseBlobSha: null,
    actorId: input.actorId,
    correlationId: `bootstrap:${randomUUID()}`,
  });
  if (!result.success) {
    throw new FlowcordiaBootstrapError(
      "proposal_failed",
      result.error.message,
      result.error.retryable ? 503 : 409,
      result.error.retryable
    );
  }

  return {
    workflow,
    proposalId: result.value.proposal.proposalId,
    proposalState: result.value.proposal.state,
    headSha: result.value.proposal.headSha,
    pullRequestNumber: result.value.proposal.pullRequestNumber,
    baseCommitSha: catalog.value.commitSha,
    generatedPath: buildGeneratedWorkflowPath(workflow.id),
    preview,
  };
}
