import type {
  GitHubFunctionCatalogReadValue,
  GitHubWorkflowStoreError,
} from "@flowcordia/github-workflows";
import type { JsonObject } from "@flowcordia/workflow";

export interface WorkflowFunctionFixtureItem {
  id: string;
  name: string;
  description: string | null;
  input: JsonObject;
}

export interface WorkflowFunctionCatalogItem {
  id: string;
  name: string;
  description: string | null;
  codePath: string;
  exportName: string;
  inputFields: string[];
  outputFields: string[];
  fixtures: WorkflowFunctionFixtureItem[];
}

export interface WorkflowFunctionCatalogProjection {
  state: "READY" | "NOT_CONFIGURED" | "INVALID" | "UNAVAILABLE";
  functions: WorkflowFunctionCatalogItem[];
  source: { path: string; commitSha: string; blobSha: string } | null;
  message: string | null;
  retryable: boolean;
}

function schemaFields(schema: JsonObject): string[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.keys(properties).sort().slice(0, 100);
}

export function presentWorkflowFunctionCatalog(
  value: GitHubFunctionCatalogReadValue
): WorkflowFunctionCatalogProjection {
  return {
    state: "READY",
    functions: value.catalog.functions.map((definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description ?? null,
      codePath: definition.codeReference.path,
      exportName: definition.codeReference.exportName,
      inputFields: schemaFields(definition.inputSchema),
      outputFields: schemaFields(definition.outputSchema),
      fixtures: (definition.fixtures ?? []).map((fixture) => ({
        id: fixture.id,
        name: fixture.name,
        description: fixture.description ?? null,
        input: JSON.parse(JSON.stringify(fixture.input)) as JsonObject,
      })),
    })),
    source: {
      path: value.source.path,
      commitSha: value.source.commitSha,
      blobSha: value.source.blobSha,
    },
    message: null,
    retryable: false,
  };
}

export function presentWorkflowFunctionCatalogError(
  error: GitHubWorkflowStoreError
): WorkflowFunctionCatalogProjection {
  if (error.code === "not_found") {
    return {
      state: "NOT_CONFIGURED",
      functions: [],
      source: null,
      message: "Add .flowcordia/functions.json to publish repository-owned functions in Studio.",
      retryable: false,
    };
  }
  const invalid = error.code === "invalid_document" || error.code === "invalid_input";
  return {
    state: invalid ? "INVALID" : "UNAVAILABLE",
    functions: [],
    source: null,
    message: error.catalogIssues?.[0]?.message ?? error.message,
    retryable: error.retryable,
  };
}

export function unavailableWorkflowFunctionCatalog(): WorkflowFunctionCatalogProjection {
  return {
    state: "UNAVAILABLE",
    functions: [],
    source: null,
    message: "The repository function catalog could not be loaded safely.",
    retryable: true,
  };
}
