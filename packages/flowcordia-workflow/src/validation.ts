import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  type JsonObject,
  type WorkflowDefinition,
  type WorkflowEntityReference,
  type WorkflowIssue,
  type WorkflowNodeKind,
  type WorkflowValidationResult,
} from "./types.js";

const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;
const ENTITY_ID_PATTERN = /^[a-z][a-z0-9_-]{1,127}$/;
const NODE_KINDS = new Set<WorkflowNodeKind>([
  "trigger",
  "action",
  "control",
  "code",
  "subflow",
  "approval",
  "output",
]);

const WORKFLOW_KEYS = new Set([
  "schemaVersion",
  "id",
  "name",
  "description",
  "nodes",
  "edges",
  "labels",
  "metadata",
]);
const NODE_KEYS = new Set([
  "id",
  "name",
  "kind",
  "operation",
  "position",
  "configuration",
  "inputSchema",
  "outputSchema",
  "credentialReferences",
  "runtime",
  "codeReference",
]);
const EDGE_KEYS = new Set(["id", "source", "target", "sourceHandle", "targetHandle", "condition"]);
const RUNTIME_KEYS = new Set(["queue", "concurrencyKey", "machine", "maxDurationSeconds", "retry"]);
const RETRY_KEYS = new Set(["maxAttempts", "minTimeoutMs", "maxTimeoutMs", "factor"]);
const CODE_REFERENCE_KEYS = new Set(["repository", "path", "exportName", "commit"]);
const METADATA_KEYS = new Set(["createdBy", "updatedAt", "sourceRepository", "sourcePath"]);
const POSITION_KEYS = new Set(["x", "y"]);

type UnknownRecord = Record<string, unknown>;
type Path = ReadonlyArray<string | number>;

function isRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pushIssue(
  issues: WorkflowIssue[],
  issue: Omit<WorkflowIssue, "entity"> & { entity?: WorkflowEntityReference }
) {
  issues.push({
    ...issue,
    entity: issue.entity ?? { type: "workflow" },
  });
}

function validateKnownProperties(
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference
) {
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      pushIssue(issues, {
        code: "unknown_property",
        message: `Unknown property "${key}".`,
        path: [...path, key],
        entity,
      });
    }
  });
}

function validateString(
  value: UnknownRecord,
  key: string,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  } = {}
): string | undefined {
  const candidate = value[key];

  if (candidate === undefined) {
    if (options.required) {
      pushIssue(issues, {
        code: "required",
        message: `"${key}" is required.`,
        path: [...path, key],
        entity,
      });
    }
    return undefined;
  }

  if (typeof candidate !== "string") {
    pushIssue(issues, {
      code: "invalid_type",
      message: `"${key}" must be a string.`,
      path: [...path, key],
      entity,
    });
    return undefined;
  }

  if (options.minLength !== undefined && candidate.length < options.minLength) {
    pushIssue(issues, {
      code: "invalid_value",
      message: `"${key}" must contain at least ${options.minLength} character(s).`,
      path: [...path, key],
      entity,
    });
  }

  if (options.maxLength !== undefined && candidate.length > options.maxLength) {
    pushIssue(issues, {
      code: "invalid_value",
      message: `"${key}" must contain at most ${options.maxLength} character(s).`,
      path: [...path, key],
      entity,
    });
  }

  if (options.pattern && !options.pattern.test(candidate)) {
    pushIssue(issues, {
      code: "invalid_value",
      message: `"${key}" has an invalid format.`,
      path: [...path, key],
      entity,
    });
  }

  return candidate;
}

