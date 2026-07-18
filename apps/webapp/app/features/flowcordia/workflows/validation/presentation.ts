import type { FlowcordiaFunctionValidationFailureCode } from "@flowcordia/runtime";

const ENTITY_ID_PATTERN = /^[a-z][a-z0-9_-]{1,127}$/;
const CASE_STATUS = new Set(["PASSED", "FAILED"]);
const FAILURE_CODE = new Set<FlowcordiaFunctionValidationFailureCode>([
  "function_not_deployed",
  "invalid_input",
  "invalid_expected_output",
  "execution_failed",
  "invalid_output",
  "output_mismatch",
]);

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

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function presentFlowcordiaFunctionValidationMetadata(
  value: string | null,
  expected: {
    workflowId: string;
    proposalId: string;
    headSha: string;
    suiteDigest: string;
  }
): FlowcordiaFunctionValidationMetadataProjection | null {
  if (!value || value.length > 256 * 1024) return null;
  try {
    const root = record(JSON.parse(value));
    const metadata = record(root?.flowcordiaValidation);
    if (
      metadata?.schemaVersion !== "0.1" ||
      metadata.workflowId !== expected.workflowId ||
      metadata.proposalId !== expected.proposalId ||
      metadata.headSha !== expected.headSha ||
      metadata.suiteDigest !== expected.suiteDigest ||
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
      const identity = `${candidate.functionId}\u0000${candidate.fixtureId}`;
      if (seen.has(identity)) return null;
      seen.add(identity);
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
    return {
      status: metadata.status as FlowcordiaFunctionValidationMetadataProjection["status"],
      passedCount,
      failedCount,
      failureCode: metadata.failureCode === "invalid_suite" ? "invalid_suite" : null,
      cases,
    };
  } catch {
    return null;
  }
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
