import {
  FLOWCORDIA_PROPOSAL_CLOSURE_SCHEMA_VERSION,
  MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS,
} from "@flowcordia/github-proposals";
import { isValidWorkflowId } from "@flowcordia/github-workflows";

import type { ProposalClosureIdentity, WorkflowProposalAggregate } from "../types.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type ProposalClosureIdentityState =
  | { state: "RECORDED"; identity: ProposalClosureIdentity }
  | { state: "NOT_RECORDED"; issues: readonly string[] }
  | { state: "INVALID"; issues: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeProposalClosureIdentity(
  value: unknown,
  rootWorkflowId: string
): { success: true; identity: ProposalClosureIdentity } | { success: false; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(value))
    return { success: false, issues: ["Proposal closure identity is required."] };
  if (value.schemaVersion !== FLOWCORDIA_PROPOSAL_CLOSURE_SCHEMA_VERSION) {
    issues.push("Proposal closure schema version is unsupported.");
  }
  if (typeof value.digest !== "string" || !SHA256_PATTERN.test(value.digest)) {
    issues.push("Proposal closure digest is invalid.");
  }
  if (!Array.isArray(value.workflowIds)) {
    issues.push("Proposal closure workflow IDs are required.");
  } else {
    if (
      value.workflowIds.length < 1 ||
      value.workflowIds.length > MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS
    ) {
      issues.push(
        `Proposal closure must contain between 1 and ${MAX_FLOWCORDIA_PROPOSAL_CLOSURE_WORKFLOWS} workflows.`
      );
    }
    const ids = value.workflowIds;
    if (
      ids.some((workflowId) => typeof workflowId !== "string" || !isValidWorkflowId(workflowId))
    ) {
      issues.push("Proposal closure contains an invalid workflow ID.");
    }
    if (new Set(ids).size !== ids.length) {
      issues.push("Proposal closure workflow IDs must be unique.");
    }
    if (ids.some((workflowId, index) => index > 0 && ids[index - 1] >= workflowId)) {
      issues.push("Proposal closure workflow IDs must be strictly sorted.");
    }
    if (!ids.includes(rootWorkflowId)) {
      issues.push("Proposal closure does not contain the proposal root workflow.");
    }
  }
  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    identity: {
      schemaVersion: FLOWCORDIA_PROPOSAL_CLOSURE_SCHEMA_VERSION,
      digest: value.digest as string,
      workflowIds: [...(value.workflowIds as string[])],
    },
  };
}

export function proposalClosureIdentityState(
  proposal: Pick<
    WorkflowProposalAggregate,
    "workflowId" | "closureSchemaVersion" | "closureDigest" | "closureWorkflowIds"
  >
): ProposalClosureIdentityState {
  if (
    proposal.closureSchemaVersion === null &&
    proposal.closureDigest === null &&
    proposal.closureWorkflowIds.length === 0
  ) {
    return {
      state: "NOT_RECORDED",
      issues: ["Proposal predates durable workflow-closure identity."],
    };
  }
  const normalized = normalizeProposalClosureIdentity(
    {
      schemaVersion: proposal.closureSchemaVersion,
      digest: proposal.closureDigest,
      workflowIds: proposal.closureWorkflowIds,
    },
    proposal.workflowId
  );
  return normalized.success
    ? { state: "RECORDED", identity: normalized.identity }
    : { state: "INVALID", issues: normalized.issues };
}