function validateFiniteNumber(
  value: UnknownRecord,
  key: string,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference,
  options: { required?: boolean; integer?: boolean; minimum?: number } = {}
): number | undefined {
  const candidate = value[key];

  if (candidate === undefined) {
    if (options.required) {
      pushIssue(issues, {
        code: "required",
        message: `"${key}" is required.`,
        path: [...path, key],
        entity,
      });
    }
    return undefined;
  }

  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    pushIssue(issues, {
      code: "invalid_type",
      message: `"${key}" must be a finite number.`,
      path: [...path, key],
      entity,
    });
    return undefined;
  }

  if (options.integer && !Number.isInteger(candidate)) {
    pushIssue(issues, {
      code: "invalid_value",
      message: `"${key}" must be an integer.`,
      path: [...path, key],
      entity,
    });
  }

  if (options.minimum !== undefined && candidate < options.minimum) {
    pushIssue(issues, {
      code: "invalid_value",
      message: `"${key}" must be at least ${options.minimum}.`,
      path: [...path, key],
      entity,
    });
  }

  return candidate;
}

function validateJsonValue(
  value: unknown,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference,
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
      pushIssue(issues, {
        code: "invalid_value",
        message: "JSON values cannot contain circular references.",
        path,
        entity,
      });
      return;
    }

    ancestors.add(value);
    value.forEach((child, index) =>
      validateJsonValue(child, [...path, index], issues, entity, ancestors)
    );
    ancestors.delete(value);
    return;
  }

  if (isRecord(value)) {
    if (ancestors.has(value)) {
      pushIssue(issues, {
        code: "invalid_value",
        message: "JSON values cannot contain circular references.",
        path,
        entity,
      });
      return;
    }

    ancestors.add(value);
    Object.entries(value).forEach(([key, child]) =>
      validateJsonValue(child, [...path, key], issues, entity, ancestors)
    );
    ancestors.delete(value);
    return;
  }

  pushIssue(issues, {
    code: "invalid_type",
    message: "Value must be valid JSON.",
    path,
    entity,
  });
}

function validateJsonObject(
  value: unknown,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference,
  required: boolean
) {
  if (value === undefined && !required) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, {
      code: value === undefined ? "required" : "invalid_type",
      message: value === undefined ? "Object is required." : "Value must be a JSON object.",
      path,
      entity,
    });
    return;
  }

  validateJsonValue(value as JsonObject, path, issues, entity);
}

function validateStringArray(
  value: unknown,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference,
  options: { minLength?: number; maxLength?: number; unique?: boolean } = {}
) {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, {
      code: "invalid_type",
      message: "Value must be an array of strings.",
      path,
      entity,
    });
    return;
  }

  const seen = new Set<string>();
  value.forEach((candidate, index) => {
    if (typeof candidate !== "string") {
      pushIssue(issues, {
        code: "invalid_type",
        message: "Value must be a string.",
        path: [...path, index],
        entity,
      });
      return;
    }

    if (options.minLength !== undefined && candidate.length < options.minLength) {
      pushIssue(issues, {
        code: "invalid_value",
        message: `Value must contain at least ${options.minLength} character(s).`,
        path: [...path, index],
        entity,
      });
    }

    if (options.maxLength !== undefined && candidate.length > options.maxLength) {
      pushIssue(issues, {
        code: "invalid_value",
        message: `Value must contain at most ${options.maxLength} character(s).`,
        path: [...path, index],
        entity,
      });
    }

    if (options.unique && seen.has(candidate)) {
      pushIssue(issues, {
        code: "duplicate_id",
        message: `Duplicate value "${candidate}".`,
        path: [...path, index],
        entity,
      });
    }
    seen.add(candidate);
  });
}

function validatePosition(
  value: unknown,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference
) {
  if (!isRecord(value)) {
    pushIssue(issues, {
      code: value === undefined ? "required" : "invalid_type",
      message: "Position must be an object containing finite x and y coordinates.",
      path,
      entity,
    });
    return;
  }

  validateKnownProperties(value, POSITION_KEYS, path, issues, entity);
  validateFiniteNumber(value, "x", path, issues, entity, { required: true });
  validateFiniteNumber(value, "y", path, issues, entity, { required: true });
}

