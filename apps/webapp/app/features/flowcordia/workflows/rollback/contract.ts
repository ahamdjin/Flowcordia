import { isValidObjectId, isValidProposalId } from "@flowcordia/github-proposals";
import { isValidWorkflowId } from "@flowcordia/github-workflows";
import { createHash } from "node:crypto";

export interface FlowcordiaRollbackProposalIdentityInput {
  workflowId: string;
  currentProposalId: string;
  currentMergeCommitSha: string;
  targetProposalId: string;
  targetMergeCommitSha: string;
  baseCommitSha: string;
}

function assertRollbackIdentity(input: FlowcordiaRollbackProposalIdentityInput): void {
  if (
    !isValidWorkflowId(input.workflowId) ||
    !isValidProposalId(input.currentProposalId) ||
    !isValidProposalId(input.targetProposalId) ||
    !isValidObjectId(input.currentMergeCommitSha) ||
    !isValidObjectId(input.targetMergeCommitSha) ||
    !isValidObjectId(input.baseCommitSha) ||
    input.currentProposalId === input.targetProposalId ||
    input.currentMergeCommitSha === input.targetMergeCommitSha
  ) {
    throw new TypeError("Flowcordia rollback proposal identity is invalid.");
  }
}

export function flowcordiaRollbackProposalId(
  input: FlowcordiaRollbackProposalIdentityInput
): string {
  assertRollbackIdentity(input);
  const digest = createHash("sha256")
    .update(
      [
        input.workflowId,
        input.currentProposalId,
        input.currentMergeCommitSha,
        input.targetProposalId,
        input.targetMergeCommitSha,
        input.baseCommitSha,
      ].join("\0"),
      "utf8"
    )
    .digest("hex")
    .slice(0, 16);
  return `rollback-${input.workflowId}-to-${input.targetMergeCommitSha.slice(0, 8)}-from-${input.currentMergeCommitSha.slice(0, 8)}-${digest}`;
}
