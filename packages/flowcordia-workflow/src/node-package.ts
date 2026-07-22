import { createHash } from "node:crypto";
import type { WorkflowStudioNodeCapability, WorkflowStudioNodeCatalogCategory } from "./catalog.js";
import { validateWorkflowFunctionSchema } from "./function-schema.js";
import { isWorkflowCodeExportName, isWorkflowFunctionCodeReferencePath } from "./functions.js";
import type { JsonObject, JsonValue, WorkflowNodeKind } from "./types.js";

export const CURRENT_WORKFLOW_NODE_PACKAGE_VERSION = "0.1" as const;

const PACKAGE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const PUBLISHER_ID = /^[a-z][a-z0-9_-]{1,63}$/;
const OPERATION_ID = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/;
const CREDENTIAL_ID = /^[a-z][a-z0-9-]{1,63}$/;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const MANIFEST_KEYS = new Set(["schemaVersion", "package", "publisher", "operations"]);
const PACKAGE_KEYS = new Set(["id", "version", "name", "description"]);
const PUBLISHER_KEYS = new Set(["id", "name", "url"]);
const OPERATION_KEYS = new Set([
  "id",
  "catalogVersion",
  "label",
  "description",
  "category",
  "kind",
  "operation",
  "runtime",
  "configurationSchema",
  "inputSchema",
  "outputSchema",
  "capabilities",
  "credentials",
  "network",
]);
const RUNTIME_KEYS = new Set(["type", "path", "exportName"]);
const CREDENTIAL_KEYS = new Set(["id", "label", "type", "scope"]);
const NETWORK_KEYS = new Set(["origins"]);

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

function isRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  issues: WorkflowNodePackageIssue[],
  value: Omit<WorkflowNodePackageIssue, "operationId">,
  operationId?: string
) {
  issues.push({ ...value, ...(operationId ? { operationId } : {}) });
}

function unknownProperties(
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId?: string
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
        operationId
      );
    }
  }
}

function stringField(
  value: UnknownRecord,
  key: string,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  options: {
    required?: boolean;
    maxLength?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
  } = {},
  operationId?: string
): string | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    if (options.required) {
      issue(
        issues,
        { code: "required", message: `"${key}" is required.`, path: [...path, key] },
        operationId
      );
    }
    return undefined;
  }
  if (typeof candidate !== "string") {
    issue(
      issues,
      { code: "invalid_type", message: `"${key}" must be a string.`, path: [...path, key] },
      operationId
    );
    return undefined;
  }
  const normalized = candidate.trim();
  if (
    (!options.allowEmpty && normalized.length === 0) ||
    (options.maxLength && normalized.length > options.maxLength)
  ) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: options.maxLength
          ? `"${key}" must contain between 1 and ${options.maxLength} characters.`
          : `"${key}" cannot be empty.`,
        path: [...path, key],
      },
      operationId
    );
  }
  if (options.pattern && !options.pattern.test(normalized)) {
    issue(
      issues,
      { code: "invalid_value", message: `"${key}" has an invalid format.`, path: [...path, key] },
      operationId
    );
  }
  return normalized;
}

function integerField(
  value: UnknownRecord,
  key: string,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId?: string
): number | undefined {
  const candidate = value[key];
  if (
    !Number.isSafeInteger(candidate) ||
    (candidate as number) < 1 ||
    (candidate as number) > 1_000_000
  ) {
    issue(
      issues,
      {
        code: candidate === undefined ? "required" : "invalid_value",
        message: `"${key}" must be an integer between 1 and 1000000.`,
        path: [...path, key],
      },
      operationId
    );
    return undefined;
  }
  return candidate as number;
}

function schemaField(
  value: UnknownRecord,
  key: "configurationSchema" | "inputSchema" | "outputSchema",
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId?: string
): JsonObject | undefined {
  const candidate = value[key];
  if (!isRecord(candidate)) {
    issue(
      issues,
      {
        code: candidate === undefined ? "required" : "invalid_type",
        message: `"${key}" must be a JSON Schema object.`,
        path: [...path, key],
      },
      operationId
    );
    return undefined;
  }
  for (const schemaIssue of validateWorkflowFunctionSchema(candidate, {
    requireObjectRoot: true,
  })) {
    issue(
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
        path: [...path, key, ...schemaIssue.path],
      },
      operationId
    );
  }
  return candidate as JsonObject;
}

