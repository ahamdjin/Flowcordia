import {
  STUDIO_V2_FOUNDATION_NODES,
  findInlineSecretPath,
  validateFlowcordiaCredentialReferences,
  validateStudioV2SourceDocument,
  validateWorkflow,
  type JsonObject,
  type JsonValue,
  type WorkflowDefinition,
} from "@flowcordia/workflow";

export const STUDIO_V2_DEFAULT_WORKSPACE_KEY = "default" as const;
export const STUDIO_V2_WORKSPACE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

const STUDIO_V2_ALLOWED_OPERATIONS = new Set([
  ...STUDIO_V2_FOUNDATION_NODES.map((entry) => entry.operation),
  "output.return",
]);

export interface StudioV2WorkspaceScope {
  organizationId: string;
  projectId: string;
  environmentId: string;
  workspaceKey: string;
}

export interface StudioV2WorkspaceRecord {
  id: string;
  publicId: string;
  scope: StudioV2WorkspaceScope;
  document: WorkflowDefinition;
  documentSha256: string;
  version: bigint;
  testedVersion: bigint | null;
  lastTestSucceeded: boolean | null;
  createdByActorId: string;
  updatedByActorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudioV2WorkspaceProjection {
  publicId: string;
  workspaceKey: string;
  document: JsonObject;
  documentSha256: string;
  version: string;
  testedVersion: string | null;
  lastTestSucceeded: boolean | null;
  updatedAt: string;
}

export type StudioV2WorkspaceIssueCode =
  | "invalid_workflow"
  | "unsupported_operation"
  | "invalid_source"
  | "invalid_credential_references"
  | "source_reference_mismatch"
  | "inline_secret";

export interface StudioV2WorkspaceIssue {
  code: StudioV2WorkspaceIssueCode;
  message: string;
  path: ReadonlyArray<string | number>;
}

export type StudioV2WorkspaceValidation =
  | { success: true; workflow: WorkflowDefinition; issues: [] }
  | { success: false; issues: StudioV2WorkspaceIssue[] };

export type StudioV2WorkspaceErrorCode =
  | "invalid_workspace"
  | "workspace_not_found"
  | "workspace_conflict"
  | "corrupt_workspace";

export class StudioV2WorkspaceError extends Error {
  constructor(
    public readonly code: StudioV2WorkspaceErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "StudioV2WorkspaceError";
  }
}

function sameReferences(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((reference, index) => reference === sortedRight[index]);
}

function configurationForSecretScan(operation: string, configuration: JsonObject): JsonObject {
  if (operation !== "code.typescript") return configuration;
  const { credentialReferences: _credentialReferences, ...safeConfiguration } = configuration;
  return safeConfiguration;
}

export function validateStudioV2WorkspaceDocument(input: unknown): StudioV2WorkspaceValidation {
  const canonical = validateWorkflow(input);
  if (!canonical.success) {
    return {
      success: false,
      issues: canonical.issues.map((issue) => ({
        code: "invalid_workflow" as const,
        message: issue.message,
        path: issue.path,
      })),
    };
  }

  const issues: StudioV2WorkspaceIssue[] = [];
  canonical.workflow.nodes.forEach((node, nodeIndex) => {
    if (!STUDIO_V2_ALLOWED_OPERATIONS.has(node.operation)) {
      issues.push({
        code: "unsupported_operation",
        message: `Studio V2 does not own the operation "${node.operation}" yet.`,
        path: ["nodes", nodeIndex, "operation"],
      });
    }

    const credentialReferences = node.credentialReferences ?? [];
    for (const issue of validateFlowcordiaCredentialReferences(credentialReferences)) {
      issues.push({
        code: "invalid_credential_references",
        message: issue.message,
        path: [
          "nodes",
          nodeIndex,
          "credentialReferences",
          ...(issue.index === undefined ? [] : [issue.index]),
        ],
      });
    }

    if (node.operation === "code.typescript") {
      const source = validateStudioV2SourceDocument(node.configuration);
      if (!source.success) {
        for (const issue of source.issues) {
          issues.push({
            code: "invalid_source",
            message: issue.message,
            path: ["nodes", nodeIndex, "configuration", ...issue.path],
          });
        }
      } else if (!sameReferences(source.document.credentialReferences, credentialReferences)) {
        issues.push({
          code: "source_reference_mismatch",
          message:
            "The Source document and workflow node must contain the same opaque credential references.",
          path: ["nodes", nodeIndex, "credentialReferences"],
        });
      }
    }

    const secretPath = findInlineSecretPath(
      configurationForSecretScan(node.operation, node.configuration) as JsonValue
    );
    if (secretPath) {
      issues.push({
        code: "inline_secret",
        message:
          "Studio V2 workflow configuration cannot contain inline secret values. Use an opaque credential reference instead.",
        path: ["nodes", nodeIndex, "configuration", ...secretPath],
      });
    }
  });

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, workflow: canonical.workflow, issues: [] };
}

export function assertStudioV2WorkspaceDocument(input: unknown): WorkflowDefinition {
  const validation = validateStudioV2WorkspaceDocument(input);
  if (!validation.success) {
    throw new StudioV2WorkspaceError(
      "invalid_workspace",
      validation.issues[0]?.message ?? "The Studio V2 workspace document is invalid."
    );
  }
  return validation.workflow;
}

function projectWorkflowDocument(document: WorkflowDefinition): JsonObject {
  return JSON.parse(JSON.stringify(document)) as JsonObject;
}

export function projectStudioV2Workspace(
  workspace: StudioV2WorkspaceRecord
): StudioV2WorkspaceProjection {
  return {
    publicId: workspace.publicId,
    workspaceKey: workspace.scope.workspaceKey,
    document: projectWorkflowDocument(workspace.document),
    documentSha256: workspace.documentSha256,
    version: workspace.version.toString(),
    testedVersion: workspace.testedVersion?.toString() ?? null,
    lastTestSucceeded: workspace.lastTestSucceeded,
    updatedAt: workspace.updatedAt.toISOString(),
  };
}
