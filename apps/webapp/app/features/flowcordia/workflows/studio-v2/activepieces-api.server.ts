import type { StudioV2WorkspaceCommand } from "./workspace-http";

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
      environmentsEnabled: true,
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
    releasesEnabled: true,
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
  if (path === "/v1/app-connections") return seekPage();
  if (path.startsWith("/v1/flow-runs")) return seekPage();
  if (path.startsWith("/v1/flow-versions")) return seekPage();
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
  canWrite: boolean;
}): Promise<unknown> {
  const { command } = input;

  if (command.method === "GET") {
    return readCompatibilityResponse(command.path, input.projectId);
  }

  if (!input.canWrite) {
    throw new StudioV2ActivepiecesApiError(
      "forbidden",
      403,
      "This Studio session is read-only."
    );
  }

  throw new StudioV2ActivepiecesApiError(
    "activepieces_backend_not_mapped",
    501,
    `Activepieces backend mutation is not mapped to Flowcordia yet: ${command.method} ${command.path}`
  );
}