function strictHttpsUrl(
  candidate: string,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId?: string
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
    issue(
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

function publisherUrl(
  candidate: string | undefined,
  path: ReadonlyArray<string | number>,
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
    issue(issues, {
      code: "invalid_value",
      message: "Publisher URL must be a credential-free HTTPS URL without a fragment.",
      path,
    });
    return undefined;
  }
}

const CATEGORY_KIND: Record<WorkflowStudioNodeCatalogCategory, WorkflowNodeKind> = {
  trigger: "trigger",
  action: "action",
  logic: "control",
  output: "output",
};

const CAPABILITIES: ReadonlySet<WorkflowNodePackageCapability> = new Set([
  "structural_preview",
  "live_execution",
  "credential_references",
  "governed_code_generation",
  "production_binding",
  "network_access",
]);

const CREDENTIAL_TYPES: ReadonlySet<WorkflowNodePackageCredentialType> = new Set([
  "api_key",
  "oauth2",
  "basic",
  "custom_headers",
]);

function parseRuntime(
  value: unknown,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId?: string
): WorkflowNodePackageRuntimeReference | undefined {
  if (!isRecord(value)) {
    issue(
      issues,
      {
        code: value === undefined ? "required" : "invalid_type",
        message: "Runtime must be an object.",
        path,
      },
      operationId
    );
    return undefined;
  }
  unknownProperties(value, RUNTIME_KEYS, path, issues, operationId);
  const type = stringField(
    value,
    "type",
    path,
    issues,
    { required: true, maxLength: 32 },
    operationId
  );
  const sourcePath = stringField(
    value,
    "path",
    path,
    issues,
    { required: true, maxLength: 512 },
    operationId
  );
  const exportName = stringField(
    value,
    "exportName",
    path,
    issues,
    { required: true, maxLength: 128 },
    operationId
  );
  if (type !== "repository") {
    issue(
      issues,
      {
        code: "invalid_value",
        message: "Only repository-owned runtime references are supported in schema 0.1.",
        path: [...path, "type"],
      },
      operationId
    );
  }
  if (sourcePath && !isWorkflowFunctionCodeReferencePath(sourcePath)) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: "Runtime path is outside the supported reviewed source boundary.",
        path: [...path, "path"],
      },
      operationId
    );
  }
  if (exportName && !isWorkflowCodeExportName(exportName)) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: "Runtime export name is invalid.",
        path: [...path, "exportName"],
      },
      operationId
    );
  }
  if (type !== "repository" || !sourcePath || !exportName) return undefined;
  return { type: "repository", path: sourcePath, exportName };
}

function parseCapabilities(
  value: unknown,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId?: string
): WorkflowNodePackageCapability[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > CAPABILITIES.size) {
    issue(
      issues,
      {
        code: value === undefined ? "required" : "invalid_value",
        message: "Capabilities must contain between 1 and 6 entries.",
        path,
      },
      operationId
    );
    return undefined;
  }
  const parsed: WorkflowNodePackageCapability[] = [];
  for (const [index, candidate] of value.entries()) {
    if (
      typeof candidate !== "string" ||
      !CAPABILITIES.has(candidate as WorkflowNodePackageCapability)
    ) {
      issue(
        issues,
        { code: "invalid_value", message: "Capability is unsupported.", path: [...path, index] },
        operationId
      );
      continue;
    }
    if (parsed.includes(candidate as WorkflowNodePackageCapability)) {
      issue(
        issues,
        { code: "duplicate_id", message: "Capability is duplicated.", path: [...path, index] },
        operationId
      );
      continue;
    }
    parsed.push(candidate as WorkflowNodePackageCapability);
  }
  return parsed;
}

