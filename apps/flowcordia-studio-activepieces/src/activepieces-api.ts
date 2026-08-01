import { HttpStatusCode, isAxiosError } from "axios";
import { authenticationSession } from "./activepieces-authentication-session";
import { FLOWCORDIA_ACTIVEPIECES_FLAGS } from "./activepieces-flags";
import {
  getAvailablePiece,
  listAvailablePiecePackages,
  listAvailablePieces,
} from "./activepieces-piece-catalog";

export const isRunningCloudInDevMode = false;
export const API_BASE_URL = typeof window === "undefined" ? "" : window.location.origin;
export const API_URL = `${API_BASE_URL}/api`;

const now = "2026-08-02T00:00:00.000Z";

type Query = Record<string, unknown> | undefined;

function currentPlatform() {
  return {
    id: "flowcordia",
    name: "Flowcordia",
    ownerId: "flowcordia-studio-user",
    created: now,
    updated: now,
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

function currentProject() {
  const id = authenticationSession.getProjectId() ?? "flowcordia-project";
  return {
    id,
    platformId: "flowcordia",
    displayName: "Flowcordia",
    type: "TEAM",
    ownerId: null,
    created: now,
    updated: now,
    metadata: null,
    releasesEnabled: false,
    notifyFlowOwnerOnFailure: false,
    externalId: id,
    icon: null,
    plan: {},
    maxConcurrentJobs: null,
    workerGroupId: null,
  };
}

function readResponse(url: string, query?: Query): unknown {
  if (url === "/v1/flags") return FLOWCORDIA_ACTIVEPIECES_FLAGS;
  if (url === "/v1/pieces") return listAvailablePieces();
  if (url === "/v1/pieces/registry") return listAvailablePiecePackages();
  if (url.startsWith("/v1/pieces/")) {
    const name = decodeURIComponent(url.slice("/v1/pieces/".length));
    const version = typeof query?.version === "string" ? query.version : undefined;
    return getAvailablePiece({ name, version });
  }
  if (/^\/v1\/platforms\/[^/]+$/.test(url)) return currentPlatform();
  if (url === "/v1/projects") {
    return { data: [currentProject()], next: null, previous: null };
  }
  if (url === "/v1/folders") {
    return { data: [], next: null, previous: null };
  }
  if (url.startsWith("/v1/flow-runs")) {
    return { data: [], next: null, previous: null };
  }
  if (url.startsWith("/v1/flow-versions")) {
    return { data: [], next: null, previous: null };
  }
  if (url.startsWith("/v1/git-repos")) return null;
  throw new Error(`Activepieces backend read is not mapped to Flowcordia yet: ${url}`);
}

function unsupportedMutation(url: string): never {
  throw new Error(`Activepieces backend mutation is not mapped to Flowcordia yet: ${url}`);
}

export const api = {
  isApError(_error: unknown, _errorCode: unknown) {
    return false;
  },
  isError(error: unknown) {
    return isAxiosError(error);
  },
  extractServerErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  },
  async any<TResponse>(url: string, _config?: unknown): Promise<TResponse> {
    return readResponse(url) as TResponse;
  },
  async get<TResponse>(url: string, query?: Query, _config?: unknown): Promise<TResponse> {
    return readResponse(url, query) as TResponse;
  },
  async delete<TResponse>(
    url: string,
    _query?: Record<string, string>,
    _body?: unknown
  ): Promise<TResponse> {
    return unsupportedMutation(url);
  },
  async post<TResponse, TBody = unknown, TParams = unknown>(
    url: string,
    _body?: TBody,
    _params?: TParams,
    _headers?: Record<string, string>
  ): Promise<TResponse> {
    if (url === "/v1/pieces/sync") return undefined as TResponse;
    return unsupportedMutation(url);
  },
  async patch<TResponse, TBody = unknown, TParams = unknown>(
    url: string,
    _body?: TBody,
    _params?: TParams
  ): Promise<TResponse> {
    return unsupportedMutation(url);
  },
  httpStatus: HttpStatusCode,
};
