import { validateWorkflowFunctionSchema } from "./function-schema.js";
import type { JsonObject } from "./types.js";

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
]);
const CODE_REFERENCE_KEYS = new Set(["path", "exportName"]);

type UnknownRecord = Record<string, unknown>;

export interface WorkflowFunctionCodeReference {
  path: string;
  exportName: string;
}

export interface WorkflowFunctionDefinition {
  id: string;
  name: string;
  description?: string;
  codeReference: WorkflowFunctionCodeReference;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
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