function parseCredentials(
  value: unknown,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId?: string
): WorkflowNodePackageCredentialDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: "Credentials must contain between 1 and 16 entries.",
        path,
      },
      operationId
    );
    return undefined;
  }
  const parsed: WorkflowNodePackageCredentialDefinition[] = [];
  const ids = new Set<string>();
  value.forEach((candidate, index) => {
    const itemPath = [...path, index];
    if (!isRecord(candidate)) {
      issue(
        issues,
        { code: "invalid_type", message: "Credential must be an object.", path: itemPath },
        operationId
      );
      return;
    }
    unknownProperties(candidate, CREDENTIAL_KEYS, itemPath, issues, operationId);
    const id = stringField(
      candidate,
      "id",
      itemPath,
      issues,
      { required: true, maxLength: 64, pattern: CREDENTIAL_ID },
      operationId
    );
    const label = stringField(
      candidate,
      "label",
      itemPath,
      issues,
      { required: true, maxLength: 120 },
      operationId
    );
    const type = stringField(
      candidate,
      "type",
      itemPath,
      issues,
      { required: true, maxLength: 32 },
      operationId
    );
    const scope = stringField(
      candidate,
      "scope",
      itemPath,
      issues,
      { required: true, maxLength: 32 },
      operationId
    );
    if (id && ids.has(id)) {
      issue(
        issues,
        {
          code: "duplicate_id",
          message: `Credential ID "${id}" is duplicated.`,
          path: [...itemPath, "id"],
        },
        operationId
      );
    }
    if (type && !CREDENTIAL_TYPES.has(type as WorkflowNodePackageCredentialType)) {
      issue(
        issues,
        {
          code: "invalid_value",
          message: "Credential type is unsupported.",
          path: [...itemPath, "type"],
        },
        operationId
      );
    }
    if (scope !== "project_environment") {
      issue(
        issues,
        {
          code: "invalid_value",
          message: "Only project_environment credential scope is supported.",
          path: [...itemPath, "scope"],
        },
        operationId
      );
    }
    if (
      id &&
      label &&
      CREDENTIAL_TYPES.has(type as WorkflowNodePackageCredentialType) &&
      scope === "project_environment"
    ) {
      ids.add(id);
      parsed.push({ id, label, type: type as WorkflowNodePackageCredentialType, scope });
    }
  });
  return parsed;
}

function parseNetwork(
  value: unknown,
  path: ReadonlyArray<string | number>,
  issues: WorkflowNodePackageIssue[],
  operationId?: string
): { origins: string[] } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issue(
      issues,
      { code: "invalid_type", message: "Network declaration must be an object.", path },
      operationId
    );
    return undefined;
  }
  unknownProperties(value, NETWORK_KEYS, path, issues, operationId);
  if (!Array.isArray(value.origins) || value.origins.length === 0 || value.origins.length > 32) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: "Network origins must contain between 1 and 32 entries.",
        path: [...path, "origins"],
      },
      operationId
    );
    return undefined;
  }
  const origins: string[] = [];
  value.origins.forEach((candidate, index) => {
    if (typeof candidate !== "string") {
      issue(
        issues,
        {
          code: "invalid_type",
          message: "Network origin must be a string.",
          path: [...path, "origins", index],
        },
        operationId
      );
      return;
    }
    const origin = strictHttpsUrl(candidate, [...path, "origins", index], issues, operationId);
    if (!origin) return;
    if (origins.includes(origin)) {
      issue(
        issues,
        {
          code: "duplicate_id",
          message: `Network origin "${origin}" is duplicated.`,
          path: [...path, "origins", index],
        },
        operationId
      );
      return;
    }
    origins.push(origin);
  });
  return { origins: origins.sort() };
}

