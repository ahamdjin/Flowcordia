import {
  formatWorkflowFunctionValuePath,
  validateWorkflowFunctionSchema,
  validateWorkflowFunctionValue,
} from "./function-schema.js";
import { findInlineSecretPath } from "./security.js";
import type { JsonObject, JsonValue, WorkflowNode } from "./types.js";

export const CURRENT_WORKFLOW_FUNCTION_CATALOG_VERSION = "0.1" as const;

const FUNCTION_ID_PATTERN = /^[a-z][a-z0-9_-]{1,127}$/;
const CATALOG_KEYS = new Set(["schemaVersion", "functions"]);
const FUNCTION_KEYS = new Set([
  "id",
  "name",
  "description",
  "codeReference",
  "inputSchema",
  "outputSchema",
  "fixtures",
]);
const CODE_REFERENCE_KEYS = new Set(["path", "exportName"]);
const FIXTURE_KEYS = new Set(["id", "name", "description", "input", "mockOutput"]);

type UnknownRecord = Record<string, unknown>;

export interface WorkflowFunctionCodeReference {
  path: string;
  exportName: string;
}

export interface WorkflowFunctionFixture {
  id: string;
  name: string;
  description?: string;
  input: JsonObject;
  mockOutput: JsonObject;
}

export interface WorkflowFunctionDefinition {
  id: string;
  name: string;
  description?: string;
  codeReference: WorkflowFunctionCodeReference;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  fixtures?: WorkflowFunctionFixture[];
}

export interface WorkflowFunctionCatalog {
  schemaVersion: typeof CURRENT_WORKFLOW_FUNCTION_CATALOG_VERSION;
  functions: WorkflowFunctionDefinition[];
}

export type WorkflowFunctionCatalogIssueCode =
  | "invalid_json"
  | "invalid_type"
  | "required"
  | "unknown_property"
  | "invalid_value"
  | "duplicate_id";

export interface WorkflowFunctionCatalogIssue {
  code: WorkflowFunctionCatalogIssueCode;
  message: string;
  path: ReadonlyArray<string | number>;
  functionId?: string;
}

export type WorkflowFunctionCatalogValidationResult =
  | { success: true; catalog: WorkflowFunctionCatalog; issues: [] }
  | { success: false; issues: WorkflowFunctionCatalogIssue[] };

function isRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  issues: WorkflowFunctionCatalogIssue[],
  value: Omit<WorkflowFunctionCatalogIssue, "functionId">,
  functionId?: string
) {
  issues.push({ ...value, ...(functionId ? { functionId } : {}) });
}

function unknownProperties(
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
  path: ReadonlyArray<string | number>,
  issues: WorkflowFunctionCatalogIssue[],
  functionId?: string
) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(
        issues,
        {
          code: "unknown_property",
          message: `Unknown property "${key}".`,
          path: [...path, key],
        },
        functionId
      );
    }
  }
}

function stringField(
  value: UnknownRecord,
  key: string,
  path: ReadonlyArray<string | number>,
  issues: WorkflowFunctionCatalogIssue[],
  options: { required?: boolean; maxLength?: number; pattern?: RegExp } = {},
  functionId?: string
): string | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    if (options.required) {
      issue(
        issues,
        { code: "required", message: `"${key}" is required.`, path: [...path, key] },
        functionId
      );
    }
    return undefined;
  }
  if (typeof candidate !== "string") {
    issue(
      issues,
      { code: "invalid_type", message: `"${key}" must be a string.`, path: [...path, key] },
      functionId
    );
    return undefined;
  }
  if (candidate.length === 0 || (options.maxLength && candidate.length > options.maxLength)) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: options.maxLength
          ? `"${key}" must contain between 1 and ${options.maxLength} characters.`
          : `"${key}" cannot be empty.`,
        path: [...path, key],
      },
      functionId
    );
  }
  if (options.pattern && !options.pattern.test(candidate)) {
    issue(
      issues,
      { code: "invalid_value", message: `"${key}" has an invalid format.`, path: [...path, key] },
      functionId
    );
  }
  return candidate;
}

