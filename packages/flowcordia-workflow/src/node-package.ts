import { createHash } from "node:crypto";

import {
  createJsonSchemaValidator,
  findJsonCompatibilityIssue,
  schemaPathSegments,
  stableJsonStringify,
  type ErrorObject,
} from "@flowcordia/foundation";

import nodePackageSchema from "../schema/node-package-0.1.json" with { type: "json" };
import type { WorkflowStudioNodeCapability, WorkflowStudioNodeCatalogCategory } from "./catalog.js";
import { validateWorkflowFunctionSchema } from "./function-schema.js";
import { isWorkflowCodeExportName, isWorkflowFunctionCodeReferencePath } from "./functions.js";
import type { JsonObject, WorkflowNodeKind } from "./types.js";

export const CURRENT_WORKFLOW_NODE_PACKAGE_VERSION = "0.1" as const;

export type WorkflowNodePackageCapability = WorkflowStudioNodeCapability | "network_access";
export type WorkflowNodePackageCredentialType = "api_key" | "oauth2" | "basic" | "custom_headers";

export interface WorkflowNodePackageCredentialDefinition {
  id: string;
  label: string;
  type: WorkflowNodePackageCredentialType;
  scope: "project_environment";
}

export interface WorkflowNodePackageRuntimeReference {
  type: "repository";
  path: string;
  exportName: string;
}

export interface WorkflowNodePackageOperation {
  id: string;
  catalogVersion: number;
  label: string;
  description: string;
  category: WorkflowStudioNodeCatalogCategory;
  kind: WorkflowNodeKind;
  operation: string;
  runtime: WorkflowNodePackageRuntimeReference;
  configurationSchema: JsonObject;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  capabilities: WorkflowNodePackageCapability[];
  credentials?: WorkflowNodePackageCredentialDefinition[];
  network?: { origins: string[] };
}

export interface WorkflowNodePackageManifest {
  schemaVersion: typeof CURRENT_WORKFLOW_NODE_PACKAGE_VERSION;
  package: {
    id: string;
    version: string;
    name: string;
    description?: string;
  };
  publisher: {
    id: string;
    name: string;
    url?: string;
  };
  operations: WorkflowNodePackageOperation[];
}

export type WorkflowNodePackageIssueCode =
  | "invalid_json"
  | "invalid_type"
  | "required"
  | "unknown_property"
  | "invalid_value"
  | "duplicate_id"
  | "capability_mismatch";

export interface WorkflowNodePackageIssue {
  code: WorkflowNodePackageIssueCode;
  message: string;
  path: ReadonlyArray<string | number>;
  operationId?: string;
}

export type WorkflowNodePackageValidationResult =
  | { success: true; manifest: WorkflowNodePackageManifest; issues: [] }
  | { success: false; issues: WorkflowNodePackageIssue[] };

type UnknownRecord = Record<string, unknown>;

type RawManifest = {
  schemaVersion: "0.1";
  package: { id: string; version: string; name: string; description?: string };
  publisher: { id: string; name: string; url?: string };
  operations: Array<{
    id: string;
    catalogVersion: number;
    label: string;
    description: string;
    category: WorkflowStudioNodeCatalogCategory;
    kind: WorkflowNodeKind;
    operation: string;
    runtime: WorkflowNodePackageRuntimeReference;
    configurationSchema: JsonObject;
    inputSchema: JsonObject;
    outputSchema: JsonObject;
    capabilities: WorkflowNodePackageCapability[];
    credentials?: WorkflowNodePackageCredentialDefinition[];
    network?: { origins: string[] };
  }>;
};

const manifestAjv = createJsonSchemaValidator();
const validateManifestStructure = manifestAjv.compile(nodePackageSchema);

const CATEGORY_KIND: Record<WorkflowStudioNodeCatalogCategory, WorkflowNodeKind> = {
  trigger: "trigger",
  action: "action",
  logic: "control",
  output: "output",
};

function isRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function trimmed(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

/**
 * Preserve Flowcordia's historical normalization boundary before Ajv evaluates
 * patterns and length constraints. Schema payloads are deliberately left alone.
 */
function normalizeInput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized: UnknownRecord = { ...value };

  if (isRecord(value.package)) {
    normalized.package = {
      ...value.package,
      id: trimmed(value.package.id),
      version: trimmed(value.package.version),
      name: trimmed(value.package.name),
      ...(value.package.description === undefined
        ? {}
        : { description: trimmed(value.package.description) }),
    };
  }
  if (isRecord(value.publisher)) {
    normalized.publisher = {
      ...value.publisher,
      id: trimmed(value.publisher.id),
      name: trimmed(value.publisher.name),
      ...(value.publisher.url === undefined ? {} : { url: trimmed(value.publisher.url) }),
    };
  }
  if (Array.isArray(value.operations)) {
    normalized.operations = value.operations.map((operation) => {
      if (!isRecord(operation)) return operation;
      const result: UnknownRecord = {
        ...operation,
        id: trimmed(operation.id),
        label: trimmed(operation.label),
        description: trimmed(operation.description),
        category: trimmed(operation.category),
        kind: trimmed(operation.kind),
        operation: trimmed(operation.operation),
      };
      if (isRecord(operation.runtime)) {
        result.runtime = {
          ...operation.runtime,
          type: trimmed(operation.runtime.type),
          path: trimmed(operation.runtime.path),
          exportName: trimmed(operation.runtime.exportName),
        };
      }
      if (Array.isArray(operation.capabilities)) {
        result.capabilities = operation.capabilities.map(trimmed);
      }
      if (Array.isArray(operation.credentials)) {
        result.credentials = operation.credentials.map((credential) =>
          isRecord(credential)
            ? {
                ...credential,
                id: trimmed(credential.id),
                label: trimmed(credential.label),
                type: trimmed(credential.type),
                scope: trimmed(credential.scope),
              }
            : credential
        );
      }
      if (isRecord(operation.network) && Array.isArray(operation.network.origins)) {
        result.network = {
          ...operation.network,
          origins: operation.network.origins.map(trimmed),
        };
      }
      return result;
    });
  }
  return normalized;
}

function operationIdForPath(
  value: unknown,
  path: ReadonlyArray<string | number>
): string | undefined {
  if (path[0] !== "operations" || typeof path[1] !== "number" || !isRecord(value)) return undefined;
  const operations = value.operations;
  if (!Array.isArray(operations)) return undefined;
  const operation = operations[path[1]];
  return isRecord(operation) && typeof operation.id === "string" ? operation.id : undefined;
}

function hasPolicyShape(value: unknown): value is RawManifest {
  if (!isRecord(value) || !isRecord(value.package) || !isRecord(value.publisher)) return false;
  if (!Array.isArray(value.operations)) return false;
  return value.operations.every((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.runtime)) return false;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.catalogVersion !== "number" ||
      typeof candidate.label !== "string" ||
      typeof candidate.description !== "string" ||
      !(
        candidate.category === "trigger" ||
        candidate.category === "action" ||
        candidate.category === "logic" ||
        candidate.category === "output"
      ) ||
      typeof candidate.kind !== "string" ||
      typeof candidate.operation !== "string" ||
      candidate.runtime.type !== "repository" ||
      typeof candidate.runtime.path !== "string" ||
      typeof candidate.runtime.exportName !== "string" ||
      !isRecord(candidate.configurationSchema) ||
      !isRecord(candidate.inputSchema) ||
      !isRecord(candidate.outputSchema) ||
      !Array.isArray(candidate.capabilities) ||
      !candidate.capabilities.every((entry) => typeof entry === "string")
    ) {
      return false;
    }
    if (
      candidate.credentials !== undefined &&
      (!Array.isArray(candidate.credentials) ||
        !candidate.credentials.every(
          (credential) =>
            isRecord(credential) &&
            typeof credential.id === "string" &&
            typeof credential.label === "string" &&
            typeof credential.type === "string" &&
            typeof credential.scope === "string"
        ))
    ) {
      return false;
    }
    return !(
      candidate.network !== undefined &&
      (!isRecord(candidate.network) ||
        !Array.isArray(candidate.network.origins) ||
        !candidate.network.origins.every((origin) => typeof origin === "string"))
    );
  });
}