function parseOperation(
  value: unknown,
  index: number,
  issues: WorkflowNodePackageIssue[]
): WorkflowNodePackageOperation | undefined {
  const path: ReadonlyArray<string | number> = ["operations", index];
  if (!isRecord(value)) {
    issue(issues, { code: "invalid_type", message: "Operation must be an object.", path });
    return undefined;
  }
  const operationId = typeof value.id === "string" ? value.id : undefined;
  unknownProperties(value, OPERATION_KEYS, path, issues, operationId);
  const id = stringField(
    value,
    "id",
    path,
    issues,
    { required: true, maxLength: 128, pattern: OPERATION_ID },
    operationId
  );
  const catalogVersion = integerField(value, "catalogVersion", path, issues, operationId);
  const label = stringField(
    value,
    "label",
    path,
    issues,
    { required: true, maxLength: 120 },
    operationId
  );
  const description = stringField(
    value,
    "description",
    path,
    issues,
    { required: true, maxLength: 500 },
    operationId
  );
  const category = stringField(
    value,
    "category",
    path,
    issues,
    { required: true, maxLength: 16 },
    operationId
  );
  const kind = stringField(
    value,
    "kind",
    path,
    issues,
    { required: true, maxLength: 16 },
    operationId
  );
  const operation = stringField(
    value,
    "operation",
    path,
    issues,
    { required: true, maxLength: 160, pattern: OPERATION_ID },
    operationId
  );
  const runtime = parseRuntime(value.runtime, [...path, "runtime"], issues, operationId);
  const configurationSchema = schemaField(value, "configurationSchema", path, issues, operationId);
  const inputSchema = schemaField(value, "inputSchema", path, issues, operationId);
  const outputSchema = schemaField(value, "outputSchema", path, issues, operationId);
  const capabilities = parseCapabilities(
    value.capabilities,
    [...path, "capabilities"],
    issues,
    operationId
  );
  const credentials = parseCredentials(
    value.credentials,
    [...path, "credentials"],
    issues,
    operationId
  );
  const network = parseNetwork(value.network, [...path, "network"], issues, operationId);

  if (
    !(
      category === "trigger" ||
      category === "action" ||
      category === "logic" ||
      category === "output"
    )
  ) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: "Operation category is unsupported.",
        path: [...path, "category"],
      },
      operationId
    );
  } else if (kind !== CATEGORY_KIND[category]) {
    issue(
      issues,
      {
        code: "invalid_value",
        message: `Category "${category}" requires node kind "${CATEGORY_KIND[category]}".`,
        path: [...path, "kind"],
      },
      operationId
    );
  }
  if (credentials && !capabilities?.includes("credential_references")) {
    issue(
      issues,
      {
        code: "capability_mismatch",
        message: "Credential declarations require credential_references capability.",
        path: [...path, "capabilities"],
      },
      operationId
    );
  }
  if (network && !capabilities?.includes("network_access")) {
    issue(
      issues,
      {
        code: "capability_mismatch",
        message: "Network declarations require network_access capability.",
        path: [...path, "capabilities"],
      },
      operationId
    );
  }
  if (capabilities?.includes("credential_references") && !credentials) {
    issue(
      issues,
      {
        code: "capability_mismatch",
        message: "credential_references capability requires at least one credential declaration.",
        path: [...path, "credentials"],
      },
      operationId
    );
  }
  if (capabilities?.includes("network_access") && !network) {
    issue(
      issues,
      {
        code: "capability_mismatch",
        message: "network_access capability requires exact network origins.",
        path: [...path, "network"],
      },
      operationId
    );
  }

  if (
    !id ||
    !catalogVersion ||
    !label ||
    !description ||
    !(
      category === "trigger" ||
      category === "action" ||
      category === "logic" ||
      category === "output"
    ) ||
    kind !== CATEGORY_KIND[category] ||
    !operation ||
    !runtime ||
    !configurationSchema ||
    !inputSchema ||
    !outputSchema ||
    !capabilities
  ) {
    return undefined;
  }
  return {
    id,
    catalogVersion,
    label,
    description,
    category,
    kind: kind as WorkflowNodeKind,
    operation,
    runtime,
    configurationSchema,
    inputSchema,
    outputSchema,
    capabilities,
    ...(credentials ? { credentials } : {}),
    ...(network ? { network } : {}),
  };
}

