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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pushSchemaIssue(
  issues: WorkflowFunctionSchemaIssue[],
  issue: WorkflowFunctionSchemaIssue
) {
  if (issues.length < MAX_VALUE_ISSUES) issues.push(issue);
}

function finiteNumber(
  value: unknown,
  path: Path,
  issues: WorkflowFunctionSchemaIssue[],
  options: { integer?: boolean; minimum?: number } = {}
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (options.integer && !Number.isInteger(value)) ||
    (options.minimum !== undefined && value < options.minimum)
  ) {
    pushSchemaIssue(issues, {
      code: "invalid_value",
      message: options.integer
        ? "Value must be a finite integer."
        : "Value must be a finite number.",
      path,
    });
    return undefined;
  }
  return value;
}

function stringMetadata(
  schema: Record<string, unknown>,
  key: "title" | "description",
  path: Path,
  issues: WorkflowFunctionSchemaIssue[]
) {
  const value = schema[key];
  if (value === undefined) return;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > (key === "title" ? 160 : 2_000)
  ) {
    pushSchemaIssue(issues, {
      code: "invalid_value",
      message: `"${key}" must be a non-empty bounded string.`,
      path: [...path, key],
    });
  }
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

function validateSchemaNode(
  value: unknown,
  path: Path,
  issues: WorkflowFunctionSchemaIssue[],
  state: { nodes: number },
  depth: number
) {
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
  if (!isRecord(value)) {
    pushSchemaIssue(issues, {
      code: value === undefined ? "required" : "invalid_type",
      message: "Schema nodes must be objects.",
      path,
    });
    return;
  }

  const type = value.type;
  if (typeof type !== "string" || !SCHEMA_TYPES.has(type as SchemaType)) {
    pushSchemaIssue(issues, {
      code: type === undefined ? "required" : "invalid_value",
      message: "Schema nodes require one supported scalar, object, or array type.",
      path: [...path, "type"],
    });
    return;
  }
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

  stringMetadata(value, "title", path, issues);
  stringMetadata(value, "description", path, issues);

  if (value.enum !== undefined) {
    if (
      !Array.isArray(value.enum) ||
      value.enum.length === 0 ||
      value.enum.length > MAX_SCHEMA_ENUM_VALUES
    ) {
      pushSchemaIssue(issues, {
        code: "invalid_value",
        message: `"enum" must contain between 1 and ${MAX_SCHEMA_ENUM_VALUES} values.`,
        path: [...path, "enum"],
      });
    } else {
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
      const properties = value.properties;
      if (properties !== undefined && !isRecord(properties)) {
        pushSchemaIssue(issues, {
          code: "invalid_type",
          message: `"properties" must be an object of named schemas.`,
          path: [...path, "properties"],
        });
      } else if (properties) {
        const entries = Object.entries(properties);
        if (entries.length > MAX_SCHEMA_PROPERTIES) {
          pushSchemaIssue(issues, {
            code: "limit_exceeded",
            message: `Schema objects cannot declare more than ${MAX_SCHEMA_PROPERTIES} properties.`,
            path: [...path, "properties"],
          });
        }
        for (const [key, child] of entries) {
          if (key.length === 0 || key.length > 128) {
            pushSchemaIssue(issues, {
              code: "invalid_value",
              message: "Schema property names must contain between 1 and 128 characters.",
              path: [...path, "properties", key],
            });
          }
          validateSchemaNode(child, [...path, "properties", key], issues, state, depth + 1);
        }
      }

      if (value.required !== undefined) {
        if (!Array.isArray(value.required)) {
          pushSchemaIssue(issues, {
            code: "invalid_type",
            message: `"required" must be an array of property names.`,
            path: [...path, "required"],
          });
        } else {
          const seen = new Set<string>();
          value.required.forEach((required, index) => {
            if (typeof required !== "string" || required.length === 0) {
              pushSchemaIssue(issues, {
                code: "invalid_type",
                message: "Required property names must be non-empty strings.",
                path: [...path, "required", index],
              });
              return;
            }
            if (seen.has(required)) {
              pushSchemaIssue(issues, {
                code: "invalid_value",
                message: `Required property "${required}" is duplicated.`,
                path: [...path, "required", index],
              });
            }
            if (!properties || !Object.hasOwn(properties, required)) {
              pushSchemaIssue(issues, {
                code: "invalid_value",
                message: `Required property "${required}" must exist in "properties".`,
                path: [...path, "required", index],
              });
            }
            seen.add(required);
          });
        }
      }

      if (
        value.additionalProperties !== undefined &&
        typeof value.additionalProperties !== "boolean"
      ) {
        pushSchemaIssue(issues, {
          code: "invalid_type",
          message: `"additionalProperties" must be a boolean.`,
          path: [...path, "additionalProperties"],
        });
      }
      break;
    }
    case "array": {
      if (value.items === undefined) {
        pushSchemaIssue(issues, {
          code: "required",
          message: `Array schemas require an "items" schema.`,
          path: [...path, "items"],
        });
      } else {
        validateSchemaNode(value.items, [...path, "items"], issues, state, depth + 1);
      }
      const minItems = finiteNumber(value.minItems, [...path, "minItems"], issues, {
        integer: true,
        minimum: 0,
      });
      const maxItems = finiteNumber(value.maxItems, [...path, "maxItems"], issues, {
        integer: true,
        minimum: 0,
      });
      if (minItems !== undefined && maxItems !== undefined && maxItems < minItems) {
        pushSchemaIssue(issues, {
          code: "invalid_value",
          message: `"maxItems" must be greater than or equal to "minItems".`,
          path: [...path, "maxItems"],
        });
      }
      break;
    }
    case "string": {
      const minLength = finiteNumber(value.minLength, [...path, "minLength"], issues, {
        integer: true,
        minimum: 0,
      });
      const maxLength = finiteNumber(value.maxLength, [...path, "maxLength"], issues, {
        integer: true,
        minimum: 0,
      });
      if (minLength !== undefined && maxLength !== undefined && maxLength < minLength) {
        pushSchemaIssue(issues, {
          code: "invalid_value",
          message: `"maxLength" must be greater than or equal to "minLength".`,
          path: [...path, "maxLength"],
        });
      }
      break;
    }
    case "number":
    case "integer": {
      const minimum = finiteNumber(value.minimum, [...path, "minimum"], issues);
      const maximum = finiteNumber(value.maximum, [...path, "maximum"], issues);
      if (minimum !== undefined && maximum !== undefined && maximum < minimum) {
        pushSchemaIssue(issues, {
          code: "invalid_value",
          message: `"maximum" must be greater than or equal to "minimum".`,
          path: [...path, "maximum"],
        });
      }
      break;
    }
    case "boolean":
    case "null":
      break;
  }
}

