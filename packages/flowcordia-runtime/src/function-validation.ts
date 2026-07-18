import {
  formatWorkflowFunctionValuePath,
  validateWorkflowFunctionValue,
  type JsonObject,
  type JsonValue,
} from "@flowcordia/workflow";
import type { FlowcordiaCodeHandler } from "./types.js";

export const FLOWCORDIA_FUNCTION_VALIDATION_SCHEMA_VERSION = "0.1" as const;
export const DEFAULT_MAX_FUNCTION_VALIDATION_CASES = 200;
export const DEFAULT_MAX_FUNCTION_VALIDATION_BYTES = 256 * 1024;

const ENTITY_ID_PATTERN = /^[a-z][a-z0-9_-]{1,127}$/;
const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;
const PROPOSAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface FlowcordiaFunctionValidationCase {
  functionId: string;
  fixtureId: string;
  input: JsonObject;
  expectedOutput: JsonObject;
}

export interface FlowcordiaFunctionValidationSuite {
  schemaVersion: typeof FLOWCORDIA_FUNCTION_VALIDATION_SCHEMA_VERSION;
  workflowId: string;
  proposalId: string;
  headSha: string;
  suiteDigest: string;
  cases: FlowcordiaFunctionValidationCase[];
}

export interface FlowcordiaFunctionValidationDefinition {
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  handler: FlowcordiaCodeHandler;
}

export type FlowcordiaFunctionValidationFailureCode =
  | "function_not_deployed"
  | "invalid_input"
  | "invalid_expected_output"
  | "execution_failed"
  | "invalid_output"
  | "output_mismatch";

export interface FlowcordiaFunctionValidationCaseResult {
  functionId: string;
  fixtureId: string;
  status: "PASSED" | "FAILED";
  code?: FlowcordiaFunctionValidationFailureCode;
}

export interface FlowcordiaFunctionValidationResult {
  success: boolean;
  workflowId: string;
  proposalId: string;
  headSha: string;
  suiteDigest: string;
  passedCount: number;
  failedCount: number;
  cases: FlowcordiaFunctionValidationCaseResult[];
  failureCode?: "invalid_suite";
}

export interface FlowcordiaFunctionValidationOptions {
  maxCases?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  onCase?(result: FlowcordiaFunctionValidationCaseResult): Promise<void> | void;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const valid = value.every((entry) => isJsonValue(entry, ancestors));
    ancestors.delete(value);
    return valid;
  }
  if (!isRecord(value) || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((entry) => isJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

function positiveLimit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return resolved;
}

function serializedBytes(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return null;
  }
}

function canonicalJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalJson(child)])
    ) as JsonObject;
  }
  return value;
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function toJsonValue(value: unknown): JsonValue | undefined {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return undefined;
    const parsed = JSON.parse(serialized) as unknown;
    return isJsonValue(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function validateFlowcordiaFunctionValidationSuite(
  value: unknown,
  options: Pick<FlowcordiaFunctionValidationOptions, "maxCases" | "maxBytes"> = {}
): string[] {
  const maxCases = positiveLimit(
    options.maxCases,
    DEFAULT_MAX_FUNCTION_VALIDATION_CASES,
    "Function validation case limit"
  );
  const maxBytes = positiveLimit(
    options.maxBytes,
    DEFAULT_MAX_FUNCTION_VALIDATION_BYTES,
    "Function validation byte limit"
  );
  const issues: string[] = [];
  if (!isRecord(value)) return ["Function validation suite must be an object."];
  const allowedSuiteKeys = new Set([
    "schemaVersion",
    "workflowId",
    "proposalId",
    "headSha",
    "suiteDigest",
    "cases",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedSuiteKeys.has(key)) issues.push(`Unknown function validation suite property "${key}".`);
  }
  if (value.schemaVersion !== FLOWCORDIA_FUNCTION_VALIDATION_SCHEMA_VERSION) {
    issues.push(
      `Function validation schemaVersion must be "${FLOWCORDIA_FUNCTION_VALIDATION_SCHEMA_VERSION}".`
    );
  }
  if (typeof value.workflowId !== "string" || !WORKFLOW_ID_PATTERN.test(value.workflowId)) {
    issues.push("Function validation workflowId has an invalid format.");
  }
  if (typeof value.proposalId !== "string" || !PROPOSAL_ID_PATTERN.test(value.proposalId)) {
    issues.push("Function validation proposalId has an invalid format.");
  }
  if (typeof value.headSha !== "string" || !OBJECT_ID_PATTERN.test(value.headSha)) {
    issues.push("Function validation headSha must be a hexadecimal Git object ID.");
  }
  if (typeof value.suiteDigest !== "string" || !SHA256_PATTERN.test(value.suiteDigest)) {
    issues.push("Function validation suiteDigest must be a SHA-256 digest.");
  }
  if (!Array.isArray(value.cases)) {
    issues.push("Function validation cases must be an array.");
  } else {
    if (value.cases.length === 0) issues.push("Function validation requires at least one case.");
    if (value.cases.length > maxCases) {
      issues.push(`Function validation cannot contain more than ${maxCases} cases.`);
    }
    const seen = new Set<string>();
    const allowedCaseKeys = new Set(["functionId", "fixtureId", "input", "expectedOutput"]);
    value.cases.forEach((candidate, index) => {
      if (!isRecord(candidate)) {
        issues.push(`Function validation case ${index} must be an object.`);
        return;
      }
      for (const key of Object.keys(candidate)) {
        if (!allowedCaseKeys.has(key)) {
          issues.push(`Unknown property "${key}" in function validation case ${index}.`);
        }
      }
      if (
        typeof candidate.functionId !== "string" ||
        !ENTITY_ID_PATTERN.test(candidate.functionId)
      ) {
        issues.push(`Function validation case ${index} has an invalid functionId.`);
      }
      if (typeof candidate.fixtureId !== "string" || !ENTITY_ID_PATTERN.test(candidate.fixtureId)) {
        issues.push(`Function validation case ${index} has an invalid fixtureId.`);
      }
      if (!isJsonObject(candidate.input)) {
        issues.push(`Function validation case ${index} input must be a JSON object.`);
      }
      if (!isJsonObject(candidate.expectedOutput)) {
        issues.push(`Function validation case ${index} expectedOutput must be a JSON object.`);
      }
      if (
        typeof candidate.functionId === "string" &&
        typeof candidate.fixtureId === "string"
      ) {
        const identity = `${candidate.functionId}\u0000${candidate.fixtureId}`;
        if (seen.has(identity)) {
          issues.push(
            `Duplicate function validation case "${candidate.functionId}/${candidate.fixtureId}".`
          );
        }
        seen.add(identity);
      }
    });
  }
  const bytes = serializedBytes(value);
  if (bytes === null) issues.push("Function validation suite must be JSON serializable.");
  else if (bytes > maxBytes) issues.push(`Function validation suite exceeds ${maxBytes} bytes.`);
  return issues;
}

function invalidSuiteResult(value: unknown): FlowcordiaFunctionValidationResult {
  const candidate = isRecord(value) ? value : {};
  return {
    success: false,
    workflowId:
      typeof candidate.workflowId === "string" && WORKFLOW_ID_PATTERN.test(candidate.workflowId)
        ? candidate.workflowId
        : "invalid",
    proposalId:
      typeof candidate.proposalId === "string" && PROPOSAL_ID_PATTERN.test(candidate.proposalId)
        ? candidate.proposalId
        : "invalid",
    headSha:
      typeof candidate.headSha === "string" && OBJECT_ID_PATTERN.test(candidate.headSha)
        ? candidate.headSha
        : "0".repeat(40),
    suiteDigest:
      typeof candidate.suiteDigest === "string" && SHA256_PATTERN.test(candidate.suiteDigest)
        ? candidate.suiteDigest
        : "0".repeat(64),
    passedCount: 0,
    failedCount: 0,
    cases: [],
    failureCode: "invalid_suite",
  };
}

async function observeCase(
  options: FlowcordiaFunctionValidationOptions,
  result: FlowcordiaFunctionValidationCaseResult
): Promise<void> {
  try {
    await options.onCase?.(result);
  } catch {
    // Validation observability must not change the validation result.
  }
}

export async function executeFlowcordiaFunctionValidationSuite(
  value: unknown,
  definitions: Readonly<Record<string, FlowcordiaFunctionValidationDefinition>>,
  options: FlowcordiaFunctionValidationOptions = {}
): Promise<FlowcordiaFunctionValidationResult> {
  if (validateFlowcordiaFunctionValidationSuite(value, options).length > 0) {
    return invalidSuiteResult(value);
  }
  const suite = value as FlowcordiaFunctionValidationSuite;
  const results: FlowcordiaFunctionValidationCaseResult[] = [];
  for (const candidate of suite.cases) {
    if (options.signal?.aborted) throw options.signal.reason;
    const definition = definitions[candidate.functionId];
    let result: FlowcordiaFunctionValidationCaseResult;
    if (!definition) {
      result = {
        functionId: candidate.functionId,
        fixtureId: candidate.fixtureId,
        status: "FAILED",
        code: "function_not_deployed",
      };
    } else if (validateWorkflowFunctionValue(definition.inputSchema, candidate.input).length > 0) {
      result = {
        functionId: candidate.functionId,
        fixtureId: candidate.fixtureId,
        status: "FAILED",
        code: "invalid_input",
      };
    } else if (
      validateWorkflowFunctionValue(definition.outputSchema, candidate.expectedOutput).length > 0
    ) {
      result = {
        functionId: candidate.functionId,
        fixtureId: candidate.fixtureId,
        status: "FAILED",
        code: "invalid_expected_output",
      };
    } else {
      let output: JsonValue | undefined;
      try {
        output = toJsonValue(await definition.handler(candidate.input));
      } catch {
        result = {
          functionId: candidate.functionId,
          fixtureId: candidate.fixtureId,
          status: "FAILED",
          code: "execution_failed",
        };
      }
      if (!result! && output === undefined) {
        result = {
          functionId: candidate.functionId,
          fixtureId: candidate.fixtureId,
          status: "FAILED",
          code: "invalid_output",
        };
      } else if (!result! && validateWorkflowFunctionValue(definition.outputSchema, output!).length > 0) {
        result = {
          functionId: candidate.functionId,
          fixtureId: candidate.fixtureId,
          status: "FAILED",
          code: "invalid_output",
        };
      } else if (!result! && !jsonValuesEqual(output!, candidate.expectedOutput)) {
        result = {
          functionId: candidate.functionId,
          fixtureId: candidate.fixtureId,
          status: "FAILED",
          code: "output_mismatch",
        };
      } else if (!result!) {
        result = {
          functionId: candidate.functionId,
          fixtureId: candidate.fixtureId,
          status: "PASSED",
        };
      }
    }
    results.push(result!);
    await observeCase(options, result!);
  }
  const passedCount = results.filter((result) => result.status === "PASSED").length;
  const failedCount = results.length - passedCount;
  return {
    success: failedCount === 0,
    workflowId: suite.workflowId,
    proposalId: suite.proposalId,
    headSha: suite.headSha,
    suiteDigest: suite.suiteDigest,
    passedCount,
    failedCount,
    cases: results,
  };
}

export function formatFlowcordiaFunctionValidationIssue(input: {
  boundary: "input" | "output";
  path: ReadonlyArray<string | number>;
}): string {
  return `Function validation ${input.boundary} failed at ${formatWorkflowFunctionValuePath(input.path)}.`;
}
