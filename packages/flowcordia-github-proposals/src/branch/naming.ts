import { isValidWorkflowId } from "@flowcordia/github-workflows";

const PROPOSAL_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{6,78}[A-Za-z0-9])$/;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export function isValidProposalId(proposalId: string): boolean {
  return PROPOSAL_ID_PATTERN.test(proposalId);
}

export function isValidObjectId(objectId: string): boolean {
  return OBJECT_ID_PATTERN.test(objectId);
}

export function buildProposalBranch(workflowId: string, proposalId: string): string {
  if (!isValidWorkflowId(workflowId)) {
    throw new TypeError("Workflow ID has an invalid format.");
  }
  if (!isValidProposalId(proposalId)) {
    throw new TypeError("Proposal ID has an invalid format.");
  }

  const branch = `flowcordia/proposals/${workflowId}/${proposalId}`;
  if (branch.length > 255) {
    throw new TypeError("Proposal branch exceeds the Git ref length limit.");
  }
  return branch;
}
