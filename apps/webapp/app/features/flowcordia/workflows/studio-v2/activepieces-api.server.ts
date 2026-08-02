import {
  parseFlowcordiaActivepiecesPieceConfiguration,
  type WorkflowNode,
} from "@flowcordia/workflow";
import type { StudioV2WorkspaceCommand } from "./workspace-http";
import {
  StudioV2ActivepiecesConnectionError,
  createStudioV2ActivepiecesConnectionAdapter,
} from "./activepieces-connections.server";
import {
  StudioV2ActivepiecesInteractionError,
  executeStudioV2ActivepiecesInteraction,
} from "./activepieces-interaction.server";
import {
  StudioV2ActivepiecesOAuthError,
  createStudioV2ActivepiecesOAuthAdapter,
} from "./activepieces-oauth.server";
import {
  StudioV2ActivepiecesPieceError,
  createStudioV2ActivepiecesPieceAdapter,
} from "./activepieces-pieces.server";
import {
  StudioV2ActivepiecesVariableError,
  createStudioV2ActivepiecesVariableAdapter,
} from "./activepieces-variables.server";
import { STUDIO_V2_DEFAULT_WORKSPACE_KEY } from "./workspace-contract";
import {
  loadOrCreateStudioV2Workspace,
  prepareStudioV2WorkspaceForSave,
} from "./workspace-service.server";

const now = () => new Date().toISOString();
const MAX_TRIGGER_EVENTS = 20;

type JsonRecord = Record<string, unknown>;
type ActivepiecesApiCommand = Extract<StudioV2WorkspaceCommand, { intent: "activepieces_api" }>;
type ActivepiecesConnectionAdapter = ReturnType<typeof createStudioV2ActivepiecesConnectionAdapter>;
type ActivepiecesOAuthAdapter = ReturnType<typeof createStudioV2ActivepiecesOAuthAdapter>;
type ActivepiecesPieceAdapter = ReturnType<typeof createStudioV2ActivepiecesPieceAdapter>;
type ActivepiecesVariableAdapter = ReturnType<typeof createStudioV2ActivepiecesVariableAdapter>;

type TriggerEventRecord = {
  id: string;
  projectId: string;
  flowId: string;
  sourceName: string;
  fileId: string;
  created: string;
  updated: string;
  payload: unknown;
};

const defaultPieceAdapter = createStudioV2ActivepiecesPieceAdapter();
const triggerEvents = new Map<string, TriggerEventRecord[]>();

export class StudioV2ActivepiecesApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "StudioV2ActivepiecesApiError";
  }
}

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

function seekPage<T>(data: T[] = []) {
  return { data, next: null, previous: null };
}

function currentPlatform() {
  const timestamp = now();
  return {
    id: "flowcordia",
    name: "Flowcordia",
    ownerId: "flowcordia",
    created: timestamp,
    updated: timestamp,
    plan: {
      showPoweredBy: false,
      environmentsEnabled: false,
      projectRolesEnabled: false,
      embeddingEnabled: false,
      auditLogEnabled: false,
      customAppearanceEnabled: false,
      manageProjectsEnabled: false,
      managePiecesEnabled: false,
      apiKeysEnabled: false,
      ssoEnabled: false,
      customDomainsEnabled: false,
    },
  };
}

function currentProject(projectId: string) {
  const timestamp = now();
  return {
    id: projectId,
    platformId: "flowcordia",
    displayName: "Flowcordia",
    type: "TEAM",
    ownerId: null,
    created: timestamp,
    updated: timestamp,
    metadata: null,
    releasesEnabled: false,
    notifyFlowOwnerOnFailure: false,
    externalId: projectId,
    icon: null,
    plan: {},
    maxConcurrentJobs: null,
    workerGroupId: null,
  };
}