function validateRetryPolicy(
  value: unknown,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference
) {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, {
      code: "invalid_type",
      message: "Retry policy must be an object.",
      path,
      entity,
    });
    return;
  }

  validateKnownProperties(value, RETRY_KEYS, path, issues, entity);
  validateFiniteNumber(value, "maxAttempts", path, issues, entity, {
    integer: true,
    minimum: 0,
  });
  const minTimeout = validateFiniteNumber(value, "minTimeoutMs", path, issues, entity, {
    integer: true,
    minimum: 0,
  });
  const maxTimeout = validateFiniteNumber(value, "maxTimeoutMs", path, issues, entity, {
    integer: true,
    minimum: 0,
  });
  validateFiniteNumber(value, "factor", path, issues, entity, { minimum: 1 });

  if (minTimeout !== undefined && maxTimeout !== undefined && maxTimeout < minTimeout) {
    pushIssue(issues, {
      code: "invalid_value",
      message: '"maxTimeoutMs" must be greater than or equal to "minTimeoutMs".',
      path: [...path, "maxTimeoutMs"],
      entity,
    });
  }
}

function validateRuntimePolicy(
  value: unknown,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference
) {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, {
      code: "invalid_type",
      message: "Runtime policy must be an object.",
      path,
      entity,
    });
    return;
  }

  validateKnownProperties(value, RUNTIME_KEYS, path, issues, entity);
  validateString(value, "queue", path, issues, entity, { minLength: 1 });
  validateString(value, "concurrencyKey", path, issues, entity, { minLength: 1 });
  validateString(value, "machine", path, issues, entity, { minLength: 1 });
  validateFiniteNumber(value, "maxDurationSeconds", path, issues, entity, {
    integer: true,
    minimum: 1,
  });
  validateRetryPolicy(value.retry, [...path, "retry"], issues, entity);
}

function validateCodeReference(
  value: unknown,
  path: Path,
  issues: WorkflowIssue[],
  entity: WorkflowEntityReference
) {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, {
      code: "invalid_type",
      message: "Code reference must be an object.",
      path,
      entity,
    });
    return;
  }

  validateKnownProperties(value, CODE_REFERENCE_KEYS, path, issues, entity);
  validateString(value, "repository", path, issues, entity, { minLength: 1 });
  validateString(value, "path", path, issues, entity, { required: true, minLength: 1 });
  validateString(value, "exportName", path, issues, entity, {
    required: true,
    minLength: 1,
  });
  validateString(value, "commit", path, issues, entity, { minLength: 1 });
}

