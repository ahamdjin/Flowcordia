import { isValidObjectId, isValidProposalId } from "@flowcordia/github-proposals";
import { isValidWorkflowId } from "@flowcordia/github-workflows";

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTITY_KEYS = new Set(["schemaVersion", "workflowId", "proposalId", "mergeCommitSha"]);

export interface FlowcordiaProductionRunIdentity {
  workflowId: string;
  proposalId: string;
  mergeCommitSha: string;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function validIdentity(value: FlowcordiaProductionRunIdentity): boolean {
  return (
    isValidWorkflowId(value.workflowId) &&
    isValidProposalId(value.proposalId) &&
    isValidObjectId(value.mergeCommitSha)
  );
}

function assertIdentity(value: FlowcordiaProductionRunIdentity): void {
  if (!validIdentity(value)) {
    throw new TypeError("Flowcordia production run identity is invalid.");
  }
}

export function flowcordiaProductionRunIdempotencyPrefix(
  identity: FlowcordiaProductionRunIdentity
): string {
  assertIdentity(identity);
  return `flowcordia-production:${identity.workflowId}:${identity.proposalId}:${identity.mergeCommitSha}:`;
}

export function flowcordiaProductionRunIdempotencyKey(
  identity: FlowcordiaProductionRunIdentity,
  requestId: string
): string {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new TypeError("Flowcordia production request ID is invalid.");
  }
  return `${flowcordiaProductionRunIdempotencyPrefix(identity)}${requestId.toLowerCase()}`;
}

export function flowcordiaProductionRunSeedMetadata(identity: FlowcordiaProductionRunIdentity) {
  assertIdentity(identity);
  return {
    schemaVersion: "0.1" as const,
    workflowId: identity.workflowId,
    proposalId: identity.proposalId,
    mergeCommitSha: identity.mergeCommitSha,
  };
}

export function presentFlowcordiaProductionRunIdentity(
  value: string | null
): FlowcordiaProductionRunIdentity | null {
  if (!value || value.length > 256 * 1024) return null;
  try {
    const root = record(JSON.parse(value));
    const candidate = record(root?.flowcordiaProduction);
    if (
      !candidate ||
      Object.keys(candidate).some((key) => !IDENTITY_KEYS.has(key)) ||
      candidate.schemaVersion !== "0.1" ||
      typeof candidate.workflowId !== "string" ||
      typeof candidate.proposalId !== "string" ||
      typeof candidate.mergeCommitSha !== "string"
    ) {
      return null;
    }
    const identity = {
      workflowId: candidate.workflowId,
      proposalId: candidate.proposalId,
      mergeCommitSha: candidate.mergeCommitSha,
    };
    return validIdentity(identity) ? identity : null;
  } catch {
    return null;
  }
}

export function isSameFlowcordiaProductionRunIdentity(
  left: FlowcordiaProductionRunIdentity | null,
  right: FlowcordiaProductionRunIdentity
): boolean {
  return (
    left?.workflowId === right.workflowId &&
    left.proposalId === right.proposalId &&
    left.mergeCommitSha === right.mergeCommitSha
  );
}

export function selectFlowcordiaProductionRun<Run extends { metadata: string | null }>(
  runs: readonly Run[],
  expected: FlowcordiaProductionRunIdentity
): Run | null {
  return (
    runs.find((run) =>
      isSameFlowcordiaProductionRunIdentity(
        presentFlowcordiaProductionRunIdentity(run.metadata),
        expected
      )
    ) ?? null
  );
}