function readCompatibilityResponse(path: string, projectId: string): unknown {
  if (/^\/v1\/platforms\/[^/]+$/.test(path)) return currentPlatform();
  if (path === "/v1/projects") return seekPage([currentProject(projectId)]);
  if (path === "/v1/folders") return seekPage();
  if (path === "/v1/ai-providers") return [];
  if (path.startsWith("/v1/flow-runs")) return seekPage();
  if (/^\/v1\/flows\/[^/]+\/versions$/.test(path)) return seekPage();
  if (path.startsWith("/v1/git-repos")) return null;

  throw new StudioV2ActivepiecesApiError(
    "activepieces_backend_not_mapped",
    501,
    `Activepieces backend read is not mapped to Flowcordia yet: ${path}`
  );
}

function interactionError(error: unknown): never {
  if (error instanceof StudioV2ActivepiecesInteractionError) {
    throw new StudioV2ActivepiecesApiError(error.code, error.status, error.message);
  }
  throw error;
}

async function currentWorkflow(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
}) {
  const workspace = await loadOrCreateStudioV2Workspace({
    scope: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      workspaceKey: STUDIO_V2_DEFAULT_WORKSPACE_KEY,
    },
    actorId: input.actorId,
  });
  return prepareStudioV2WorkspaceForSave(workspace.document);
}

function triggerEventKey(input: { projectId: string; environmentId: string; flowId: string }) {
  return `${input.projectId}:${input.environmentId}:${input.flowId}`;
}

function createTriggerEvent(input: {
  projectId: string;
  environmentId: string;
  flowId: string;
  sourceName: string;
  payload: unknown;
}): TriggerEventRecord {
  const timestamp = now();
  const id = `fc_evt_${crypto.randomUUID().replaceAll("-", "")}`;
  const event: TriggerEventRecord = {
    id,
    projectId: input.projectId,
    flowId: input.flowId,
    sourceName: input.sourceName,
    fileId: `flowcordia:${id}`,
    created: timestamp,
    updated: timestamp,
    payload: input.payload,
  };
  const key = triggerEventKey(input);
  const events = triggerEvents.get(key) ?? [];
  triggerEvents.set(key, [event, ...events].slice(0, MAX_TRIGGER_EVENTS));
  return event;
}

function listTriggerEvents(input: {
  projectId: string;
  environmentId: string;
  flowId: string;
  limit?: unknown;
}) {
  const parsedLimit =
    typeof input.limit === "number"
      ? input.limit
      : typeof input.limit === "string"
        ? Number(input.limit)
        : 10;
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(MAX_TRIGGER_EVENTS, Math.floor(parsedLimit)))
    : 10;
  return seekPage((triggerEvents.get(triggerEventKey(input)) ?? []).slice(0, limit));
}

async function activepiecesTriggerNode(input: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
}): Promise<WorkflowNode> {
  const workflow = await currentWorkflow(input);
  const node = workflow.nodes.find((candidate) => candidate.kind === "trigger");
  if (!node) {
    throw new StudioV2ActivepiecesApiError(
      "activepieces_trigger_not_found",
      404,
      "The Studio workflow does not contain a trigger."
    );
  }
  const parsed = parseFlowcordiaActivepiecesPieceConfiguration(node);
  if (!parsed.success || parsed.configuration.stepType !== "trigger") {
    throw new StudioV2ActivepiecesApiError(
      "activepieces_trigger_not_testable",
      400,
      "The current Studio trigger is not an Activepieces piece trigger."
    );
  }
  return node;
}