function validateNode(value: unknown, index: number, issues: WorkflowIssue[]): string | undefined {
  const path: Path = ["nodes", index];

  if (!isRecord(value)) {
    pushIssue(issues, {
      code: "invalid_type",
      message: "Node must be an object.",
      path,
      entity: { type: "node" },
    });
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : undefined;
  const entity: WorkflowEntityReference = { type: "node", id };
  validateKnownProperties(value, NODE_KEYS, path, issues, entity);
  validateString(value, "id", path, issues, entity, {
    required: true,
    pattern: ENTITY_ID_PATTERN,
  });
  validateString(value, "name", path, issues, entity, { minLength: 1, maxLength: 160 });
  const kind = validateString(value, "kind", path, issues, entity, { required: true });
  if (kind !== undefined && !NODE_KINDS.has(kind as WorkflowNodeKind)) {
    pushIssue(issues, {
      code: "invalid_value",
      message: `Unsupported node kind "${kind}".`,
      path: [...path, "kind"],
      entity,
    });
  }
  validateString(value, "operation", path, issues, entity, {
    required: true,
    minLength: 1,
    maxLength: 200,
  });
  validatePosition(value.position, [...path, "position"], issues, entity);
  validateJsonObject(value.configuration, [...path, "configuration"], issues, entity, true);
  validateJsonObject(value.inputSchema, [...path, "inputSchema"], issues, entity, false);
  validateJsonObject(value.outputSchema, [...path, "outputSchema"], issues, entity, false);
  validateStringArray(
    value.credentialReferences,
    [...path, "credentialReferences"],
    issues,
    entity,
    {
      minLength: 1,
      unique: true,
    }
  );
  validateRuntimePolicy(value.runtime, [...path, "runtime"], issues, entity);
  validateCodeReference(value.codeReference, [...path, "codeReference"], issues, entity);

  return id;
}

function validateEdge(value: unknown, index: number, issues: WorkflowIssue[]) {
  const path: Path = ["edges", index];

  if (!isRecord(value)) {
    pushIssue(issues, {
      code: "invalid_type",
      message: "Edge must be an object.",
      path,
      entity: { type: "edge" },
    });
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : undefined;
  const entity: WorkflowEntityReference = { type: "edge", id };
  validateKnownProperties(value, EDGE_KEYS, path, issues, entity);
  validateString(value, "id", path, issues, entity, {
    required: true,
    pattern: ENTITY_ID_PATTERN,
  });
  const source = validateString(value, "source", path, issues, entity, {
    required: true,
    minLength: 1,
  });
  const target = validateString(value, "target", path, issues, entity, {
    required: true,
    minLength: 1,
  });
  const sourceHandle = validateString(value, "sourceHandle", path, issues, entity, {
    minLength: 1,
  });
  const targetHandle = validateString(value, "targetHandle", path, issues, entity, {
    minLength: 1,
  });
  validateString(value, "condition", path, issues, entity, { maxLength: 4000 });

  return { id, source, target, sourceHandle, targetHandle };
}

function validateMetadata(value: unknown, issues: WorkflowIssue[]) {
  if (value === undefined) {
    return;
  }

  const path: Path = ["metadata"];
  const entity: WorkflowEntityReference = { type: "workflow" };
  if (!isRecord(value)) {
    pushIssue(issues, {
      code: "invalid_type",
      message: "Metadata must be an object.",
      path,
      entity,
    });
    return;
  }

  validateKnownProperties(value, METADATA_KEYS, path, issues, entity);
  validateString(value, "createdBy", path, issues, entity);
  const updatedAt = validateString(value, "updatedAt", path, issues, entity);
  validateString(value, "sourceRepository", path, issues, entity);
  validateString(value, "sourcePath", path, issues, entity);

  if (updatedAt !== undefined && Number.isNaN(Date.parse(updatedAt))) {
    pushIssue(issues, {
      code: "invalid_value",
      message: '"updatedAt" must be a valid date-time string.',
      path: [...path, "updatedAt"],
      entity,
    });
  }
}

export function validateWorkflow(input: unknown): WorkflowValidationResult {
  const issues: WorkflowIssue[] = [];

  if (!isRecord(input)) {
    return {
      success: false,
      issues: [
        {
          code: "invalid_type",
          message: "Workflow must be an object.",
          path: [],
          entity: { type: "workflow" },
        },
      ],
    };
  }

  validateKnownProperties(input, WORKFLOW_KEYS, [], issues, { type: "workflow" });
  const schemaVersion = validateString(
    input,
    "schemaVersion",
    [],
    issues,
    { type: "workflow" },
    {
      required: true,
    }
  );
  if (schemaVersion !== undefined && schemaVersion !== CURRENT_WORKFLOW_SCHEMA_VERSION) {
    pushIssue(issues, {
      code: "invalid_value",
      message: `Unsupported schema version "${schemaVersion}".`,
      path: ["schemaVersion"],
    });
  }

  const workflowId = validateString(
    input,
    "id",
    [],
    issues,
    { type: "workflow" },
    {
      required: true,
      pattern: WORKFLOW_ID_PATTERN,
    }
  );
  const workflowEntity: WorkflowEntityReference = { type: "workflow", id: workflowId };
  validateString(input, "name", [], issues, workflowEntity, {
    required: true,
    minLength: 1,
    maxLength: 160,
  });
  validateString(input, "description", [], issues, workflowEntity, { maxLength: 2000 });
  validateStringArray(input.labels, ["labels"], issues, workflowEntity, {
    minLength: 1,
    maxLength: 64,
    unique: true,
  });
  validateMetadata(input.metadata, issues);

  const nodeIds = new Set<string>();
  if (!Array.isArray(input.nodes)) {
    pushIssue(issues, {
      code: input.nodes === undefined ? "required" : "invalid_type",
      message: '"nodes" must be an array.',
      path: ["nodes"],
      entity: workflowEntity,
    });
  } else {
    input.nodes.forEach((node, index) => {
      const id = validateNode(node, index, issues);
      if (!id) {
        return;
      }

      if (nodeIds.has(id)) {
        pushIssue(issues, {
          code: "duplicate_id",
          message: `Duplicate node ID "${id}".`,
          path: ["nodes", index, "id"],
          entity: { type: "node", id },
        });
      }
      nodeIds.add(id);
    });
  }

  const edgeIds = new Set<string>();
  const connectionKeys = new Set<string>();
  if (!Array.isArray(input.edges)) {
    pushIssue(issues, {
      code: input.edges === undefined ? "required" : "invalid_type",
      message: '"edges" must be an array.',
      path: ["edges"],
      entity: workflowEntity,
    });
  } else {
    input.edges.forEach((edge, index) => {
      const parsed = validateEdge(edge, index, issues);
      if (!parsed) {
        return;
      }

      if (parsed.id) {
        if (edgeIds.has(parsed.id)) {
          pushIssue(issues, {
            code: "duplicate_id",
            message: `Duplicate edge ID "${parsed.id}".`,
            path: ["edges", index, "id"],
            entity: { type: "edge", id: parsed.id },
          });
        }
        edgeIds.add(parsed.id);
      }

      if (parsed.source && !nodeIds.has(parsed.source)) {
        pushIssue(issues, {
          code: "missing_reference",
          message: `Source node "${parsed.source}" does not exist.`,
          path: ["edges", index, "source"],
          entity: { type: "edge", id: parsed.id },
        });
      }

      if (parsed.target && !nodeIds.has(parsed.target)) {
        pushIssue(issues, {
          code: "missing_reference",
          message: `Target node "${parsed.target}" does not exist.`,
          path: ["edges", index, "target"],
          entity: { type: "edge", id: parsed.id },
        });
      }

      if (parsed.source && parsed.target) {
        const connectionKey = [
          parsed.source,
          parsed.sourceHandle ?? "",
          parsed.target,
          parsed.targetHandle ?? "",
        ].join("\u0000");
        if (connectionKeys.has(connectionKey)) {
          pushIssue(issues, {
            code: "duplicate_connection",
            message: "The same node handles cannot be connected more than once.",
            path: ["edges", index],
            entity: { type: "edge", id: parsed.id },
          });
        }
        connectionKeys.add(connectionKey);
      }
    });
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  return {
    success: true,
    workflow: input as unknown as WorkflowDefinition,
    issues: [],
  };
}

export function parseWorkflowDocument(text: string): WorkflowValidationResult {
  try {
    return validateWorkflow(JSON.parse(text));
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          code: "invalid_json",
          message: error instanceof Error ? error.message : "Workflow is not valid JSON.",
          path: [],
          entity: { type: "workflow" },
        },
      ],
    };
  }
}

export function formatWorkflowIssuePath(path: ReadonlyArray<string | number>): string {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((result, part) => {
    if (typeof part === "number") {
      return `${result}[${part}]`;
    }

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)) {
      return `${result}.${part}`;
    }

    return `${result}[${JSON.stringify(part)}]`;
  }, "$");
}