function parseManifest(value: unknown): WorkflowNodePackageValidationResult {
  const issues: WorkflowNodePackageIssue[] = [];
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [
        { code: "invalid_type", message: "Node package manifest must be an object.", path: [] },
      ],
    };
  }
  unknownProperties(value, MANIFEST_KEYS, [], issues);
  if (value.schemaVersion !== CURRENT_WORKFLOW_NODE_PACKAGE_VERSION) {
    issue(issues, {
      code: value.schemaVersion === undefined ? "required" : "invalid_value",
      message: `schemaVersion must be "${CURRENT_WORKFLOW_NODE_PACKAGE_VERSION}".`,
      path: ["schemaVersion"],
    });
  }

  let packageValue: WorkflowNodePackageManifest["package"] | undefined;
  if (!isRecord(value.package)) {
    issue(issues, {
      code: value.package === undefined ? "required" : "invalid_type",
      message: "Package metadata must be an object.",
      path: ["package"],
    });
  } else {
    unknownProperties(value.package, PACKAGE_KEYS, ["package"], issues);
    const id = stringField(value.package, "id", ["package"], issues, {
      required: true,
      maxLength: 128,
      pattern: PACKAGE_ID,
    });
    const version = stringField(value.package, "version", ["package"], issues, {
      required: true,
      maxLength: 80,
      pattern: SEMVER,
    });
    const name = stringField(value.package, "name", ["package"], issues, {
      required: true,
      maxLength: 120,
    });
    const description = stringField(value.package, "description", ["package"], issues, {
      maxLength: 500,
    });
    if (id && version && name)
      packageValue = { id, version, name, ...(description ? { description } : {}) };
  }

  let publisher: WorkflowNodePackageManifest["publisher"] | undefined;
  if (!isRecord(value.publisher)) {
    issue(issues, {
      code: value.publisher === undefined ? "required" : "invalid_type",
      message: "Publisher metadata must be an object.",
      path: ["publisher"],
    });
  } else {
    unknownProperties(value.publisher, PUBLISHER_KEYS, ["publisher"], issues);
    const id = stringField(value.publisher, "id", ["publisher"], issues, {
      required: true,
      maxLength: 64,
      pattern: PUBLISHER_ID,
    });
    const name = stringField(value.publisher, "name", ["publisher"], issues, {
      required: true,
      maxLength: 120,
    });
    const rawUrl = stringField(value.publisher, "url", ["publisher"], issues, { maxLength: 500 });
    const url = publisherUrl(rawUrl, ["publisher", "url"], issues);
    if (id && name) publisher = { id, name, ...(url ? { url } : {}) };
  }

  const operations: WorkflowNodePackageOperation[] = [];
  if (
    !Array.isArray(value.operations) ||
    value.operations.length === 0 ||
    value.operations.length > 128
  ) {
    issue(issues, {
      code: value.operations === undefined ? "required" : "invalid_value",
      message: "Operations must contain between 1 and 128 entries.",
      path: ["operations"],
    });
  } else {
    const ids = new Set<string>();
    const operationNames = new Set<string>();
    value.operations.forEach((candidate, index) => {
      const parsed = parseOperation(candidate, index, issues);
      if (!parsed) return;
      if (ids.has(parsed.id)) {
        issue(
          issues,
          {
            code: "duplicate_id",
            message: `Operation ID "${parsed.id}" is duplicated.`,
            path: ["operations", index, "id"],
          },
          parsed.id
        );
      }
      if (operationNames.has(parsed.operation)) {
        issue(
          issues,
          {
            code: "duplicate_id",
            message: `Operation identity "${parsed.operation}" is duplicated.`,
            path: ["operations", index, "operation"],
          },
          parsed.id
        );
      }
      ids.add(parsed.id);
      operationNames.add(parsed.operation);
      operations.push(parsed);
    });
  }

  if (issues.length > 0 || !packageValue || !publisher || operations.length === 0) {
    return { success: false, issues };
  }
  return {
    success: true,
    manifest: {
      schemaVersion: CURRENT_WORKFLOW_NODE_PACKAGE_VERSION,
      package: packageValue,
      publisher,
      operations,
    },
    issues: [],
  };
}

export function validateWorkflowNodePackageManifest(
  value: unknown
): WorkflowNodePackageValidationResult {
  return parseManifest(value);
}

export function parseWorkflowNodePackageManifest(
  source: string
): WorkflowNodePackageValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return {
      success: false,
      issues: [
        { code: "invalid_json", message: "Node package manifest is not valid JSON.", path: [] },
      ],
    };
  }
  return parseManifest(value);
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function serializeWorkflowNodePackageManifest(
  manifest: WorkflowNodePackageManifest
): string {
  return `${JSON.stringify(canonicalize(manifest as unknown as JsonValue), null, 2)}\n`;
}

export function workflowNodePackageDigest(manifest: WorkflowNodePackageManifest): string {
  return createHash("sha256").update(serializeWorkflowNodePackageManifest(manifest)).digest("hex");
}
