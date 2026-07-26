import {
  cloneJson,
  createJsonSchemaValidator,
  findJsonCompatibilityIssue,
  schemaPathSegments,
  type ErrorObject,
  type ValidateFunction,
} from "@flowcordia/foundation";

import functionCatalogSchema from "../schema/functions-0.1.json" with { type: "json" };
import type { JsonObject, JsonValue } from "./types.js";

const MAX_SCHEMA_DEPTH = 12;
const MAX_SCHEMA_NODES = 1_000;
const MAX_SCHEMA_PROPERTIES = 100;
const MAX_SCHEMA_ENUM_VALUES = 100;
const MAX_VALUE_ISSUES = 50;

const SCHEMA_TYPES = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
] as const);

const COMMON_SCHEMA_KEYS = new Set(["type", "title", "description", "enum", "const"]);
const TYPE_SCHEMA_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  object: new Set(["properties", "required", "additionalProperties"]),
  array: new Set(["items", "minItems", "maxItems"]),
  string: new Set(["minLength", "maxLength"]),
  number: new Set(["minimum", "maximum"]),
  integer: new Set(["minimum", "maximum"]),
  boolean: new Set(),
  null: new Set(),
};

type SchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
type Path = ReadonlyArray<string | number>;
type UnknownRecord = Record<string, unknown>;

export interface WorkflowFunctionSchemaIssue {
  code: "invalid_type" | "required" | "unknown_property" | "invalid_value" | "limit_exceeded";
  message: string;
  path: Path;
}

export interface WorkflowFunctionValueIssue {
  code: "invalid_type" | "required" | "additional_property" | "constraint";
  message: string;
  path: Path;
}

const schemaAjv = createJsonSchemaValidator();
schemaAjv.addSchema(functionCatalogSchema);
const loadedSchemaNodeValidator = schemaAjv.getSchema(
  "https://flowcordia.dev/schemas/functions-0.1.json#/$defs/schemaNode"
);
if (!loadedSchemaNodeValidator) {
  throw new Error("Flowcordia function schema contract is unavailable.");
}
const schemaNodeValidator: ValidateFunction = loadedSchemaNodeValidator;

const valueAjv = createJsonSchemaValidator();
const valueValidators = new WeakMap<object, ValidateFunction>();

function isRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issueKey(issue: WorkflowFunctionSchemaIssue): string {
  return `${issue.code}:${JSON.stringify(issue.path)}`;
}

function pushSchemaIssue(
  issues: WorkflowFunctionSchemaIssue[],
  issue: WorkflowFunctionSchemaIssue
): void {
  if (issues.length >= MAX_VALUE_ISSUES) return;
  const key = issueKey(issue);
  if (!issues.some((candidate) => issueKey(candidate) === key)) issues.push(issue);
}

function pushValueIssue(
  issues: WorkflowFunctionValueIssue[],
  issue: WorkflowFunctionValueIssue
): void {
  if (issues.length < MAX_VALUE_ISSUES) issues.push(issue);
}

function matchesDeclaredType(type: SchemaType, value: unknown): boolean {
  switch (type) {
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
  }
}

