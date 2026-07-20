import { isValidObjectId, isValidProposalId } from "@flowcordia/github-proposals";
import { isValidWorkflowId } from "@flowcordia/github-workflows";
import { createHash } from "node:crypto";

export interface FlowcordiaRollbackProposalIdentityInput {
  tenantId: string;
  projectId: string;
  githubAppInstallationId: string;
  installationId: number;
  repositoryId: string;
  repositoryGithubId: string;
  repositoryOwner: string;
  repositoryName: string;
  baseBranch: string;
  workflowId: string;
  currentProposalId: string;
  currentHeadSha: string;
  currentMergeCommitSha: string;
  targetProposalId: string;
  targetHeadSha: string;
  targetMergeCommitSha: string;
  baseCommitSha: string;
  baseBlobSha: string;
}

function assertRollbackIdentity(input: FlowcordiaRollbackProposalIdentityInput): void {
  if (
    ![
      input.tenantId,
      input.projectId,
      input.githubAppInstallationId,
      input.repositoryId,
      input.repositoryOwner,
      input.repositoryName,
      input.baseBranch,
    ].every(
      (value) => value.length >= 1 && value.length <= 255 && !/[\u0000-\u001f\u007f]/.test(value)
    ) ||
    !Number.isSafeInteger(input.installationId) ||
    input.installationId <= 0 ||
    !/^[1-9][0-9]{0,18}$/.test(input.repositoryGithubId) ||
    !isValidWorkflowId(input.workflowId) ||
    !isValidProposalId(input.currentProposalId) ||
    !isValidProposalId(input.targetProposalId) ||
    !isValidObjectId(input.currentHeadSha) ||
    !isValidObjectId(input.currentMergeCommitSha) ||
    !isValidObjectId(input.targetHeadSha) ||
    !isValidObjectId(input.targetMergeCommitSha) ||
    !isValidObjectId(input.baseCommitSha) ||
    !isValidObjectId(input.baseBlobSha) ||
    input.currentProposalId === input.targetProposalId ||
    input.currentMergeCommitSha === input.targetMergeCommitSha
  ) {
    throw new TypeError("Flowcordia rollback proposal identity is invalid.");
  }
}

export function flowcordiaRollbackKey(input: FlowcordiaRollbackProposalIdentityInput): string {
  assertRollbackIdentity(input);
  return createHash("sha256")
    .update(
      [
        input.tenantId,
        input.projectId,
        input.githubAppInstallationId,
        String(input.installationId),
        input.repositoryId,
        input.repositoryGithubId,
        input.repositoryOwner,
        input.repositoryName,
        input.baseBranch,
        input.workflowId,
        input.currentProposalId,
        input.currentHeadSha,
        input.currentMergeCommitSha,
        input.targetProposalId,
        input.targetHeadSha,
        input.targetMergeCommitSha,
        input.baseCommitSha,
        input.baseBlobSha,
      ].join("\0"),
      "utf8"
    )
    .digest("hex");
}

export function flowcordiaRollbackProposalId(input: {
  rollbackKey: string;
  attemptNumber: number;
}): string {
  if (!/^[0-9a-f]{64}$/.test(input.rollbackKey)) {
    throw new TypeError("Flowcordia rollback key is invalid.");
  }
  if (
    !Number.isSafeInteger(input.attemptNumber) ||
    input.attemptNumber < 1 ||
    input.attemptNumber > 99_999
  ) {
    throw new TypeError("Flowcordia rollback attempt number is invalid.");
  }
  const proposalId = `rollback-${input.rollbackKey}-a${input.attemptNumber}`;
  if (!isValidProposalId(proposalId)) {
    throw new TypeError("Flowcordia rollback proposal identity exceeds governed bounds.");
  }
  return proposalId;
}
