import { createHash } from "node:crypto";
import { prisma } from "~/db.server";
import { EnvironmentVariablesRepository } from "~/v3/environmentVariables/environmentVariablesRepository.server";

const CONNECTION_KEY_PREFIX = "FLOWCORDIA_AP_CONNECTION_";
const CONNECTION_CURSOR_PREFIX = "flowcordia-connection:";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

interface StoredActivepiecesConnection {
  schemaVersion: 1;
  kind: "activepieces_connection";
  id: string;
  created: string;
  updated: string;
  externalId: string;
  displayName: string;
  pieceName: string;
  type: string;
  status: "ACTIVE" | "MISSING" | "ERROR";
  platformId: "flowcordia";
  projectIds: string[];
  scope: "PROJECT";
  ownerId: string | null;
  metadata: unknown;
  pieceVersion: string;
  preSelectForNewProjects: boolean;
  value: unknown;
}

type ActivepiecesApiCommand = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
};

export class StudioV2ActivepiecesConnectionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "StudioV2ActivepiecesConnectionError";
  }
}

export interface StudioV2ActivepiecesConnectionSecretStore {
  list(input: {
    projectId: string;
    environmentId: string;
  }): Promise<Array<{ key: string; value: string }>>;
  put(input: {
    projectId: string;
    environmentId: string;
    key: string;
    value: string;
    actorId: string;
  }): Promise<void>;
  delete(input: { projectId: string; environmentId: string; key: string }): Promise<void>;
}

function flowcordiaConnectionSecretStore(): StudioV2ActivepiecesConnectionSecretStore {
  const repository = new EnvironmentVariablesRepository();
  return {
    async list(input) {
      return repository.getEnvironmentVariables(input.projectId, input.environmentId);
    },
    async put(input) {
      const result = await repository.create(input.projectId, {
        override: true,
        environmentIds: [input.environmentId],
        isSecret: true,
        variables: [{ key: input.key, value: input.value }],
        lastUpdatedBy: { type: "user", userId: input.actorId },
      });
      if (!result.success) {
        throw new StudioV2ActivepiecesConnectionError(
          "connection_store_failed",
          500,
          "The connection could not be stored safely."
        );
      }
    },
    async delete(input) {
      const variable = await prisma.environmentVariable.findFirst({
        where: { projectId: input.projectId, key: input.key },
        select: { id: true },
      });
      if (!variable) return;
      const result = await repository.deleteValue(input.projectId, {
        id: variable.id,
        environmentId: input.environmentId,
      });
      if (!result.success) {
        throw new StudioV2ActivepiecesConnectionError(
          "connection_delete_failed",
          500,
          "The connection could not be deleted safely."
        );
      }
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StudioV2ActivepiecesConnectionError(
      "invalid_connection",
      400,
      `Activepieces connection ${key} must be a non-empty string.`
    );
  }
  return value;
}

function connectionKey(externalId: string): string {
  const digest = createHash("sha256").update(externalId).digest("hex").slice(0, 40).toUpperCase();
  return `${CONNECTION_KEY_PREFIX}${digest}`;
}

function connectionId(externalId: string): string {
  return `fc_${createHash("sha256").update(`connection:${externalId}`).digest("hex").slice(0, 24)}`;
}

function parseStoredConnection(value: string): StoredActivepiecesConnection | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return null;
    if (parsed.schemaVersion !== 1 || parsed.kind !== "activepieces_connection") return null;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.externalId !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.pieceName !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.pieceVersion !== "string"
    ) {
      return null;
    }
    return parsed as unknown as StoredActivepiecesConnection;
  } catch {
    return null;
  }
}

function publicConnection(connection: StoredActivepiecesConnection) {
  return {
    id: connection.id,
    created: connection.created,
    updated: connection.updated,
    externalId: connection.externalId,
    displayName: connection.displayName,
    type: connection.type,
    pieceName: connection.pieceName,
    projectIds: connection.projectIds,
    platformId: connection.platformId,
    scope: connection.scope,
    status: connection.status,
    ownerId: connection.ownerId,
    metadata: connection.metadata,
    flowIds: [],
    pieceVersion: connection.pieceVersion,
    preSelectForNewProjects: connection.preSelectForNewProjects,
    usingSecretManager: false,
  };
}

function parseLimit(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(parsed)));
}