function valueAtPath(value: unknown, path: Path): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function schemaErrorIssue(error: ErrorObject, schema: unknown): WorkflowFunctionSchemaIssue {
  let path = schemaPathSegments(error);
  switch (error.keyword) {
    case "additionalProperties":
      return {
        code: "unknown_property",
        message: `Schema keyword "${String(error.params.additionalProperty)}" is not supported by function contract version 0.1.`,
        path,
      };
    case "required":
      return {
        code: "required",
        message:
          error.params.missingProperty === "type"
            ? "Schema nodes require one supported scalar, object, or array type."
            : `"${String(error.params.missingProperty)}" is required.`,
        path,
      };
    case "type":
      return {
        code: "invalid_type",
        message:
          path.at(-1) === "properties"
            ? '"properties" must be an object of named schemas.'
            : path.at(-1) === "required"
              ? '"required" must be an array of property names.'
              : "Schema values have an invalid type.",
        path,
      };
    case "maxProperties":
      return {
        code: "limit_exceeded",
        message: `Schema objects cannot declare more than ${MAX_SCHEMA_PROPERTIES} properties.`,
        path,
      };
    case "maxItems":
      if (path.at(-1) === "enum") {
        return {
          code: "invalid_value",
          message: `"enum" must contain between 1 and ${MAX_SCHEMA_ENUM_VALUES} values.`,
          path,
        };
      }
      return { code: "invalid_value", message: "Schema array exceeds its allowed limit.", path };
    case "minItems":
      return {
        code: "invalid_value",
        message:
          path.at(-1) === "enum"
            ? `"enum" must contain between 1 and ${MAX_SCHEMA_ENUM_VALUES} values.`
            : "Schema array cannot be empty.",
        path,
      };
    case "minLength":
    case "maxLength":
      return {
        code: "invalid_value",
        message: `"${String(path.at(-1))}" must be a non-empty bounded string.`,
        path,
      };
    case "uniqueItems": {
      const duplicateIndex = Number(error.params.j);
      const required = valueAtPath(schema, path);
      const duplicate = Array.isArray(required) ? required[duplicateIndex] : undefined;
      path = [...path, duplicateIndex];
      return {
        code: "invalid_value",
        message: `Required property "${String(duplicate)}" is duplicated.`,
        path,
      };
    }
    default:
      return {
        code: "invalid_value",
        message: error.message ? `Schema value ${error.message}.` : "Schema value is invalid.",
        path,
      };
  }
}

function validateSchemaPolicy(
  value: unknown,
  path: Path,
  issues: WorkflowFunctionSchemaIssue[],
  state: { nodes: number },
  depth: number
): void {
  state.nodes += 1;
  if (state.nodes > MAX_SCHEMA_NODES) {
    pushSchemaIssue(issues, {
      code: "limit_exceeded",
      message: `Function schemas cannot contain more than ${MAX_SCHEMA_NODES} schema nodes.`,
      path,
    });
    return;
  }
  if (depth > MAX_SCHEMA_DEPTH) {
    pushSchemaIssue(issues, {
      code: "limit_exceeded",
      message: `Function schemas cannot be nested deeper than ${MAX_SCHEMA_DEPTH} levels.`,
      path,
    });
    return;
  }
  if (!isRecord(value)) return;

  const type = value.type;
  if (typeof type !== "string" || !SCHEMA_TYPES.has(type as SchemaType)) return;
  const schemaType = type as SchemaType;
  const allowedTypeKeys = TYPE_SCHEMA_KEYS[schemaType]!;
  for (const key of Object.keys(value)) {
    if (!COMMON_SCHEMA_KEYS.has(key) && !allowedTypeKeys.has(key)) {
      pushSchemaIssue(issues, {
        code: "unknown_property",
        message: `Schema keyword "${key}" is not supported by function contract version 0.1.`,
        path: [...path, key],
      });
    }
  }

  if (Array.isArray(value.enum)) {
    value.enum.forEach((candidate, index) => {
      if (!matchesDeclaredType(schemaType, candidate)) {
        pushSchemaIssue(issues, {
          code: "invalid_value",
          message: "Enum values must match the declared schema type.",
          path: [...path, "enum", index],
        });
      }
    });
  }
  if (value.const !== undefined && !matchesDeclaredType(schemaType, value.const)) {
    pushSchemaIssue(issues, {
      code: "invalid_value",
      message: "The constant value must match the declared schema type.",
      path: [...path, "const"],
    });
  }

  switch (schemaType) {
    case "object": {
      const properties = isRecord(value.properties) ? value.properties : null;
      if (properties) {
        for (const [key, child] of Object.entries(properties)) {
          if (key.length === 0 || key.length > 128) {
            pushSchemaIssue(issues, {
              code: "invalid_value",
              message: "Schema property names must contain between 1 and 128 characters.",
              path: [...path, "properties", key],
            });
          }
          validateSchemaPolicy(child, [...path, "properties", key], issues, state, depth + 1);
        }
      }
      if (Array.isArray(value.required)) {
        value.required.forEach((required, index) => {
          if (
            typeof required === "string" &&
            (!properties || !Object.hasOwn(properties, required))
          ) {
            pushSchemaIssue(issues, {
              code: "invalid_value",
              message: `Required property "${required}" must exist in "properties".`,
              path: [...path, "required", index],
            });
          }
        });
      }
      break;
    }
    case "array":
      if (value.items === undefined) {
        pushSchemaIssue(issues, {
          code: "required",
          message: 'Array schemas require an "items" schema.',
          path: [...path, "items"],
        });
      } else {
        validateSchemaPolicy(value.items, [...path, "items"], issues, state, depth + 1);
      }
      if (
        typeof value.minItems === "number" &&
        typeof value.maxItems === "number" &&
        value.maxItems < value.minItems
      ) {
        pushSchemaIssue(issues, {
          code: "invalid_value",
          message: '"maxItems" must be greater than or equal to "minItems".',
          path: [...path, "maxItems"],
        });
      }
      break;
    case "string":
      if (
        typeof value.minLength === "number" &&
        typeof value.maxLength === "number" &&
        value.maxLength < value.minLength
      ) {
        pushSchemaIssue(issues, {
          code: "invalid_value",
          message: '"maxLength" must be greater than or equal to "minLength".',
          path: [...path, "maxLength"],
        });
      }
      break;
    case "number":
    case "integer":
      if (
        typeof value.minimum === "number" &&
        typeof value.maximum === "number" &&
        value.maximum < value.minimum
      ) {
        pushSchemaIssue(issues, {
          code: "invalid_value",
          message: '"maximum" must be greater than or equal to "minimum".',
          path: [...path, "maximum"],
        });
      }
      break;
    case "boolean":
    case "null":
      break;
  }
}