function validateJsonValue(
  value: unknown,
  path: ReadonlyArray<string | number>,
  issues: WorkflowFunctionCatalogIssue[],
  functionId: string | undefined,
  ancestors = new Set<object>()
) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      issue(
        issues,
        {
          code: "invalid_value",
          message: "JSON Schema values cannot contain circular references.",
          path,
        },
        functionId
      );
      return;
    }
    ancestors.add(value);
    value.forEach((entry, index) =>
      validateJsonValue(entry, [...path, index], issues, functionId, ancestors)
    );
    ancestors.delete(value);
    return;
  }
  if (isRecord(value)) {
    if (ancestors.has(value)) {
      issue(
        issues,
        {
          code: "invalid_value",
          message: "JSON Schema values cannot contain circular references.",
          path,
        },
        functionId
      );
      return;
    }
    ancestors.add(value);
    Object.entries(value).forEach(([key, entry]) =>
      validateJsonValue(entry, [...path, key], issues, functionId, ancestors)
    );
    ancestors.delete(value);
    return;
  }
  issue(
    issues,
    {
      code: "invalid_type",
      message: "JSON Schema values must be valid JSON.",
      path,
    },
    functionId
  );
}

function validateSchema(
  value: unknown,
  path: ReadonlyArray<string | number>,
  issues: WorkflowFunctionCatalogIssue[],
  functionId?: string
) {
  if (!isRecord(value)) {
    issue(
      issues,
      {
        code: value === undefined ? "required" : "invalid_type",
        message: "A JSON Schema object is required.",
        path,
      },
      functionId
    );
    return;
  }
  validateJsonValue(value, path, issues, functionId);
  for (const schemaIssue of validateWorkflowFunctionSchema(value, { requireObjectRoot: true })) {
    issue(
      issues,
      {
        code:
          schemaIssue.code === "unknown_property"
            ? "unknown_property"
            : schemaIssue.code === "invalid_type"
              ? "invalid_type"
              : schemaIssue.code === "required"
                ? "required"
                : "invalid_value",
        message: schemaIssue.message,
        path: [...path, ...schemaIssue.path],
      },
      functionId
    );
  }
}

export function isWorkflowCodeReferencePath(path: string): boolean {
  return (
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    path !== "." &&
    /^(?:\.\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_@.-]+)*$/.test(path)
  );
}

export function isWorkflowFunctionCodeReferencePath(path: string): boolean {
  const normalized = path.replace(/^\.\//, "");
  return (
    isWorkflowCodeReferencePath(path) &&
    /\.(?:[cm]?[jt]sx?)$/.test(normalized) &&
    normalized !== "trigger/flowcordia" &&
    !normalized.startsWith("trigger/flowcordia/")
  );
}

export function isWorkflowCodeExportName(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function validateFixtureValue(
  value: unknown,
  schema: unknown,
  path: ReadonlyArray<string | number>,
  label: "input" | "mockOutput",
  issues: WorkflowFunctionCatalogIssue[],
  functionId?: string
) {
  if (!isRecord(value)) {
    issue(
      issues,
      {
        code: value === undefined ? "required" : "invalid_type",
        message: `Fixture ${label} must be a JSON object.`,
        path,
      },
      functionId
    );
    return;
  }
  validateJsonValue(value, path, issues, functionId);
  const secretPath = findInlineSecretPath(value as JsonValue);
  if (secretPath) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: `Fixture ${label} cannot contain inline secrets or credential-like values.`,
        path: [...path, ...secretPath],
      },
      functionId
    );
  }
  if (
    !isRecord(schema) ||
    validateWorkflowFunctionSchema(schema, { requireObjectRoot: true }).length > 0
  ) {
    return;
  }
  for (const valueIssue of validateWorkflowFunctionValue(
    schema as JsonObject,
    value as JsonValue
  )) {
    issue(
      issues,
      {
        code: valueIssue.code === "invalid_type" ? "invalid_type" : "invalid_value",
        message: `Fixture ${label} failed the function contract at ${formatWorkflowFunctionValuePath(valueIssue.path)}: ${valueIssue.message}`,
        path: [...path, ...valueIssue.path],
      },
      functionId
    );
  }
}