export async function handleStudioV2ActivepiecesApi(input: {
  command: ActivepiecesApiCommand;
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorId: string;
  canWrite: boolean;
  connectionAdapter?: ActivepiecesConnectionAdapter;
  oauthAdapter?: ActivepiecesOAuthAdapter;
  pieceAdapter?: ActivepiecesPieceAdapter;
  variableAdapter?: ActivepiecesVariableAdapter;
}): Promise<unknown> {
  let command = input.command;
  const pieceAdapter = input.pieceAdapter ?? defaultPieceAdapter;

  if (command.method === "POST" && command.path === "/v1/pieces/options") {
    if (!isRecord(command.body)) {
      throw new StudioV2ActivepiecesApiError(
        "invalid_activepieces_request",
        400,
        "Activepieces piece option request must be an object."
      );
    }
    const body = command.body;
    const pieceName = requiredString(body, "pieceName");
    const pieceVersion = requiredString(body, "pieceVersion");
    const actionOrTriggerName = requiredString(body, "actionOrTriggerName");
    const propertyName = requiredString(body, "propertyName");
    if (!isRecord(body.input)) {
      throw new StudioV2ActivepiecesApiError(
        "invalid_activepieces_request",
        400,
        "Activepieces piece option input must be an object."
      );
    }
    try {
      return await executeStudioV2ActivepiecesInteraction({
        projectId: input.projectId,
        environmentId: input.environmentId,
        actorId: input.actorId,
        pieceName,
        pieceVersion,
        payload: {
          kind: "property",
          interaction: {
            pieceName,
            actionOrTriggerName,
            propertyName,
            input: body.input,
            ...(typeof body.searchValue === "string" ? { searchValue: body.searchValue } : {}),
          },
        },
      });
    } catch (error) {
      return interactionError(error);
    }
  }

  if (command.path.startsWith("/v1/pieces")) {
    try {
      return await pieceAdapter({ command, canWrite: input.canWrite });
    } catch (error) {
      if (error instanceof StudioV2ActivepiecesPieceError) {
        throw new StudioV2ActivepiecesApiError(error.code, error.status, error.message);
      }
      throw error;
    }
  }

  if (command.path.startsWith("/v1/app-connections")) {
    try {
      const oauthAdapter =
        input.oauthAdapter ??
        createStudioV2ActivepiecesOAuthAdapter({
          getPieceMetadata: async ({ pieceName, pieceVersion }) => {
            try {
              const value = await pieceAdapter({
                command: {
                  intent: "activepieces_api",
                  method: "GET",
                  path: `/v1/pieces/${encodeURIComponent(pieceName)}`,
                  query: pieceVersion ? { version: pieceVersion } : undefined,
                },
                canWrite: false,
              });
              if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new StudioV2ActivepiecesOAuthError(
                  "activepieces_piece_catalog_invalid",
                  502,
                  `Activepieces returned invalid metadata for ${pieceName}.`
                );
              }
              return value as Record<string, unknown>;
            } catch (error) {
              if (error instanceof StudioV2ActivepiecesPieceError) {
                throw new StudioV2ActivepiecesOAuthError(error.code, error.status, error.message);
              }
              throw error;
            }
          },
        });

      if (
        command.method === "POST" &&
        command.path === "/v1/app-connections/oauth2/authorization-url"
      ) {
        if (!input.canWrite) {
          throw new StudioV2ActivepiecesOAuthError(
            "forbidden",
            403,
            "This Studio session is read-only."
          );
        }
        return await oauthAdapter.authorizationUrl(command.body);
      }

      if (
        command.method === "POST" &&
        command.path === "/v1/app-connections" &&
        command.body &&
        typeof command.body === "object" &&
        !Array.isArray(command.body) &&
        (command.body as Record<string, unknown>).type === "OAUTH2"
      ) {
        if (!input.canWrite) {
          throw new StudioV2ActivepiecesOAuthError(
            "forbidden",
            403,
            "This Studio session is read-only."
          );
        }
        command = { ...command, body: await oauthAdapter.claim(command.body) };
      }

      const connectionAdapter =
        input.connectionAdapter ?? createStudioV2ActivepiecesConnectionAdapter();
      return await connectionAdapter({
        command,
        projectId: input.projectId,
        environmentId: input.environmentId,
        actorId: input.actorId,
        canWrite: input.canWrite,
      });
    } catch (error) {
      if (
        error instanceof StudioV2ActivepiecesConnectionError ||
        error instanceof StudioV2ActivepiecesOAuthError
      ) {
        throw new StudioV2ActivepiecesApiError(error.code, error.status, error.message);
      }
      throw error;
    }
  }

  if (command.path.startsWith("/v1/variables")) {
    try {
      const variableAdapter = input.variableAdapter ?? createStudioV2ActivepiecesVariableAdapter();
      return await variableAdapter({
        command,
        projectId: input.projectId,
        environmentId: input.environmentId,
        actorId: input.actorId,
        canWrite: input.canWrite,
      });
    } catch (error) {
      if (error instanceof StudioV2ActivepiecesVariableError) {
        throw new StudioV2ActivepiecesApiError(error.code, error.status, error.message);
      }
      throw error;
    }
  }

  if (command.method === "GET" && command.path === "/v1/trigger-runs/status") {
    return { pieces: {} };
  }

  if (command.method === "GET" && command.path === "/v1/trigger-events") {
    const flowId =
      typeof command.query?.flowId === "string" ? command.query.flowId : "flowcordia-studio-v2";
    return listTriggerEvents({
      projectId: input.projectId,
      environmentId: input.environmentId,
      flowId,
      limit: command.query?.limit,
    });
  }

  if (command.method === "POST" && command.path === "/v1/trigger-events") {
    if (!input.canWrite) {
      throw new StudioV2ActivepiecesApiError("forbidden", 403, "This Studio session is read-only.");
    }
    if (!isRecord(command.body)) {
      throw new StudioV2ActivepiecesApiError(
        "invalid_activepieces_request",
        400,
        "Activepieces trigger event request must be an object."
      );
    }
    return createTriggerEvent({
      projectId: input.projectId,
      environmentId: input.environmentId,
      flowId: requiredString(command.body, "flowId"),
      sourceName: "mock-data",
      payload: command.body.mockData ?? null,
    });
  }

  if (command.method === "POST" && command.path === "/v1/test-trigger") {
    if (!input.canWrite) {
      throw new StudioV2ActivepiecesApiError("forbidden", 403, "This Studio session is read-only.");
    }
    if (!isRecord(command.body)) {
      throw new StudioV2ActivepiecesApiError(
        "invalid_activepieces_request",
        400,
        "Activepieces trigger test request must be an object."
      );
    }
    const flowId = requiredString(command.body, "flowId");
    const node = await activepiecesTriggerNode(input);
    const parsed = parseFlowcordiaActivepiecesPieceConfiguration(node);
    if (!parsed.success || parsed.configuration.stepType !== "trigger") {
      throw new StudioV2ActivepiecesApiError(
        "activepieces_trigger_not_testable",
        400,
        "The current Studio trigger is not an Activepieces piece trigger."
      );
    }
    const settings = parsed.configuration.settings;
    try {
      const result = await executeStudioV2ActivepiecesInteraction({
        projectId: input.projectId,
        environmentId: input.environmentId,
        actorId: input.actorId,
        pieceName: settings.pieceName,
        pieceVersion: settings.pieceVersion,
        payload: {
          kind: "trigger_test",
          interaction: {
            pieceName: settings.pieceName,
            triggerName: settings.triggerName!,
            input: settings.input,
          },
        },
      });
      const values = Array.isArray(result) ? result : [result];
      const events = values.map((payload, index) =>
        createTriggerEvent({
          projectId: input.projectId,
          environmentId: input.environmentId,
          flowId,
          sourceName: `${settings.triggerName}:${index}`,
          payload,
        })
      );
      return seekPage(events);
    } catch (error) {
      return interactionError(error);
    }
  }

  if (command.method === "GET" && command.path === "/v1/sample-data") {
    return null;
  }

  if (command.method === "GET") {
    return readCompatibilityResponse(command.path, input.projectId);
  }

  if (!input.canWrite) {
    throw new StudioV2ActivepiecesApiError("forbidden", 403, "This Studio session is read-only.");
  }

  throw new StudioV2ActivepiecesApiError(
    "activepieces_backend_not_mapped",
    501,
    `Activepieces backend mutation is not mapped to Flowcordia yet: ${command.method} ${command.path}`
  );
}