export function validateWorkflowFunctionSchema(
  value: unknown,
  options: { requireObjectRoot?: boolean } = {}
): WorkflowFunctionSchemaIssue[] {
  const compatibility = findJsonCompatibilityIssue(value);
  if (compatibility) {
    return [
      {
        code: compatibility.code === "circular_reference" ? "invalid_value" : "invalid_type",
        message:
          compatibility.code === "circular_reference"
            ? "JSON Schema values cannot contain circular references."
            : "JSON Schema values must be valid JSON.",
        path: compatibility.path,
      },
    ];
  }

  const issues: WorkflowFunctionSchemaIssue[] = [];
  if (!schemaNodeValidator(value)) {
    for (const error of schemaNodeValidator.errors ?? []) {
      pushSchemaIssue(issues, schemaErrorIssue(error, value));
    }
  }
  validateSchemaPolicy(value, [], issues, { nodes: 0 }, 0);
  if (
    options.requireObjectRoot &&
    isRecord(value) &&
    value.type !== undefined &&
    value.type !== "object"
  ) {
    pushSchemaIssue(issues, {
      code: "invalid_value",
      message: "Function input and output schemas must declare an object root type.",
      path: ["type"],
    });
  }
  return issues;
}

function compiledValueValidator(schema: JsonObject): ValidateFunction | null {
  const cached = valueValidators.get(schema);
  if (cached) return cached;
  try {
    const validator = valueAjv.compile(schema);
    valueValidators.set(schema, validator);
    return validator;
  } catch {
    return null;
  }
}

