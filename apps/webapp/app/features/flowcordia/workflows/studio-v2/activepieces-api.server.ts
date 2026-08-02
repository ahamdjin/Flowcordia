import type { StudioV2WorkspaceCommand } from "./workspace-http";
import {
  StudioV2ActivepiecesConnectionError,
  createStudioV2ActivepiecesConnectionAdapter,
} from "./activepieces-connections.server";
import {
  StudioV2ActivepiecesPieceError,
  createStudioV2ActivepiecesPieceAdapter,
} from "./activepieces-pieces.server";
import {
  StudioV2ActivepiecesVariableError,
  createStudioV2ActivepiecesVariableAdapter,
} from "./activepieces-variables.server";

const now = () => new Date().toISOString();

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

type ActivepiecesApiCommand = Extract<StudioV2WorkspaceCommand, { intent: "activepieces_api" }>;
type ActivepiecesConnectionAdapter = ReturnType<typeof createStudioV2ActivepiecesConnectionAdapter>;
type ActivepiecesPieceAdapter = ReturnType<typeof createStudioV2ActivepiecesPieceAdapter>;
type ActivepiecesVariableAdapter = ReturnType<typeof createStudioV2ActivepiecesVariableAdapter>;

const defaultPieceAdapter = createStudioV2ActivepiecesPieceAdapter();

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

export async function handleStudioV2ActivepiecesApi(input: {
  command: ActivepiecesApiCommand;
  projectId: string;
  environmentId: string;
  actorId: string;
  canWrite: boolean;
  connectionAdapter?: ActivepiecesConnectionAdapter;
  pieceAdapter?: ActivepiecesPieceAdapter;
  variableAdapter?: ActivepiecesVariableAdapter;
}): Promise<unknown> {
  const { command } = input;

  if (command.path.startsWith("/v1/pieces")) {
    try {
      const pieceAdapter = input.pieceAdapter ?? defaultPieceAdapter;
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
      if (error instanceof StudioV2ActivepiecesConnectionError) {
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
