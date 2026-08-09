import {
  createPreviewRuntimeAdapters,
  executeFlowcordiaWorkflow,
  type FlowcordiaExecutionResult,
} from "@flowcordia/runtime";
import {
  createStudioV2VerticalSliceWorkflow,
  type JsonValue,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import {
  STUDIO_V2_WORKSPACE_KEY_PATTERN,
  StudioV2WorkspaceError,
  assertStudioV2WorkspaceDocument,
  projectStudioV2Workspace,
  validateStudioV2WorkspaceDocument,
  type StudioV2WorkspaceIssue,
  type StudioV2WorkspaceProjection,
  type StudioV2WorkspaceScope,
} from "./workspace-contract";
import {
  getStudioV2Workspace,
  recordStudioV2WorkspaceTest,
  saveStudioV2WorkspaceRecord,
} from "./workspace-repository.server";

function assertWorkspaceScope(scope: StudioV2WorkspaceScope): void {
  if (
    !scope.organizationId ||
    !scope.projectId ||
    !scope.environmentId ||
    !STUDIO_V2_WORKSPACE_KEY_PATTERN.test(scope.workspaceKey)
  ) {
    throw new StudioV2WorkspaceError(
      "invalid_workspace",
      "The Studio V2 workspace scope is invalid."
    );
  }
}

export async function loadOrCreateStudioV2Workspace(input: {
  scope: StudioV2WorkspaceScope;
  actorId: string;
  initialDocument?: unknown;
}): Promise<StudioV2WorkspaceProjection> {
  assertWorkspaceScope(input.scope);
  const existing = await getStudioV2Workspace(input.scope);
  if (existing) return projectStudioV2Workspace(existing);

  try {
    const initialDocument = input.initialDocument
      ? assertStudioV2WorkspaceDocument(input.initialDocument)
      : createStudioV2VerticalSliceWorkflow();
    const created = await saveStudioV2WorkspaceRecord({
      scope: input.scope,
      expectedVersion: 0n,
      document: initialDocument,
      actorId: input.actorId,
    });
    return projectStudioV2Workspace(created.workspace);
  } catch (error) {
    if (!(error instanceof StudioV2WorkspaceError) || error.code !== "workspace_conflict") {
      throw error;
    }
    const raced = await getStudioV2Workspace(input.scope);
    if (!raced) throw error;
    return projectStudioV2Workspace(raced);
  }
}

export async function saveStudioV2Workspace(input: {
  scope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
  document: unknown;
  actorId: string;
}): Promise<StudioV2WorkspaceProjection> {
  assertWorkspaceScope(input.scope);
  if (input.expectedVersion < 0n) {
    throw new StudioV2WorkspaceError(
      "invalid_workspace",
      "The expected Studio V2 workspace version is invalid."
    );
  }
  const document = assertStudioV2WorkspaceDocument(input.document);
  const saved = await saveStudioV2WorkspaceRecord({
    scope: input.scope,
    expectedVersion: input.expectedVersion,
    document,
    actorId: input.actorId,
  });
  return projectStudioV2Workspace(saved.workspace);
}

export interface StudioV2StructuralTestResult {
  success: boolean;
  version: string;
  documentSha256: string;
  issues: StudioV2WorkspaceIssue[];
  execution: FlowcordiaExecutionResult | null;
  workspace: StudioV2WorkspaceProjection;
}

export async function structurallyTestStudioV2Workspace(input: {
  scope: StudioV2WorkspaceScope;
  expectedVersion: bigint;
  actorId: string;
  testInput?: JsonValue;
}): Promise<StudioV2StructuralTestResult> {
  assertWorkspaceScope(input.scope);
  const workspace = await getStudioV2Workspace(input.scope);
  if (!workspace) {
    throw new StudioV2WorkspaceError(
      "workspace_not_found",
      "The Studio V2 workspace was not found."
    );
  }
  if (workspace.version !== input.expectedVersion) {
    throw new StudioV2WorkspaceError(
      "workspace_conflict",
      "The Studio V2 workspace changed before structural testing began. Reload and test again."
    );
  }

  const validation = validateStudioV2WorkspaceDocument(workspace.document);
  const issues = validation.success ? [] : validation.issues;
  const execution = validation.success
    ? await executeFlowcordiaWorkflow(
        validation.workflow,
        input.testInput ?? null,
        createPreviewRuntimeAdapters(),
        {
          maxNodes: 100,
          includeTraceInput: true,
          environment: "test",
        }
      )
    : null;
  const success = validation.success && execution?.success === true;
  const tested = await recordStudioV2WorkspaceTest({
    scope: input.scope,
    expectedVersion: input.expectedVersion,
    actorId: input.actorId,
    success,
    issueCount: issues.length + (execution && !execution.success ? 1 : 0),
  });

  return {
    success,
    version: tested.version.toString(),
    documentSha256: tested.documentSha256,
    issues,
    execution,
    workspace: projectStudioV2Workspace(tested),
  };
}

export function prepareStudioV2WorkspaceForSave(document: unknown): WorkflowDefinition {
  return assertStudioV2WorkspaceDocument(document);
}