function validateFixtures(
  value: unknown,
  inputSchema: unknown,
  outputSchema: unknown,
  path: ReadonlyArray<string | number>,
  issues: WorkflowFunctionCatalogIssue[],
  functionId?: string
) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issue(
      issues,
      { code: "invalid_type", message: "Function fixtures must be an array.", path },
      functionId
    );
    return;
  }
  if (value.length > 50) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: "A function cannot define more than 50 fixtures.",
        path,
      },
      functionId
    );
  }
  const seen = new Set<string>();
  value.forEach((candidate, index) => {
    const fixturePath = [...path, index];
    if (!isRecord(candidate)) {
      issue(
        issues,
        { code: "invalid_type", message: "Fixture must be an object.", path: fixturePath },
        functionId
      );
      return;
    }
    unknownProperties(candidate, FIXTURE_KEYS, fixturePath, issues, functionId);
    const fixtureId = stringField(
      candidate,
      "id",
      fixturePath,
      issues,
      { required: true, maxLength: 128, pattern: FUNCTION_ID_PATTERN },
      functionId
    );
    stringField(
      candidate,
      "name",
      fixturePath,
      issues,
      { required: true, maxLength: 160 },
      functionId
    );
    stringField(candidate, "description", fixturePath, issues, { maxLength: 2_000 }, functionId);
    validateFixtureValue(
      candidate.input,
      inputSchema,
      [...fixturePath, "input"],
      "input",
      issues,
      functionId
    );
    validateFixtureValue(
      candidate.mockOutput,
      outputSchema,
      [...fixturePath, "mockOutput"],
      "mockOutput",
      issues,
      functionId
    );
    if (fixtureId && seen.has(fixtureId)) {
      issue(
        issues,
        {
          code: "duplicate_id",
          message: `Duplicate fixture ID "${fixtureId}".`,
          path: [...fixturePath, "id"],
        },
        functionId
      );
    }
    if (fixtureId) seen.add(fixtureId);
  });
}

export type WorkflowFunctionFixtureResolution =
  | { success: true; mockOutput: JsonObject }
  | {
      success: false;
      code: "invalid_target" | "function_mismatch" | "fixture_not_found" | "input_mismatch";
      message: string;
    };

function fixtureJsonSignature(value: JsonValue): string {
  const normalize = (candidate: JsonValue): JsonValue => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)])
      ) as JsonObject;
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

function fixtureResolutionFailure(
  code: Exclude<WorkflowFunctionFixtureResolution, { success: true }>["code"],
  message: string
): WorkflowFunctionFixtureResolution {
  return { success: false, code, message };
}

export function resolveWorkflowFunctionFixture(input: {
  catalog: WorkflowFunctionCatalog;
  node: WorkflowNode;
  fixtureId: string;
  payload: JsonValue;
}): WorkflowFunctionFixtureResolution {
  const functionId = input.node.configuration.functionId;
  if (
    input.node.operation !== "code.task" ||
    typeof functionId !== "string" ||
    !input.node.codeReference ||
    input.node.codeReference.repository !== undefined ||
    input.node.codeReference.commit !== undefined
  ) {
    return fixtureResolutionFailure(
      "invalid_target",
      "The selected fixture target is not an exact repository function node."
    );
  }

  const definition = input.catalog.functions.find((candidate) => candidate.id === functionId);
  if (!definition) {
    return fixtureResolutionFailure(
      "function_mismatch",
      `Function "${functionId}" is not present in the exact repository catalog.`
    );
  }

  const identityMatches =
    input.node.codeReference.path === definition.codeReference.path &&
    input.node.codeReference.exportName === definition.codeReference.exportName &&
    input.node.inputSchema !== undefined &&
    input.node.outputSchema !== undefined &&
    fixtureJsonSignature(input.node.inputSchema) === fixtureJsonSignature(definition.inputSchema) &&
    fixtureJsonSignature(input.node.outputSchema) === fixtureJsonSignature(definition.outputSchema);
  if (!identityMatches) {
    return fixtureResolutionFailure(
      "function_mismatch",
      "The workflow node does not match the repository function identity and schemas at this revision."
    );
  }

  const fixture = definition.fixtures?.find((candidate) => candidate.id === input.fixtureId);
  if (!fixture) {
    return fixtureResolutionFailure(
      "fixture_not_found",
      `Fixture "${input.fixtureId}" is not available for this exact repository function.`
    );
  }

  if (fixtureJsonSignature(fixture.input) !== fixtureJsonSignature(input.payload)) {
    return fixtureResolutionFailure(
      "input_mismatch",
      "Repository fixture input changed in the browser. Select the fixture again before testing."
    );
  }

  return {
    success: true,
    mockOutput: JSON.parse(JSON.stringify(fixture.mockOutput)) as JsonObject,
  };
}

