import {
  parseFlowcordiaActivepiecesPieceConfiguration,
  type WorkflowDefinition,
} from "@flowcordia/workflow";
import {
  StudioV2ActivepiecesApiError,
} from "./activepieces-api.server";
import {
  replaceStudioV2ActivepiecesConnectionReferences,
} from "./activepieces-connection-replace";
import {
  StudioV2ActivepiecesConnectionError,
  createStudioV2ActivepiecesConnectionAdapter,
} from "./activepieces-connections.server";
import {
  StudioV2ActivepiecesInteractionError,
  executeStudioV2ActivepiecesInteraction,
  type StudioV2ActivepiecesInteractionExecution,
} from "./activepieces-interaction.server";
import { getLatestStudioV2Release } from "./release-repository.server";
import { STUDIO_V2_DEFAULT_WORKSPACE_KEY } from "./workspace-contract";
import type { StudioV2WorkspaceCommand } from "./workspace-http";
import {
  loadOrCreateStudioV2Workspace,
  prepareStudioV2WorkspaceForSave,
  saveStudioV2Workspace,
} from "./workspace-service.server";

type JsonRecord = Record<string, unknown>;
type ActivepiecesApiCommand = Extract<StudioV2WorkspaceCommand, { intent: "activepieces_api" }>;
type ActivepiecesConnectionAdapter = ReturnType<typeof createStudioV2ActivepiecesConnectionAdapter>;

export type StudioV2ActivepiecesExtendedApiResult =
  | { handled: false }
  | { handled: true; data: unknown };

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StudioV2ActivepiecesApiError(
      "invalid_activepieces_request",
      400,
      `Activepieces ${key} must be a non-empty string.`
    );
  }
  return value;
}

function scope(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
}) {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    workspaceKey: STUDIO_V2_DEFAULT_WORKSPACE_KEY,
  };
}

async function currentWorkspace(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
}) {
  const workspace = await loadOrCreateStudioV2Workspace({
    scope: scope(input),
    actorId: input.actorId,
  });
  return {
    workspace,
    workflow: prepareStudioV2WorkspaceForSave(workspace.document),
  };
}

function connectionReference(externalId: string): string {
  return `{{connections['${externalId}']}}`;
}

function workflowUsesConnection(workflow: WorkflowDefinition, externalId: string): boolean {
  const reference = connectionReference(externalId);
  return workflow.nodes.some(
    (node) =>
      (node.credentialReferences ?? []).includes(externalId) ||
      JSON.stringify(node.configuration).includes(reference)
  );
}

function interactionFailure(error: unknown): never {
  if (error instanceof StudioV2ActivepiecesInteractionError) {
    throw new StudioV2ActivepiecesApiError(error.code, error.status, error.message);
  }
  throw error;
}

async function connectionMetadata(input: {
  adapter: ActivepiecesConnectionAdapter;
  id: string;
  projectId: string;
  environmentId: string;
  actorId: string;
}) {
  try {
    const value = await input.adapter({
      command: {
        intent: "activepieces_api",
        method: "GET",
        path: `/v1/app-connections/${encodeURIComponent(input.id)}`,
      },
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorId: input.actorId,
      canWrite: false,
    });
    if (!isRecord(value)) {
      throw new StudioV2ActivepiecesApiError(
        "activepieces_connection_invalid",
        500,
        "The stored Activepieces connection metadata is invalid."
      );
    }
    return value;
  } catch (error) {
    if (error instanceof StudioV2ActivepiecesConnectionError) {
      throw new StudioV2ActivepiecesApiError(error.code, error.status, error.message);
    }
    throw error;
  }
}