export function validateWorkflowFunctionSchema(
  value: unknown,
  options: { requireObjectRoot?: boolean } = {}
): WorkflowFunctionSchemaIssue[] {
  const issues: WorkflowFunctionSchemaIssue[] = [];
  validateSchemaNode(value, [], issues, { nodes: 0 }, 0);
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

function pushValueIssue(issues: WorkflowFunctionValueIssue[], issue: WorkflowFunctionValueIssue) {
  if (issues.length < MAX_VALUE_ISSUES) issues.push(issue);
}

function validateValueNode(
  schema: JsonObject,
  value: JsonValue,
  path: Path,
  issues: WorkflowFunctionValueIssue[],
  depth: number
) {
  if (issues.length >= MAX_VALUE_ISSUES) return;
  if (depth > MAX_SCHEMA_DEPTH) {
    pushValueIssue(issues, {
      code: "constraint",
      message: "Value nesting exceeds the function contract limit.",
      path,
    });
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => jsonEqual(candidate, value))) {
    pushValueIssue(issues, {
      code: "constraint",
      message: "Value is not one of the allowed enum values.",
      path,
    });
    return;
  }
  if (schema.const !== undefined && !jsonEqual(schema.const, value)) {
    pushValueIssue(issues, {
      code: "constraint",
      message: "Value does not equal the required constant.",
      path,
    });
    return;
  }

  const type = schema.type as SchemaType;
  if (!matchesDeclaredType(type, value)) {
    pushValueIssue(issues, {
      code: "invalid_type",
      message: `Expected ${type}.`,
      path,
    });
    return;
  }

  switch (type) {
    case "object": {
      const object = value as JsonObject;
      const properties = isRecord(schema.properties)
        ? (schema.properties as Record<string, JsonObject>)
        : {};
      const required = Array.isArray(schema.required)
        ? schema.required.filter((candidate): candidate is string => typeof candidate === "string")
        : [];
      for (const key of required) {
        if (!Object.hasOwn(object, key)) {
          pushValueIssue(issues, {
            code: "required",
            message: `Required property "${key}" is missing.`,
            path: [...path, key],
          });
        }
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(object)) {
          if (!Object.hasOwn(properties, key)) {
            pushValueIssue(issues, {
              code: "additional_property",
              message: `Property "${key}" is not allowed.`,
              path: [...path, key],
            });
          }
        }
      }
      for (const [key, childSchema] of Object.entries(properties)) {
        if (Object.hasOwn(object, key)) {
          validateValueNode(childSchema, object[key]!, [...path, key], issues, depth + 1);
        }
      }
      break;
    }
    case "array": {
      const array = value as JsonValue[];
      const minItems = typeof schema.minItems === "number" ? schema.minItems : undefined;
      const maxItems = typeof schema.maxItems === "number" ? schema.maxItems : undefined;
      if (minItems !== undefined && array.length < minItems) {
        pushValueIssue(issues, {
          code: "constraint",
          message: `Array must contain at least ${minItems} item(s).`,
          path,
        });
      }
      if (maxItems !== undefined && array.length > maxItems) {
        pushValueIssue(issues, {
          code: "constraint",
          message: `Array must contain at most ${maxItems} item(s).`,
          path,
        });
      }
      if (isRecord(schema.items)) {
        array.forEach((entry, index) =>
          validateValueNode(schema.items as JsonObject, entry, [...path, index], issues, depth + 1)
        );
      }
      break;
    }
    case "string": {
      const string = value as string;
      const minLength = typeof schema.minLength === "number" ? schema.minLength : undefined;
      const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : undefined;
      if (minLength !== undefined && string.length < minLength) {
        pushValueIssue(issues, {
          code: "constraint",
          message: `String must contain at least ${minLength} character(s).`,
          path,
        });
      }
      if (maxLength !== undefined && string.length > maxLength) {
        pushValueIssue(issues, {
          code: "constraint",
          message: `String must contain at most ${maxLength} character(s).`,
          path,
        });
      }
      break;
    }
    case "number":
    case "integer": {
      const number = value as number;
      const minimum = typeof schema.minimum === "number" ? schema.minimum : undefined;
      const maximum = typeof schema.maximum === "number" ? schema.maximum : undefined;
      if (minimum !== undefined && number < minimum) {
        pushValueIssue(issues, {
          code: "constraint",
          message: `Number must be greater than or equal to ${minimum}.`,
          path,
        });
      }
      if (maximum !== undefined && number > maximum) {
        pushValueIssue(issues, {
          code: "constraint",
          message: `Number must be less than or equal to ${maximum}.`,
          path,
        });
      }
      break;
    }
    case "boolean":
    case "null":
      break;
  }
}

export function validateWorkflowFunctionValue(
  schema: JsonObject,
  value: JsonValue
): WorkflowFunctionValueIssue[] {
  const issues: WorkflowFunctionValueIssue[] = [];
  validateValueNode(schema, value, [], issues, 0);
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