function parseCursor(value: unknown): number {
  if (typeof value !== "string" || !value.startsWith(CONNECTION_CURSOR_PREFIX)) return 0;
  const parsed = Number(value.slice(CONNECTION_CURSOR_PREFIX.length));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function cursor(offset: number): string {
  return `${CONNECTION_CURSOR_PREFIX}${offset}`;
}

function stringArray(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  return null;
}

async function loadConnections(input: {
  store: StudioV2ActivepiecesConnectionSecretStore;
  projectId: string;
  environmentId: string;
}): Promise<Array<{ key: string; connection: StoredActivepiecesConnection }>> {
  const values = await input.store.list({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  return values
    .filter((entry) => entry.key.startsWith(CONNECTION_KEY_PREFIX))
    .map((entry) => ({ key: entry.key, connection: parseStoredConnection(entry.value) }))
    .filter(
      (entry): entry is { key: string; connection: StoredActivepiecesConnection } =>
        entry.connection !== null && entry.connection.projectIds.includes(input.projectId)
    )
    .sort((left, right) => left.connection.created.localeCompare(right.connection.created));
}

function findById(
  connections: Array<{ key: string; connection: StoredActivepiecesConnection }>,
  id: string
) {
  return connections.find((entry) => entry.connection.id === id) ?? null;
}

function listConnections(
  connections: Array<{ key: string; connection: StoredActivepiecesConnection }>,
  query: Record<string, unknown> | undefined
) {
  let filtered = connections.map((entry) => entry.connection);
  const pieceName = query?.pieceName;
  if (typeof pieceName === "string") {
    filtered = filtered.filter((item) => item.pieceName === pieceName);
  }
  const displayName = query?.displayName;
  if (typeof displayName === "string") {
    const needle = displayName.toLocaleLowerCase();
    filtered = filtered.filter((item) => item.displayName.toLocaleLowerCase().includes(needle));
  }
  const scope = query?.scope;
  if (typeof scope === "string") filtered = filtered.filter((item) => item.scope === scope);
  const statuses = stringArray(query?.status);
  if (statuses) filtered = filtered.filter((item) => statuses.includes(item.status));
  const externalIds = stringArray(query?.externalIds);
  if (externalIds) filtered = filtered.filter((item) => externalIds.includes(item.externalId));

  const limit = parseLimit(query?.limit);
  const offset = parseCursor(query?.cursor);
  const data = filtered.slice(offset, offset + limit).map(publicConnection);
  return {
    data,
    next: offset + limit < filtered.length ? cursor(offset + limit) : null,
    previous: offset > 0 ? cursor(Math.max(0, offset - limit)) : null,
  };
}

function buildStoredConnection(input: {
  body: Record<string, unknown>;
  projectId: string;
  actorId: string;
  existing: StoredActivepiecesConnection | null;
}): StoredActivepiecesConnection {
  const externalId = requiredString(input.body, "externalId");
  const displayName = requiredString(input.body, "displayName");
  const pieceName = requiredString(input.body, "pieceName");
  const requestedType = requiredString(input.body, "type");
  const pieceVersion = requiredString(input.body, "pieceVersion");
  const placeholder = requestedType === "PLACEHOLDER";

  if (["PLATFORM_OAUTH2", "CLOUD_OAUTH2"].includes(requestedType)) {
    throw new StudioV2ActivepiecesConnectionError(
      "activepieces_backend_not_mapped",
      501,
      "Activepieces managed OAuth providers are not mapped to Flowcordia yet."
    );
  }
  if (
    requestedType === "OAUTH2" &&
    (!isRecord(input.body.value) || typeof input.body.value.access_token !== "string")
  ) {
    throw new StudioV2ActivepiecesConnectionError(
      "activepieces_backend_not_mapped",
      501,
      "Activepieces OAuth credentials must be claimed before Flowcordia stores them."
    );
  }

  const timestamp = new Date().toISOString();
  if (placeholder && input.existing && input.existing.status !== "MISSING") {
    return input.existing;
  }

  const type = placeholder ? "NO_AUTH" : requestedType;
  const value = placeholder
    ? { type: "NO_AUTH" }
    : (input.body.value ?? (type === "NO_AUTH" ? { type: "NO_AUTH" } : undefined));
  if (value === undefined) {
    throw new StudioV2ActivepiecesConnectionError(
      "invalid_connection",
      400,
      "Activepieces authenticated connections must include a connection value."
    );
  }

  return {
    schemaVersion: 1,
    kind: "activepieces_connection",
    id: input.existing?.id ?? connectionId(externalId),
    created: input.existing?.created ?? timestamp,
    updated: timestamp,
    externalId,
    displayName,
    pieceName,
    type,
    status: placeholder ? "MISSING" : "ACTIVE",
    platformId: "flowcordia",
    projectIds: [input.projectId],
    scope: "PROJECT",
    ownerId: input.existing?.ownerId ?? input.actorId,
    metadata: input.body.metadata ?? input.existing?.metadata ?? null,
    pieceVersion,
    preSelectForNewProjects: false,
    value,
  };
}

export function createStudioV2ActivepiecesConnectionAdapter(
  store: StudioV2ActivepiecesConnectionSecretStore = flowcordiaConnectionSecretStore()
) {
  return async function handle(input: {
    command: ActivepiecesApiCommand;
    projectId: string;
    environmentId: string;
    actorId: string;
    canWrite: boolean;
  }): Promise<unknown> {
    const { command } = input;
    const connections = await loadConnections({
      store,
      projectId: input.projectId,
      environmentId: input.environmentId,
    });

    if (command.method === "GET" && command.path === "/v1/app-connections") {
      return listConnections(connections, command.query);
    }
    if (command.method === "GET" && command.path === "/v1/app-connections/owners") {
      return { data: [], next: null, previous: null };
    }
    const getMatch = command.path.match(/^\/v1\/app-connections\/([^/]+)$/);
    if (command.method === "GET" && getMatch) {
      const found = findById(connections, decodeURIComponent(getMatch[1]!));
      if (!found) {
        throw new StudioV2ActivepiecesConnectionError(
          "entity_not_found",
          404,
          "The Activepieces connection was not found."
        );
      }
      return publicConnection(found.connection);
    }

    if (!input.canWrite) {
      throw new StudioV2ActivepiecesConnectionError(
        "forbidden",
        403,
        "This Studio session is read-only."
      );
    }

    if (command.method === "POST" && command.path === "/v1/app-connections") {
      if (!isRecord(command.body)) {
        throw new StudioV2ActivepiecesConnectionError(
          "invalid_connection",
          400,
          "Activepieces connection body must be an object."
        );
      }
      const externalId = requiredString(command.body, "externalId");
      const existing =
        connections.find((entry) => entry.connection.externalId === externalId)?.connection ?? null;
      const connection = buildStoredConnection({
        body: command.body,
        projectId: input.projectId,
        actorId: input.actorId,
        existing,
      });
      await store.put({
        projectId: input.projectId,
        environmentId: input.environmentId,
        key: connectionKey(externalId),
        value: JSON.stringify(connection),
        actorId: input.actorId,
      });
      return publicConnection(connection);
    }

    if (command.method === "POST" && command.path === "/v1/app-connections/replace") {
      throw new StudioV2ActivepiecesConnectionError(
        "activepieces_backend_not_mapped",
        501,
        "Activepieces connection replacement is not mapped to Flowcordia yet."
      );
    }

    const mutationMatch = command.path.match(/^\/v1\/app-connections\/([^/]+)$/);
    if (command.method === "POST" && mutationMatch) {
      const found = findById(connections, decodeURIComponent(mutationMatch[1]!));
      if (!found) {
        throw new StudioV2ActivepiecesConnectionError(
          "entity_not_found",
          404,
          "The Activepieces connection was not found."
        );
      }
      if (!isRecord(command.body)) {
        throw new StudioV2ActivepiecesConnectionError(
          "invalid_connection",
          400,
          "Activepieces connection update must be an object."
        );
      }
      const displayName = requiredString(command.body, "displayName");
      const updated: StoredActivepiecesConnection = {
        ...found.connection,
        displayName,
        metadata: command.body.metadata ?? found.connection.metadata,
        updated: new Date().toISOString(),
      };
      await store.put({
        projectId: input.projectId,
        environmentId: input.environmentId,
        key: found.key,
        value: JSON.stringify(updated),
        actorId: input.actorId,
      });
      return publicConnection(updated);
    }

    if (command.method === "DELETE" && mutationMatch) {
      const found = findById(connections, decodeURIComponent(mutationMatch[1]!));
      if (!found) return undefined;
      await store.delete({
        projectId: input.projectId,
        environmentId: input.environmentId,
        key: found.key,
      });
      return undefined;
    }

    throw new StudioV2ActivepiecesConnectionError(
      "activepieces_backend_not_mapped",
      501,
      `Activepieces connection operation is not mapped to Flowcordia yet: ${command.method} ${command.path}`
    );
  };
}