async function replaceConnection(input: {
  command: ActivepiecesApiCommand;
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
  canWrite: boolean;
  connectionAdapter?: ActivepiecesConnectionAdapter;
}) {
  if (!input.canWrite) {
    throw new StudioV2ActivepiecesApiError("forbidden", 403, "This Studio session is read-only.");
  }
  if (!isRecord(input.command.body)) {
    throw new StudioV2ActivepiecesApiError(
      "invalid_activepieces_request",
      400,
      "Activepieces connection replacement request must be an object."
    );
  }
  const sourceId = requiredString(input.command.body, "sourceAppConnectionId");
  const targetId = requiredString(input.command.body, "targetAppConnectionId");
  if (sourceId === targetId) {
    throw new StudioV2ActivepiecesApiError(
      "invalid_activepieces_request",
      400,
      "Cannot replace an Activepieces connection with itself."
    );
  }
  if (input.command.body.applyToPublishedVersions === true) {
    throw new StudioV2ActivepiecesApiError(
      "activepieces_release_immutable",
      409,
      "Flowcordia staged releases are immutable. Replace the draft connection and stage a new release instead."
    );
  }

  const adapter = input.connectionAdapter ?? createStudioV2ActivepiecesConnectionAdapter();
  const [source, target] = await Promise.all([
    connectionMetadata({
      adapter,
      id: sourceId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorId: input.actorId,
    }),
    connectionMetadata({
      adapter,
      id: targetId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorId: input.actorId,
    }),
  ]);
  if (source.pieceName !== target.pieceName) {
    throw new StudioV2ActivepiecesApiError(
      "invalid_activepieces_request",
      400,
      "Activepieces replacement connections must belong to the same piece."
    );
  }
  const sourceExternalId = requiredString(source, "externalId");
  const targetExternalId = requiredString(target, "externalId");
  const loaded = await currentWorkspace(input);
  const replaced = replaceStudioV2ActivepiecesConnectionReferences({
    workflow: loaded.workflow,
    sourceExternalId,
    targetExternalId,
  });

  if (replaced.replacements > 0) {
    await saveStudioV2Workspace({
      scope: scope(input),
      expectedVersion: BigInt(loaded.workspace.version),
      document: replaced.workflow,
      actorId: input.actorId,
    });
  }

  if (input.command.body.deleteSourceConnection === true) {
    const latestRelease = await getLatestStudioV2Release(scope(input));
    if (
      latestRelease &&
      (latestRelease.status !== "DEPLOYED" ||
        workflowUsesConnection(latestRelease.document, sourceExternalId))
    ) {
      throw new StudioV2ActivepiecesApiError(
        "activepieces_connection_still_released",
        409,
        "The old connection is still required by an immutable staged or active release. Deploy a replacement release before deleting it."
      );
    }
    try {
      await adapter({
        command: {
          intent: "activepieces_api",
          method: "DELETE",
          path: `/v1/app-connections/${encodeURIComponent(sourceId)}`,
        },
        projectId: input.projectId,
        environmentId: input.environmentId,
        actorId: input.actorId,
        canWrite: true,
      });
    } catch (error) {
      if (error instanceof StudioV2ActivepiecesConnectionError) {
        throw new StudioV2ActivepiecesApiError(error.code, error.status, error.message);
      }
      throw error;
    }
  }
  return undefined;
}

async function testAction(input: {
  command: ActivepiecesApiCommand;
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
  canWrite: boolean;
}) {
  if (!input.canWrite) {
    throw new StudioV2ActivepiecesApiError("forbidden", 403, "This Studio session is read-only.");
  }
  if (!isRecord(input.command.body)) {
    throw new StudioV2ActivepiecesApiError(
      "invalid_activepieces_request",
      400,
      "Activepieces test-step request must be an object."
    );
  }
  const stepName = requiredString(input.command.body, "stepName");
  const flowVersionId = requiredString(input.command.body, "flowVersionId");
  const loaded = await currentWorkspace(input);
  const node = loaded.workflow.nodes.find((candidate) => candidate.id === stepName);
  if (!node || node.kind === "trigger") {
    throw new StudioV2ActivepiecesApiError(
      "activepieces_step_not_found",
      404,
      `The Activepieces action step ${stepName} was not found in the current Studio workspace.`
    );
  }
  const parsed = parseFlowcordiaActivepiecesPieceConfiguration(node);
  if (!parsed.success || parsed.configuration.stepType !== "action") {
    throw new StudioV2ActivepiecesApiError(
      "activepieces_step_not_testable",
      400,
      "The selected Studio step is not an Activepieces piece action."
    );
  }
  const settings = parsed.configuration.settings;

  let execution: StudioV2ActivepiecesInteractionExecution;
  try {
    const value = await executeStudioV2ActivepiecesInteraction({
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorId: input.actorId,
      pieceName: settings.pieceName,
      pieceVersion: settings.pieceVersion,
      includeExecution: true,
      payload: {
        kind: "action_test",
        node,
        workflowInput: null,
        outputs: {},
      },
    });
    if (!isRecord(value) || typeof value.runId !== "string" || !("result" in value)) {
      throw new StudioV2ActivepiecesApiError(
        "activepieces_interaction_invalid",
        500,
        "The Trigger.dev Activepieces test returned an invalid execution result."
      );
    }
    execution = value as unknown as StudioV2ActivepiecesInteractionExecution;
  } catch (error) {
    return interactionFailure(error);
  }

  return {
    id: execution.runId,
    flowVersionId,
    projectId: input.projectId,
    status: "SUCCEEDED",
    flowcordiaStepRun: {
      runId: execution.runId,
      success: true,
      input: settings.input,
      output: execution.result,
      standardError: "",
      standardOutput: "",
    },
  };
}

export async function handleStudioV2ActivepiecesExtendedApi(input: {
  command: ActivepiecesApiCommand;
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
  canWrite: boolean;
  connectionAdapter?: ActivepiecesConnectionAdapter;
}): Promise<StudioV2ActivepiecesExtendedApiResult> {
  if (input.command.method === "POST" && input.command.path === "/v1/sample-data/test-step") {
    return { handled: true, data: await testAction(input) };
  }
  if (input.command.method === "GET" && input.command.path === "/v1/sample-data") {
    return { handled: true, data: {} };
  }
  if (input.command.method === "POST" && input.command.path === "/v1/app-connections/replace") {
    return { handled: true, data: await replaceConnection(input) };
  }
  return { handled: false };
}
