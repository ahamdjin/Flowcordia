import { validateFlowcordiaCredentialReferences } from "./credentials.js";
import type { JsonObject, JsonValue, WorkflowNode, WorkflowPosition } from "./types.js";

export const STUDIO_V2_SOURCE_OPERATION = "code.typescript" as const;
export const STUDIO_V2_SOURCE_LANGUAGE = "typescript" as const;
export const STUDIO_V2_SOURCE_ENTRYPOINT = "run" as const;
export const STUDIO_V2_MAX_SOURCE_LENGTH = 100_000;

export const STUDIO_V2_DEFAULT_SOURCE = `export default async function run(ctx: FlowcordiaContext) {
  return {
    input: ctx.input,
  };
}`;

export interface StudioV2SourceDocument {
  language: typeof STUDIO_V2_SOURCE_LANGUAGE;
  entrypoint: typeof STUDIO_V2_SOURCE_ENTRYPOINT;
  source: string;
  credentialReferences: readonly string[];
}

export interface StudioV2SourceExecutionMetadata {
  workflowId: string;
  nodeId: string;
  environment: "test" | "staging" | "production";
  runId?: string;
  attempt?: number;
}

export interface StudioV2SourceCredentialAccessor {
  has(reference: string): boolean;
  get(reference: string): Promise<string>;
}

export interface StudioV2SourceContext {
  input: JsonValue;
  steps: Readonly<Record<string, JsonValue>>;
  variables: Readonly<Record<string, JsonValue>>;
  credentials: StudioV2SourceCredentialAccessor;
  execution: StudioV2SourceExecutionMetadata;
}

export interface StudioV2SourceDocumentIssue {
  code:
    | "invalid_language"
    | "invalid_entrypoint"
    | "invalid_source"
    | "source_too_large"
    | "invalid_credential_references"
    | "unknown_property";
  message: string;
  path: readonly string[];
}

export type StudioV2SourceDocumentValidation =
  | { success: true; document: StudioV2SourceDocument; issues: [] }
  | { success: false; issues: StudioV2SourceDocumentIssue[] };

const STUDIO_V2_SOURCE_PROPERTIES = new Set([
  "language",
  "entrypoint",
  "source",
  "credentialReferences",
]);

function isStringArray(value: JsonValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function serializeStudioV2SourceDocument(document: StudioV2SourceDocument): JsonObject {
  return {
    language: document.language,
    entrypoint: document.entrypoint,
    source: document.source,
    credentialReferences: [...document.credentialReferences],
  };
}

export function validateStudioV2SourceDocument(
  configuration: JsonObject
): StudioV2SourceDocumentValidation {
  const issues: StudioV2SourceDocumentIssue[] = [];

  for (const property of Object.keys(configuration)) {
    if (!STUDIO_V2_SOURCE_PROPERTIES.has(property)) {
      issues.push({
        code: "unknown_property",
        message: `Source configuration property "${property}" is not allowed. Store only TypeScript source and opaque credential references.`,
        path: [property],
      });
    }
  }

  if (configuration.language !== STUDIO_V2_SOURCE_LANGUAGE) {
    issues.push({
      code: "invalid_language",
      message: "Studio V2 Source nodes support TypeScript only.",
      path: ["language"],
    });
  }

  if (configuration.entrypoint !== STUDIO_V2_SOURCE_ENTRYPOINT) {
    issues.push({
      code: "invalid_entrypoint",
      message: `Source nodes must export the ${STUDIO_V2_SOURCE_ENTRYPOINT} entrypoint.`,
      path: ["entrypoint"],
    });
  }

  if (typeof configuration.source !== "string" || configuration.source.trim().length === 0) {
    issues.push({
      code: "invalid_source",
      message: "Source nodes require non-empty TypeScript source.",
      path: ["source"],
    });
  } else if (configuration.source.length > STUDIO_V2_MAX_SOURCE_LENGTH) {
    issues.push({
      code: "source_too_large",
      message: `Source nodes may contain at most ${STUDIO_V2_MAX_SOURCE_LENGTH} characters.`,
      path: ["source"],
    });
  }

  const credentialReferences = configuration.credentialReferences;
  if (!isStringArray(credentialReferences)) {
    issues.push({
      code: "invalid_credential_references",
      message: "Source credentialReferences must be an array of opaque credential reference names.",
      path: ["credentialReferences"],
    });
  } else {
    for (const credentialIssue of validateFlowcordiaCredentialReferences(credentialReferences)) {
      issues.push({
        code: "invalid_credential_references",
        message: credentialIssue.message,
        path:
          credentialIssue.index === undefined
            ? ["credentialReferences"]
            : ["credentialReferences", String(credentialIssue.index)],
      });
    }
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  return {
    success: true,
    document: {
      language: STUDIO_V2_SOURCE_LANGUAGE,
      entrypoint: STUDIO_V2_SOURCE_ENTRYPOINT,
      source: configuration.source as string,
      credentialReferences: credentialReferences as string[],
    },
    issues: [],
  };
}

export interface CreateStudioV2SourceNodeInput {
  id: string;
  position: WorkflowPosition;
  name?: string;
  source?: string;
  credentialReferences?: readonly string[];
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
}

export function createStudioV2SourceNode(input: CreateStudioV2SourceNodeInput): WorkflowNode {
  const document: StudioV2SourceDocument = {
    language: STUDIO_V2_SOURCE_LANGUAGE,
    entrypoint: STUDIO_V2_SOURCE_ENTRYPOINT,
    source: input.source ?? STUDIO_V2_DEFAULT_SOURCE,
    credentialReferences: input.credentialReferences ?? [],
  };
  const validation = validateStudioV2SourceDocument(serializeStudioV2SourceDocument(document));
  if (!validation.success) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  return {
    id: input.id,
    name: input.name ?? "Source",
    kind: "code",
    operation: STUDIO_V2_SOURCE_OPERATION,
    position: input.position,
    configuration: serializeStudioV2SourceDocument(validation.document),
    credentialReferences: [...validation.document.credentialReferences],
    inputSchema: input.inputSchema ?? { type: "object" },
    outputSchema: input.outputSchema ?? { type: "object" },
  };
}
