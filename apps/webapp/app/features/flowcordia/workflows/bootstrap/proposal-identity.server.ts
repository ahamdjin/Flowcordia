import { createHash } from "node:crypto";
import { workflowSha256 } from "@flowcordia/control-plane";
import { isValidObjectId, isValidProposalId } from "@flowcordia/github-proposals";
import type { WorkflowDefinition } from "@flowcordia/workflow";

const WORKFLOW_PREFIX_LENGTH = 28;
const IDENTITY_DIGEST_LENGTH = 32;

export function flowcordiaBootstrapProposalId(input: {
  workflow: WorkflowDefinition;
  baseCommitSha: string;
}): string {
  if (!isValidObjectId(input.baseCommitSha)) {
    throw new TypeError("Base commit SHA has an invalid format.");
  }
  const digest = createHash("sha256")
    .update(input.baseCommitSha, "utf8")
    .update("\0", "utf8")
    .update(workflowSha256(input.workflow), "utf8")
    .digest("hex")
    .slice(0, IDENTITY_DIGEST_LENGTH);
  const proposalId = `bootstrap-${input.workflow.id.slice(0, WORKFLOW_PREFIX_LENGTH)}-${digest}`;
  if (!isValidProposalId(proposalId)) {
    throw new TypeError("Bootstrap proposal ID has an invalid format.");
  }
  return proposalId;
}
