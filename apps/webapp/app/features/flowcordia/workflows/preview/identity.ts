import { isValidObjectId, isValidProposalId } from "@flowcordia/github-proposals";
import { isValidWorkflowId } from "@flowcordia/github-workflows";

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTITY_KEYS = new Set(["schemaVersion", "workflowId", "proposalId", "headSha"]);

export interface FlowcordiaPreviewRunIdentity {
  workflowId: string;
  proposalId: string;
  headSha: string;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function validIdentity(value: FlowcordiaPreviewRunIdentity): boolean {
  return (
    isValidWorkflowId(value.workflowId) &&
    isValidProposalId(value.proposalId) &&
    isValidObjectId(value.headSha)
  );
}

function assertIdentity(value: FlowcordiaPreviewRunIdentity): void {
  if (!validIdentity(value)) {
    throw new TypeError("Flowcordia preview run identity is invalid.");
  }
}

export function flowcordiaPreviewRunIdempotencyPrefix(
  identity: FlowcordiaPreviewRunIdentity
): string {
  assertIdentity(identity);
  return `flowcordia-preview:${identity.workflowId}:${identity.proposalId}:${identity.headSha}:`;
}

export function flowcordiaPreviewRunIdempotencyKey(
  identity: FlowcordiaPreviewRunIdentity,
  requestId: string
): string {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new TypeError("Flowcordia preview request ID is invalid.");
  }
  return `${flowcordiaPreviewRunIdempotencyPrefix(identity)}${requestId.toLowerCase()}`;
}

export function flowcordiaPreviewRunSeedMetadata(identity: FlowcordiaPreviewRunIdentity) {
  assertIdentity(identity);
  return {
    schemaVersion: "0.1" as const,
    workflowId: identity.workflowId,
    proposalId: identity.proposalId,
    headSha: identity.headSha,
  };
}

export function presentFlowcordiaPreviewRunIdentity(
  value: string | null
): FlowcordiaPreviewRunIdentity | null {
  if (!value || value.length > 256 * 1024) return null;
  try {
    const root = record(JSON.parse(value));
    const candidate = record(root?.flowcordiaTrigger);
    if (
      !candidate ||
      Object.keys(candidate).some((key) => !IDENTITY_KEYS.has(key)) ||
      candidate.schemaVersion !== "0.1" ||
      typeof candidate.workflowId !== "string" ||
      typeof candidate.proposalId !== "string" ||
      typeof candidate.headSha !== "string"
    ) {
      return null;
    }
    const identity = {
      workflowId: candidate.workflowId,
      proposalId: candidate.proposalId,
      headSha: candidate.headSha,
    };
    return validIdentity(identity) ? identity : null;
  } catch {
    return null;
  }
}

export function isSameFlowcordiaPreviewRunIdentity(
  left: FlowcordiaPreviewRunIdentity | null,
  right: FlowcordiaPreviewRunIdentity
): boolean {
  return (
    left?.workflowId === right.workflowId &&
    left.proposalId === right.proposalId &&
    left.headSha === right.headSha
  );
}

export function selectFlowcordiaPreviewRun<Run extends { metadata: string | null }>(
  runs: readonly Run[],
  expected: FlowcordiaPreviewRunIdentity
): Run | null {
  return (
    runs.find((run) =>
      isSameFlowcordiaPreviewRunIdentity(
        presentFlowcordiaPreviewRunIdentity(run.metadata),
        expected
      )
    ) ?? null
  );
}