function validateFunction(
  value: unknown,
  index: number,
  issues: WorkflowFunctionCatalogIssue[]
): string | undefined {
  const path: ReadonlyArray<string | number> = ["functions", index];
  if (!isRecord(value)) {
    issues.push({ code: "invalid_type", message: "Function must be an object.", path });
    return undefined;
  }
  const functionId = typeof value.id === "string" ? value.id : undefined;
  unknownProperties(value, FUNCTION_KEYS, path, issues, functionId);
  const id = stringField(
    value,
    "id",
    path,
    issues,
    { required: true, maxLength: 128, pattern: FUNCTION_ID_PATTERN },
    functionId
  );
  stringField(value, "name", path, issues, { required: true, maxLength: 160 }, functionId);
  stringField(value, "description", path, issues, { maxLength: 2_000 }, functionId);

  const codeReference = value.codeReference;
  if (!isRecord(codeReference)) {
    issue(
      issues,
      {
        code: codeReference === undefined ? "required" : "invalid_type",
        message: "A repository code reference is required.",
        path: [...path, "codeReference"],
      },
      functionId
    );
  } else {
    unknownProperties(
      codeReference,
      CODE_REFERENCE_KEYS,
      [...path, "codeReference"],
      issues,
      functionId
    );
    const codePath = stringField(
      codeReference,
      "path",
      [...path, "codeReference"],
      issues,
      { required: true, maxLength: 512 },
      functionId
    );
    const exportName = stringField(
      codeReference,
      "exportName",
      [...path, "codeReference"],
      issues,
      { required: true, maxLength: 128 },
      functionId
    );
    if (codePath && !isWorkflowFunctionCodeReferencePath(codePath)) {
      issue(
        issues,
        {
          code: "invalid_value",
          message:
            "Function code paths must name a supported repository source file outside Flowcordia generated directories.",
          path: [...path, "codeReference", "path"],
        },
        functionId
      );
    }
    if (exportName && !isWorkflowCodeExportName(exportName)) {
      issue(
        issues,
        {
          code: "invalid_value",
          message: "Code reference export names must be valid JavaScript identifiers.",
          path: [...path, "codeReference", "exportName"],
        },
        functionId
      );
    }
  }

  validateSchema(value.inputSchema, [...path, "inputSchema"], issues, functionId);
  validateSchema(value.outputSchema, [...path, "outputSchema"], issues, functionId);
  validateFixtures(
    value.fixtures,
    value.inputSchema,
    value.outputSchema,
    [...path, "fixtures"],
    issues,
    functionId
  );
  return id;
}

export function parseWorkflowFunctionCatalog(
  input: unknown
): WorkflowFunctionCatalogValidationResult {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      return {
        success: false,
        issues: [
          {
            code: "invalid_json",
            message: error instanceof Error ? error.message : "Function catalog is not valid JSON.",
            path: [],
          },
        ],
      };
    }
  }
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ code: "invalid_type", message: "Function catalog must be an object.", path: [] }],
    };
  }

  const issues: WorkflowFunctionCatalogIssue[] = [];
  unknownProperties(value, CATALOG_KEYS, [], issues);
  if (value.schemaVersion !== CURRENT_WORKFLOW_FUNCTION_CATALOG_VERSION) {
    issues.push({
      code: value.schemaVersion === undefined ? "required" : "invalid_value",
      message: `Function catalog schemaVersion must be "${CURRENT_WORKFLOW_FUNCTION_CATALOG_VERSION}".`,
      path: ["schemaVersion"],
    });
  }
  if (!Array.isArray(value.functions)) {
    issues.push({
      code: value.functions === undefined ? "required" : "invalid_type",
      message: "Function catalog functions must be an array.",
      path: ["functions"],
    });
  } else {
    if (value.functions.length > 500) {
      issues.push({
        code: "invalid_value",
        message: "Function catalog cannot contain more than 500 functions.",
        path: ["functions"],
      });
    }
    const seen = new Set<string>();
    value.functions.forEach((entry, index) => {
      const id = validateFunction(entry, index, issues);
      if (!id) return;
      if (seen.has(id)) {
        issues.push({
          code: "duplicate_id",
          message: `Duplicate function ID "${id}".`,
          path: ["functions", index, "id"],
          functionId: id,
        });
      }
      seen.add(id);
    });
  }
  if (issues.length > 0) return { success: false, issues };

  return {
    success: true,
    catalog: JSON.parse(JSON.stringify(value)) as WorkflowFunctionCatalog,
    issues: [],
  };
}

export function validateWorkflowFunctionDefinition(
  definition: unknown
): WorkflowFunctionCatalogIssue[] {
  const result = parseWorkflowFunctionCatalog({
    schemaVersion: CURRENT_WORKFLOW_FUNCTION_CATALOG_VERSION,
    functions: [definition],
  });
  return result.success ? [] : result.issues;
}