function structuralIssue(error: ErrorObject, value: unknown): WorkflowNodePackageIssue {
  const path = schemaPathSegments(error);
  const operationId = operationIdForPath(value, path);
  let code: WorkflowNodePackageIssueCode;
  let message: string;

  switch (error.keyword) {
    case "required":
      code = "required";
      message = `"${String(error.params.missingProperty)}" is required.`;
      break;
    case "additionalProperties":
      code = "unknown_property";
      message = `Unknown property "${String(error.params.additionalProperty)}".`;
      break;
    case "type":
      code = "invalid_type";
      message = `Expected ${String(error.params.type)}.`;
      break;
    case "uniqueItems":
      code = "duplicate_id";
      message =
        path.at(-1) === "capabilities" ? "Capability is duplicated." : "Value is duplicated.";
      break;
    case "minItems":
    case "maxItems":
      code = "invalid_value";
      message = `Array ${error.message ?? "violates its allowed size"}.`;
      break;
    case "const":
      code = "invalid_value";
      message =
        path.at(-1) === "schemaVersion"
          ? `schemaVersion must be "${CURRENT_WORKFLOW_NODE_PACKAGE_VERSION}".`
          : "Value is unsupported.";
      break;
    case "enum":
      code = "invalid_value";
      message = "Value is unsupported.";
      break;
    case "pattern":
      code = "invalid_value";
      message = `"${String(path.at(-1))}" has an invalid format.`;
      break;
    case "minLength":
    case "maxLength":
    case "minimum":
    case "maximum":
      code = "invalid_value";
      message = `"${String(path.at(-1))}" ${error.message ?? "is invalid"}.`;
      break;
    default:
      code = "invalid_value";
      message = error.message ? `Value ${error.message}.` : "Value is invalid.";
  }

  return { code, message, path, ...(operationId ? { operationId } : {}) };
}

function addIssue(
  issues: WorkflowNodePackageIssue[],
  issue: Omit<WorkflowNodePackageIssue, "operationId">,
  operationId?: string
): void {
  issues.push({ ...issue, ...(operationId ? { operationId } : {}) });
}

function publisherUrl(
  candidate: string | undefined,
  issues: WorkflowNodePackageIssue[]
): string | undefined {
  if (candidate === undefined) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new TypeError("invalid URL");
    }
    return url.toString();
  } catch {
    addIssue(issues, {
      code: "invalid_value",
      message: "Publisher URL must be a credential-free HTTPS URL without a fragment.",
      path: ["publisher", "url"],
    });
    return undefined;
  }
}

function exactHttpsOrigin(
  candidate: string,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId: string
): string | undefined {
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (url.pathname !== "/" && url.pathname !== "") ||
      candidate !== url.origin
    ) {
      throw new TypeError("invalid origin");
    }
    return url.origin;
  } catch {
    addIssue(
      issues,
      {
        code: "invalid_value",
        message:
          "Network origins must be exact credential-free HTTPS origins without a path, query, or fragment.",
        path,
      },
      operationId
    );
    return undefined;
  }
}

function validateSchemaFields(
  operation: RawManifest["operations"][number],
  index: number,
  issues: WorkflowNodePackageIssue[]
): void {
  for (const key of ["configurationSchema", "inputSchema", "outputSchema"] as const) {
    for (const schemaIssue of validateWorkflowFunctionSchema(operation[key], {
      requireObjectRoot: true,
    })) {
      addIssue(
        issues,
        {
          code:
            schemaIssue.code === "unknown_property"
              ? "unknown_property"
              : schemaIssue.code === "required"
                ? "required"
                : schemaIssue.code === "invalid_type"
                  ? "invalid_type"
                  : "invalid_value",
          message: schemaIssue.message,
          path: ["operations", index, key, ...schemaIssue.path],
        },
        operation.id
      );
    }
  }
}

function normalizeOperation(
  operation: RawManifest["operations"][number],
  index: number,
  issues: WorkflowNodePackageIssue[]
): WorkflowNodePackageOperation {
  const path = ["operations", index] as const;
  const operationId = operation.id;

  validateSchemaFields(operation, index, issues);

  if (operation.kind !== CATEGORY_KIND[operation.category]) {
    addIssue(
      issues,
      {
        code: "invalid_value",
        message: `Category "${operation.category}" requires node kind "${CATEGORY_KIND[operation.category]}".`,
        path: [...path, "kind"],
      },
      operationId
    );
  }
  if (!isWorkflowFunctionCodeReferencePath(operation.runtime.path)) {
    addIssue(
      issues,
      {
        code: "invalid_value",
        message: "Runtime path is outside the supported reviewed source boundary.",
        path: [...path, "runtime", "path"],
      },
      operationId
    );
  }
  if (!isWorkflowCodeExportName(operation.runtime.exportName)) {
    addIssue(
      issues,
      {
        code: "invalid_value",
        message: "Runtime export name is invalid.",
        path: [...path, "runtime", "exportName"],
      },
      operationId
    );
  }

  const credentialIds = new Set<string>();
  for (const [credentialIndex, credential] of (operation.credentials ?? []).entries()) {
    if (credentialIds.has(credential.id)) {
      addIssue(
        issues,
        {
          code: "duplicate_id",
          message: `Credential ID "${credential.id}" is duplicated.`,
          path: [...path, "credentials", credentialIndex, "id"],
        },
        operationId
      );
    }
    credentialIds.add(credential.id);
  }

  const origins = operation.network?.origins
    .map((origin, originIndex) =>
      exactHttpsOrigin(origin, [...path, "network", "origins", originIndex], issues, operationId)
    )
    .filter((origin): origin is string => origin !== undefined);

  if (operation.credentials && !operation.capabilities.includes("credential_references")) {
    addIssue(
      issues,
      {
        code: "capability_mismatch",
        message: "Credential declarations require credential_references capability.",
        path: [...path, "capabilities"],
      },
      operationId
    );
  }
  if (operation.network && !operation.capabilities.includes("network_access")) {
    addIssue(
      issues,
      {
        code: "capability_mismatch",
        message: "Network declarations require network_access capability.",
        path: [...path, "capabilities"],
      },
      operationId
    );
  }
  if (operation.capabilities.includes("credential_references") && !operation.credentials) {
    addIssue(
      issues,
      {
        code: "capability_mismatch",
        message: "credential_references capability requires at least one credential declaration.",
        path: [...path, "credentials"],
      },
      operationId
    );
  }
  if (operation.capabilities.includes("network_access") && !operation.network) {
    addIssue(
      issues,
      {
        code: "capability_mismatch",
        message: "network_access capability requires exact network origins.",
        path: [...path, "network"],
      },
      operationId
    );
  }

  return {
    ...operation,
    ...(operation.credentials ? { credentials: operation.credentials } : {}),
    ...(operation.network ? { network: { origins: [...new Set(origins)].sort() } } : {}),
  };
}

