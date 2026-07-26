import {
  createJsonSchemaValidator,
  findJsonCompatibilityIssue,
  schemaPathSegments,
  type ErrorObject,
} from "@flowcordia/foundation";

import workflowSchema from "../schema/0.1.json" with { type: "json" };
import {
  type WorkflowDefinition,
  type WorkflowEntityReference,
  type WorkflowIssue,
  type WorkflowIssueCode,
  type WorkflowValidationResult,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;
type Path = ReadonlyArray<string | number>;

const workflowValidator = createJsonSchemaValidator().compile<WorkflowDefinition>(workflowSchema);

function isRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function entityForPath(input: UnknownRecord, path: Path): WorkflowEntityReference {
  const collection = path[0];
  const index = path[1];
  if ((collection === "nodes" || collection === "edges") && typeof index === "number") {
    const candidate = Array.isArray(input[collection]) ? input[collection][index] : undefined;
    const id = isRecord(candidate) && typeof candidate.id === "string" ? candidate.id : undefined;
    return { type: collection === "nodes" ? "node" : "edge", id };
  }
  return { type: "workflow", id: typeof input.id === "string" ? input.id : undefined };
}

function errorCode(error: ErrorObject, path: Path): WorkflowIssueCode {
  switch (error.keyword) {
    case "additionalProperties":
      return "unknown_property";
    case "required":
      return "required";
    case "type":
      return "invalid_type";
    case "uniqueItems":
      return path[0] === "labels" || path.includes("credentialReferences")
        ? "duplicate_id"
        : "invalid_value";
    default:
      return "invalid_value";
  }
}

function fieldName(path: Path): string | null {
  const field = path.at(-1);
  return typeof field === "string" ? field : null;
}

function typeMessage(path: Path): string {
  if (path.length === 0) return "Workflow must be an object.";
  if (path.length === 1 && path[0] === "nodes") return '"nodes" must be an array.';
  if (path.length === 1 && path[0] === "edges") return '"edges" must be an array.';
  if (path[0] === "nodes" && path.length === 2) return "Node must be an object.";
  if (path[0] === "edges" && path.length === 2) return "Edge must be an object.";
  if (path.at(-1) === "position") {
    return "Position must be an object containing finite x and y coordinates.";
  }
  if (["configuration", "inputSchema", "outputSchema"].includes(String(path.at(-1)))) {
    return "Value must be a JSON object.";
  }
  const field = fieldName(path);
  return field ? `"${field}" has an invalid type.` : "Value has an invalid type.";
}

function errorMessage(error: ErrorObject, path: Path, input: UnknownRecord): string {
  const field = fieldName(path);
  const observed = valueAtPath(input, path);
  switch (error.keyword) {
    case "additionalProperties":
      return `Unknown property "${String(error.params.additionalProperty)}".`;
    case "required":
      return `"${String(error.params.missingProperty)}" is required.`;
    case "type":
      return typeMessage(path);
    case "const":
      if (path.length === 1 && path[0] === "schemaVersion") {
        return `Unsupported schema version "${String(observed)}".`;
      }
      return field ? `"${field}" has an invalid value.` : "Value is invalid.";
    case "enum":
      if (path.at(-1) === "kind") return `Unsupported node kind "${String(observed)}".`;
      return field ? `"${field}" has an unsupported value.` : "Value is unsupported.";
    case "pattern":
      return field ? `"${field}" has an invalid format.` : "Value has an invalid format.";
    case "minLength":
      return field
        ? `"${field}" must contain at least ${String(error.params.limit)} character(s).`
        : `Value must contain at least ${String(error.params.limit)} character(s).`;
    case "maxLength":
      return field
        ? `"${field}" must contain at most ${String(error.params.limit)} character(s).`
        : `Value must contain at most ${String(error.params.limit)} character(s).`;
    case "minimum":
      return field
        ? `"${field}" must be at least ${String(error.params.limit)}.`
        : `Value must be at least ${String(error.params.limit)}.`;
    case "uniqueItems": {
      const duplicateIndex = Number(error.params.j);
      const collection = valueAtPath(input, path);
      const duplicate = Array.isArray(collection) ? collection[duplicateIndex] : undefined;
      return `Duplicate value "${String(duplicate)}".`;
    }
    default:
      return error.message ? `Value ${error.message}.` : "Value is invalid.";
  }
}

function issueFromSchemaError(error: ErrorObject, input: UnknownRecord): WorkflowIssue {
  const path = schemaPathSegments(error);
  return {
    code: errorCode(error, path),
    message: errorMessage(error, path, input),
    path,
    entity: entityForPath(input, path),
  };
}

function issueKey(issue: WorkflowIssue): string {
  return `${issue.code}:${JSON.stringify(issue.path)}:${issue.entity.type}:${issue.entity.id ?? ""}`;
}

function pushUnique(issues: WorkflowIssue[], issue: WorkflowIssue): void {
  const key = issueKey(issue);
  if (!issues.some((candidate) => issueKey(candidate) === key)) issues.push(issue);
}

function validateDomainRules(input: UnknownRecord, issues: WorkflowIssue[]): void {
  const workflowEntity: WorkflowEntityReference = {
    type: "workflow",
    id: typeof input.id === "string" ? input.id : undefined,
  };

  const updatedAt = isRecord(input.metadata) ? input.metadata.updatedAt : undefined;
  if (typeof updatedAt === "string" && Number.isNaN(Date.parse(updatedAt))) {
    pushUnique(issues, {
      code: "invalid_value",
      message: '"updatedAt" must be a valid date-time string.',
      path: ["metadata", "updatedAt"],
      entity: workflowEntity,
    });
  }

  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const nodeIds = new Set<string>();
  nodes.forEach((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string") return;
    if (nodeIds.has(candidate.id)) {
      pushUnique(issues, {
        code: "duplicate_id",
        message: `Duplicate node ID "${candidate.id}".`,
        path: ["nodes", index, "id"],
        entity: { type: "node", id: candidate.id },
      });
    }
    nodeIds.add(candidate.id);

    const retry =
      isRecord(candidate.runtime) && isRecord(candidate.runtime.retry)
        ? candidate.runtime.retry
        : null;
    if (
      retry &&
      typeof retry.minTimeoutMs === "number" &&
      Number.isFinite(retry.minTimeoutMs) &&
      typeof retry.maxTimeoutMs === "number" &&
      Number.isFinite(retry.maxTimeoutMs) &&
      retry.maxTimeoutMs < retry.minTimeoutMs
    ) {
      pushUnique(issues, {
        code: "invalid_value",
        message: '"maxTimeoutMs" must be greater than or equal to "minTimeoutMs".',
        path: ["nodes", index, "runtime", "retry", "maxTimeoutMs"],
        entity: { type: "node", id: candidate.id },
      });
    }
  });

  const edgeIds = new Set<string>();
  const connectionKeys = new Set<string>();
  const edges = Array.isArray(input.edges) ? input.edges : [];
  edges.forEach((candidate, index) => {
    if (!isRecord(candidate)) return;
    const id = typeof candidate.id === "string" ? candidate.id : undefined;
    const source = typeof candidate.source === "string" ? candidate.source : undefined;
    const target = typeof candidate.target === "string" ? candidate.target : undefined;
    const entity: WorkflowEntityReference = { type: "edge", id };

    if (id) {
      if (edgeIds.has(id)) {
        pushUnique(issues, {
          code: "duplicate_id",
          message: `Duplicate edge ID "${id}".`,
          path: ["edges", index, "id"],
          entity,
        });
      }
      edgeIds.add(id);
    }
    if (source && !nodeIds.has(source)) {
      pushUnique(issues, {
        code: "missing_reference",
        message: `Source node "${source}" does not exist.`,
        path: ["edges", index, "source"],
        entity,
      });
    }
    if (target && !nodeIds.has(target)) {
      pushUnique(issues, {
        code: "missing_reference",
        message: `Target node "${target}" does not exist.`,
        path: ["edges", index, "target"],
        entity,
      });
    }
    if (source && target) {
      const connectionKey = [
        source,
        typeof candidate.sourceHandle === "string" ? candidate.sourceHandle : "",
        target,
        typeof candidate.targetHandle === "string" ? candidate.targetHandle : "",
      ].join("\u0000");
      if (connectionKeys.has(connectionKey)) {
        pushUnique(issues, {
          code: "duplicate_connection",
          message: "The same node handles cannot be connected more than once.",
          path: ["edges", index],
          entity,
        });
      }
      connectionKeys.add(connectionKey);
    }
  });
}

export function validateWorkflow(input: unknown): WorkflowValidationResult {
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

  const issues: WorkflowIssue[] = [];
  const compatibility = findJsonCompatibilityIssue(input);
  if (compatibility) {
    pushUnique(issues, {
      code: compatibility.code === "circular_reference" ? "invalid_value" : "invalid_type",
      message:
        compatibility.code === "circular_reference"
          ? "JSON values cannot contain circular references."
          : "Value must be valid JSON.",
      path: compatibility.path,
      entity: entityForPath(input, compatibility.path),
    });
    if (compatibility.code === "circular_reference") return { success: false, issues };
  }

  if (!workflowValidator(input)) {
    for (const error of workflowValidator.errors ?? []) {
      pushUnique(issues, issueFromSchemaError(error, input));
    }
  }
  validateDomainRules(input, issues);

  if (issues.length > 0) return { success: false, issues };
  return { success: true, workflow: input as unknown as WorkflowDefinition, issues: [] };
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
  if (path.length === 0) return "$";
  return path.reduce<string>((result, part) => {
    if (typeof part === "number") return `${result}[${part}]`;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)) return `${result}.${part}`;
    return `${result}[${JSON.stringify(part)}]`;
  }, "$" as string);
}