function valueIssue(error: ErrorObject): WorkflowFunctionValueIssue {
  const path = schemaPathSegments(error);
  switch (error.keyword) {
    case "type":
      return {
        code: "invalid_type",
        message: `Expected ${String(error.params.type)}.`,
        path,
      };
    case "required":
      return {
        code: "required",
        message: `Required property "${String(error.params.missingProperty)}" is missing.`,
        path,
      };
    case "additionalProperties":
      return {
        code: "additional_property",
        message: `Property "${String(error.params.additionalProperty)}" is not allowed.`,
        path,
      };
    case "enum":
      return { code: "constraint", message: "Value is not one of the allowed enum values.", path };
    case "const":
      return { code: "constraint", message: "Value does not equal the required constant.", path };
    case "minItems":
      return {
        code: "constraint",
        message: `Array must contain at least ${String(error.params.limit)} item(s).`,
        path,
      };
    case "maxItems":
      return {
        code: "constraint",
        message: `Array must contain at most ${String(error.params.limit)} item(s).`,
        path,
      };
    case "minLength":
      return {
        code: "constraint",
        message: `String must contain at least ${String(error.params.limit)} character(s).`,
        path,
      };
    case "maxLength":
      return {
        code: "constraint",
        message: `String must contain at most ${String(error.params.limit)} character(s).`,
        path,
      };
    case "minimum":
      return {
        code: "constraint",
        message: `Number must be greater than or equal to ${String(error.params.limit)}.`,
        path,
      };
    case "maximum":
      return {
        code: "constraint",
        message: `Number must be less than or equal to ${String(error.params.limit)}.`,
        path,
      };
    default:
      return {
        code: "constraint",
        message: error.message
          ? `Value ${error.message}.`
          : "Value violates the function contract.",
        path,
      };
  }
}

export function validateWorkflowFunctionValue(
  schema: JsonObject,
  value: JsonValue
): WorkflowFunctionValueIssue[] {
  const validator = compiledValueValidator(schema);
  if (!validator) {
    return [{ code: "constraint", message: "Function schema could not be compiled.", path: [] }];
  }
  if (validator(value)) return [];
  const issues: WorkflowFunctionValueIssue[] = [];
  for (const error of validator.errors ?? []) pushValueIssue(issues, valueIssue(error));
  return issues;
}

export function formatWorkflowFunctionValuePath(path: Path): string {
  if (path.length === 0) return "$";
  return path.reduce<string>(
    (current, segment) =>
      typeof segment === "number" ? `${current}[${segment}]` : `${current}.${segment}`,
    "$"
  );
}

export function createWorkflowFunctionPreviewValue(schema: JsonObject): JsonValue {
  if (schema.const !== undefined) return cloneJson(schema.const as JsonValue);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return cloneJson(schema.enum[0] as JsonValue);
  }

  switch (schema.type) {
    case "object": {
      const properties = isRecord(schema.properties)
        ? (schema.properties as Record<string, JsonObject>)
        : {};
      const required = Array.isArray(schema.required)
        ? schema.required.filter((candidate): candidate is string => typeof candidate === "string")
        : [];
      return Object.fromEntries(
        required
          .filter((key) => Object.hasOwn(properties, key))
          .map((key) => [key, createWorkflowFunctionPreviewValue(properties[key]!)])
      );
    }
    case "array": {
      const count =
        typeof schema.minItems === "number" ? Math.min(Math.max(schema.minItems, 0), 10) : 0;
      const itemSchema = isRecord(schema.items) ? (schema.items as JsonObject) : { type: "null" };
      return Array.from({ length: count }, () => createWorkflowFunctionPreviewValue(itemSchema));
    }
    case "string":
      return "x".repeat(
        typeof schema.minLength === "number" ? Math.min(Math.max(schema.minLength, 0), 100) : 0
      );
    case "number":
      return typeof schema.minimum === "number" ? schema.minimum : 0;
    case "integer":
      return typeof schema.minimum === "number" ? Math.ceil(schema.minimum) : 0;
    case "boolean":
      return false;
    case "null":
    default:
      return null;
  }
}