function validateAndNormalize(value: unknown): WorkflowNodePackageValidationResult {
  const compatibility = findJsonCompatibilityIssue(value);
  if (compatibility) {
    return {
      success: false,
      issues: [
        {
          code: compatibility.code === "circular_reference" ? "invalid_value" : "invalid_type",
          message:
            compatibility.code === "circular_reference"
              ? "Node package manifests cannot contain circular references."
              : "Node package manifests must contain only JSON values.",
          path: compatibility.path,
        },
      ],
    };
  }

  const normalizedInput = normalizeInput(value);
  const structureValid = validateManifestStructure(normalizedInput);
  const structuralIssues = structureValid
    ? []
    : (validateManifestStructure.errors ?? []).map((error) =>
        structuralIssue(error, normalizedInput)
      );
  if (!hasPolicyShape(normalizedInput)) {
    return { success: false, issues: structuralIssues };
  }

  const raw = normalizedInput;
  const issues: WorkflowNodePackageIssue[] = [...structuralIssues];
  const url = publisherUrl(raw.publisher.url, issues);
  const operations = raw.operations.map((operation, index) =>
    normalizeOperation(operation, index, issues)
  );

  const ids = new Set<string>();
  const operationNames = new Set<string>();
  operations.forEach((operation, index) => {
    if (ids.has(operation.id)) {
      addIssue(
        issues,
        {
          code: "duplicate_id",
          message: `Operation ID "${operation.id}" is duplicated.`,
          path: ["operations", index, "id"],
        },
        operation.id
      );
    }
    if (operationNames.has(operation.operation)) {
      addIssue(
        issues,
        {
          code: "duplicate_id",
          message: `Operation identity "${operation.operation}" is duplicated.`,
          path: ["operations", index, "operation"],
        },
        operation.id
      );
    }
    ids.add(operation.id);
    operationNames.add(operation.operation);
  });

  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    manifest: {
      schemaVersion: CURRENT_WORKFLOW_NODE_PACKAGE_VERSION,
      package: raw.package,
      publisher: { id: raw.publisher.id, name: raw.publisher.name, ...(url ? { url } : {}) },
      operations,
    },
    issues: [],
  };
}

export function validateWorkflowNodePackageManifest(
  value: unknown
): WorkflowNodePackageValidationResult {
  return validateAndNormalize(value);
}

export function parseWorkflowNodePackageManifest(
  source: string
): WorkflowNodePackageValidationResult {
  try {
    return validateAndNormalize(JSON.parse(source));
  } catch {
    return {
      success: false,
      issues: [
        { code: "invalid_json", message: "Node package manifest is not valid JSON.", path: [] },
      ],
    };
  }
}

export function serializeWorkflowNodePackageManifest(
  manifest: WorkflowNodePackageManifest
): string {
  return stableJsonStringify(manifest, { space: 2, trailingNewline: true });
}

export function workflowNodePackageDigest(manifest: WorkflowNodePackageManifest): string {
  return createHash("sha256").update(serializeWorkflowNodePackageManifest(manifest)).digest("hex");
}
