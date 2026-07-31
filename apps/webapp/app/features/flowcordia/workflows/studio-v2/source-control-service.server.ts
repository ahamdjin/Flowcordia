import { randomUUID } from "node:crypto";
import {
  OctokitGitHubRepositoryClient,
  buildWorkflowPath,
  type FlowcordiaOctokitLike,
} from "@flowcordia/github-workflows";
import { getFlowcordiaInstallationOctokit } from "../../github/binding.server";
import { createProposalCommandService } from "../../proposals/service.server";
import { resolveCreatorReviewerId } from "../../proposals/scope.server";
import { resolveWorkflowIndexScope } from "../index/scope.server";
import { StudioV2ReleaseError } from "./release-contract";
import { getStudioV2ReleaseByPublicId } from "./release-repository.server";
import {
  StudioV2SourceControlError,
  type StudioV2SourceControlProjection,
} from "./source-control-contract";
import type { StudioV2WorkspaceScope } from "./workspace-contract";

function sourceControlFailure(input: {
  code?: string;
  message: string;
  retryable?: boolean;
}): StudioV2SourceControlError {
  const conflict = ["conflict", "concurrency_conflict"].includes(input.code ?? "");
  return new StudioV2SourceControlError(
    conflict ? "source_control_conflict" : "source_control_failed",
    input.message,
    input.retryable ?? conflict
  );
}

export async function pushStudioV2ReleaseToGitHub(input: {
  scope: StudioV2WorkspaceScope;
  releasePublicId: string;
  actorId: string;
}): Promise<StudioV2SourceControlProjection> {
  const release = await getStudioV2ReleaseByPublicId(input.scope, input.releasePublicId);
  if (!release) {
    throw new StudioV2ReleaseError(
      "release_not_found",
      "The immutable Studio release to push was not found."
    );
  }

  let repositoryScope;
  try {
    repositoryScope = await resolveWorkflowIndexScope({
      organizationId: input.scope.organizationId,
      projectId: input.scope.projectId,
    });
  } catch (error) {
    throw new StudioV2SourceControlError(
      "source_control_not_configured",
      error instanceof Error
        ? error.message
        : "Connect a GitHub repository before pushing this Studio release."
    );
  }

  try {
    const octokit = await getFlowcordiaInstallationOctokit(repositoryScope);
    const client = new OctokitGitHubRepositoryClient(
      octokit as unknown as FlowcordiaOctokitLike
    );
    const base = await client.resolveRevision({
      repository: repositoryScope.repository,
      revision: repositoryScope.repository.branch,
    });
    const file = await client.getFile({
      repository: repositoryScope.repository,
      path: buildWorkflowPath(release.document.id),
      commitSha: base.commitSha,
    });

    const proposalId = randomUUID();
    const service = await createProposalCommandService(repositoryScope);
    const result = await service.create({
      scope: repositoryScope,
      proposalId,
      creatorReviewerId: await resolveCreatorReviewerId(input.actorId),
      workflow: release.document,
      expectedBaseCommitSha: base.commitSha,
      expectedBaseBlobSha: file.found ? file.blobSha : null,
      actorId: input.actorId,
      correlationId: `studio-v2-push:${proposalId}`,
    });

    if (!result.success) {
      throw sourceControlFailure({
        code: result.error.code,
        message: result.error.message,
        retryable: result.error.retryable,
      });
    }

    const proposal = result.value.proposal;
    if (
      !proposal.headSha ||
      proposal.pullRequestNumber === null ||
      !proposal.pullRequestUrl ||
      !["DRAFT", "READY", "MERGED"].includes(proposal.state)
    ) {
      throw new StudioV2SourceControlError(
        "source_control_failed",
        "GitHub accepted the proposal but did not return a complete branch and pull request identity.",
        true
      );
    }

    return {
      proposalId: proposal.proposalId,
      branch: proposal.proposalBranch,
      headSha: proposal.headSha,
      pullRequestNumber: proposal.pullRequestNumber,
      pullRequestUrl: proposal.pullRequestUrl,
      state: proposal.state as StudioV2SourceControlProjection["state"],
    };
  } catch (error) {
    if (error instanceof StudioV2SourceControlError) throw error;
    throw new StudioV2SourceControlError(
      "source_control_failed",
      error instanceof Error
        ? error.message
        : "Flowcordia could not push this Studio release to GitHub.",
      true
    );
  }
}
