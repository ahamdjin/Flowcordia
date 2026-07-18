import type { FlowcordiaFunctionValidationFailureCode } from "@flowcordia/runtime";

const ENTITY_ID_PATTERN = /^[a-z][a-z0-9_-]{1,127}$/;
const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;
const PROPOSAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CASE_STATUS = new Set(["PASSED", "FAILED"]);
const FAILURE_CODE = new Set<FlowcordiaFunctionValidationFailureCode>([
  "function_not_deployed",
  "invalid_input",
  "invalid_expected_output",
  "execution_failed",
  "invalid_output",
  "output_mismatch",
]);

export interface FlowcordiaFunctionValidationRunIdentityProjection {
  workflowId: string;
  proposalId: string;
  headSha: string;
  suiteDigest: string;
}

export interface FlowcordiaFunctionValidationCaseProjection {
  functionId: string;
  fixtureId: string;
  status: "PASSED" | "FAILED";
  code: FlowcordiaFunctionValidationFailureCode | null;
}

export interface FlowcordiaFunctionValidationMetadataProjection {
  status: "RUNNING" | "PASSED" | "FAILED";
  passedCount: number;
  failedCount: number;
  failureCode: "invalid_suite" | null;
  cases: FlowcordiaFunctionValidationCaseProjection[];
}

export interface FlowcordiaFunctionValidationProjection {
  state:
    | "NOT_REQUESTED"
    | "NOT_REQUIRED"
    | "BLOCKED"
    | "WAITING_FOR_DEPLOYMENT"
    | "READY_TO_RUN"
    | "QUEUED"
    | "RUNNING"
    | "PASSED"
    | "FAILED"
    | "CLOSED"
    | "UNAVAILABLE";
  message: string;
  proposal: {
    proposalId: string;
    headSha: string;
    pullRequestNumber: number | null;
  } | null;
  suite: {
    digest: string;
    functionCount: number;
    caseCount: number;
  } | null;
  latestRun: {
    friendlyId: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    validation: FlowcordiaFunctionValidationMetadataProjection | null;
  } | null;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function parseRoot(value: string | null): UnknownRecord | null {
  if (!value || value.length > 256 * 1024) return null;
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function runIdentity(value: unknown): FlowcordiaFunctionValidationRunIdentityProjection | null {
  const candidate = record(value);
  if (
    typeof candidate?.workflowId !== "string" ||
    !WORKFLOW_ID_PATTERN.test(candidate.workflowId) ||
    typeof candidate.proposalId !== "string" ||
    !PROPOSAL_ID_PATTERN.test(candidate.proposalId) ||
    typeof candidate.headSha !== "string" ||
    !OBJECT_ID_PATTERN.test(candidate.headSha) ||
    typeof candidate.suiteDigest !== "string" ||
    !SHA256_PATTERN.test(candidate.suiteDigest)
  ) {
    return null;
  }
  return {
    workflowId: candidate.workflowId,
    proposalId: candidate.proposalId,
    headSha: candidate.headSha,
    suiteDigest: candidate.suiteDigest,
  };
}

function sameRunIdentity(
  left: FlowcordiaFunctionValidationRunIdentityProjection,
  right: FlowcordiaFunctionValidationRunIdentityProjection
): boolean {
  return (
    left.workflowId === right.workflowId &&
    left.proposalId === right.proposalId &&
    left.headSha === right.headSha &&
    left.suiteDigest === right.suiteDigest
  );
}

export function presentFlowcordiaFunctionValidationRunIdentity(
  value: string | null
): FlowcordiaFunctionValidationRunIdentityProjection | null {
  const root = parseRoot(value);
  return (
    runIdentity(root?.flowcordiaValidation) ??
    runIdentity(root?.flowcordiaValidationTrigger) ??
    null
  );
}

export function presentFlowcordiaFunctionValidationMetadata(
  value: string | null,
  expected: FlowcordiaFunctionValidationRunIdentityProjection
): FlowcordiaFunctionValidationMetadataProjection | null {
  const root = parseRoot(value);
  const metadata = record(root?.flowcordiaValidation);
  const identity = runIdentity(metadata);
  if (
    metadata?.schemaVersion !== "0.1" ||
    !identity ||
    !sameRunIdentity(identity, expected) ||
    !["RUNNING", "PASSED", "FAILED"].includes(String(metadata.status)) ||
    !Array.isArray(metadata.cases) ||
    metadata.cases.length > 200
  ) {
    return null;
  }
  const passedCount = count(metadata.passedCount);
  const failedCount = count(metadata.failedCount);
  if (passedCount === null || failedCount === null) return null;
  if (metadata.failureCode !== null && metadata.failureCode !== "invalid_suite") return null;

  const seen = new Set<string>();
  const cases: FlowcordiaFunctionValidationCaseProjection[] = [];
  for (const raw of metadata.cases) {
    const candidate = record(raw);
    if (
      typeof candidate?.functionId !== "string" ||
      !ENTITY_ID_PATTERN.test(candidate.functionId) ||
      typeof candidate.fixtureId !== "string" ||
      !ENTITY_ID_PATTERN.test(candidate.fixtureId) ||
      typeof candidate.status !== "string" ||
      !CASE_STATUS.has(candidate.status) ||
      (candidate.code !== undefined &&
        (typeof candidate.code !== "string" ||
          !FAILURE_CODE.has(candidate.code as FlowcordiaFunctionValidationFailureCode)))
    ) {
      return null;
    }
    const identityKey = `${candidate.functionId}\u0000${candidate.fixtureId}`;
    if (seen.has(identityKey)) return null;
    seen.add(identityKey);
    cases.push({
      functionId: candidate.functionId,
      fixtureId: candidate.fixtureId,
      status: candidate.status as FlowcordiaFunctionValidationCaseProjection["status"],
      code:
        typeof candidate.code === "string"
          ? (candidate.code as FlowcordiaFunctionValidationFailureCode)
          : null,
    });
  }
  const observedPassed = cases.filter((candidate) => candidate.status === "PASSED").length;
  const observedFailed = cases.length - observedPassed;
  if (observedPassed !== passedCount || observedFailed !== failedCount) return null;
  if (metadata.status === "PASSED" && (failedCount !== 0 || cases.length === 0)) return null;
  if (metadata.status === "RUNNING" && metadata.failureCode !== null) return null;

  return {
    status: metadata.status as FlowcordiaFunctionValidationMetadataProjection["status"],
    passedCount,
    failedCount,
    failureCode: metadata.failureCode === "invalid_suite" ? "invalid_suite" : null,
    cases,
  };
}

export function unavailableFlowcordiaFunctionValidation(): FlowcordiaFunctionValidationProjection {
  return {
    state: "UNAVAILABLE",
    message: "Repository function validation state is temporarily unavailable.",
    proposal: null,
    suite: null,
    latestRun: null,
  };
}
