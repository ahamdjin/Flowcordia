import { createHash } from "node:crypto";
import { prisma } from "~/db.server";
import { EnvironmentVariablesRepository } from "~/v3/environmentVariables/environmentVariablesRepository.server";

const VARIABLE_KEY_PREFIX = "FLOWCORDIA_AP_VARIABLE_";
const VARIABLE_CURSOR_PREFIX = "flowcordia-variable:";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

interface StoredActivepiecesVariable {
  schemaVersion: 1;
  kind: "activepieces_variable";
  id: string;
  created: string;
  updated: string;
  name: string;
  projectId: string;
  platformId: "flowcordia";
  ownerId: string | null;
  metadata: unknown;
  value: string;
}

type ActivepiecesApiCommand = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
};

export class StudioV2ActivepiecesVariableError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "StudioV2ActivepiecesVariableError";
  }
}

export interface StudioV2ActivepiecesVariableSecretStore {
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

function flowcordiaVariableSecretStore(): StudioV2ActivepiecesVariableSecretStore {
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
        throw new StudioV2ActivepiecesVariableError(
          "variable_store_failed",
          500,
          "The variable could not be stored safely."
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
        throw new StudioV2ActivepiecesVariableError(
          "variable_delete_failed",
          500,
          "The variable could not be deleted safely."
        );
      }
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredName(record: Record<string, unknown>): string {
  const value = record.name;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StudioV2ActivepiecesVariableError(
      "invalid_variable",
      400,
      "Activepieces variable name must be a non-empty string."
    );
  }
  return value;
}

function requiredValue(record: Record<string, unknown>): string {
  const value = record.value;
  if (typeof value !== "string") {
    throw new StudioV2ActivepiecesVariableError(
      "invalid_variable",
      400,
      "Activepieces variable value must be a string."
    );
  }
  return value;
}

function variableKey(name: string): string {
  const digest = createHash("sha256").update(name).digest("hex").slice(0, 40).toUpperCase();
  return `${VARIABLE_KEY_PREFIX}${digest}`;
}

function variableId(name: string): string {
  return `fcv_${createHash("sha256").update(`variable:${name}`).digest("hex").slice(0, 24)}`;
}

function parseStoredVariable(value: string): StoredActivepiecesVariable | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return null;
    if (parsed.schemaVersion !== 1 || parsed.kind !== "activepieces_variable") return null;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.projectId !== "string" ||
      typeof parsed.value !== "string"
    ) {
      return null;
    }
    return parsed as unknown as StoredActivepiecesVariable;
  } catch {
    return null;
  }
}

function publicVariable(variable: StoredActivepiecesVariable) {
  return {
    id: variable.id,
    created: variable.created,
    updated: variable.updated,
    name: variable.name,
    projectId: variable.projectId,
    platformId: variable.platformId,
    ownerId: variable.ownerId,
    owner: null,
    metadata: variable.metadata,
  };
}

function parseLimit(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(parsed)));
}

function parseCursor(value: unknown): number {
  if (typeof value !== "string" || !value.startsWith(VARIABLE_CURSOR_PREFIX)) return 0;
  const parsed = Number(value.slice(VARIABLE_CURSOR_PREFIX.length));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function cursor(offset: number): string {
  return `${VARIABLE_CURSOR_PREFIX}${offset}`;
}

async function loadVariables(input: {
  store: StudioV2ActivepiecesVariableSecretStore;
  projectId: string;
  environmentId: string;
}): Promise<Array<{ key: string; variable: StoredActivepiecesVariable }>> {
  const values = await input.store.list({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  return values
    .filter((entry) => entry.key.startsWith(VARIABLE_KEY_PREFIX))
    .map((entry) => ({ key: entry.key, variable: parseStoredVariable(entry.value) }))
    .filter(
      (entry): entry is { key: string; variable: StoredActivepiecesVariable } =>
        entry.variable !== null && entry.variable.projectId === input.projectId
    )
    .sort((left, right) => left.variable.created.localeCompare(right.variable.created));
}

function findById(
  variables: Array<{ key: string; variable: StoredActivepiecesVariable }>,
  id: string
) {
  return variables.find((entry) => entry.variable.id === id) ?? null;
}

function listVariables(
  variables: Array<{ key: string; variable: StoredActivepiecesVariable }>,
  query: Record<string, unknown> | undefined
) {
  let filtered = variables.map((entry) => entry.variable);
  const name = query?.name;
  if (typeof name === "string") {
    const needle = name.toLocaleLowerCase();
    filtered = filtered.filter((item) => item.name.toLocaleLowerCase().includes(needle));
  }
  const limit = parseLimit(query?.limit);
  const offset = parseCursor(query?.cursor);
  return {
    data: filtered.slice(offset, offset + limit).map(publicVariable),
    next: offset + limit < filtered.length ? cursor(offset + limit) : null,
    previous: offset > 0 ? cursor(Math.max(0, offset - limit)) : null,
  };
}

export function createStudioV2ActivepiecesVariableAdapter(
  store: StudioV2ActivepiecesVariableSecretStore = flowcordiaVariableSecretStore()
) {
  return async function handle(input: {
    command: ActivepiecesApiCommand;
    projectId: string;
    environmentId: string;
    actorId: string;
    canWrite: boolean;
  }): Promise<unknown> {
    const { command } = input;
    const variables = await loadVariables({
      store,
      projectId: input.projectId,
      environmentId: input.environmentId,
    });

    if (command.method === "GET" && command.path === "/v1/variables") {
      return listVariables(variables, command.query);
    }
    if (command.method === "GET" && command.path === "/v1/variables/owners") {
      return { data: [], next: null, previous: null };
    }

    if (!input.canWrite) {
      throw new StudioV2ActivepiecesVariableError(
        "forbidden",
        403,
        "This Studio session is read-only."
      );
    }

    if (command.method === "POST" && command.path === "/v1/variables") {
      if (!isRecord(command.body)) {
        throw new StudioV2ActivepiecesVariableError(
          "invalid_variable",
          400,
          "Activepieces variable body must be an object."
        );
      }
      const name = requiredName(command.body);
      const value = requiredValue(command.body);
      if (variables.some((entry) => entry.variable.name === name)) {
        throw new StudioV2ActivepiecesVariableError(
          "validation",
          400,
          "Variable name already used"
        );
      }
      const timestamp = new Date().toISOString();
      const variable: StoredActivepiecesVariable = {
        schemaVersion: 1,
        kind: "activepieces_variable",
        id: variableId(name),
        created: timestamp,
        updated: timestamp,
        name,
        projectId: input.projectId,
        platformId: "flowcordia",
        ownerId: input.actorId,
        metadata: command.body.metadata ?? null,
        value,
      };
      await store.put({
        projectId: input.projectId,
        environmentId: input.environmentId,
        key: variableKey(name),
        value: JSON.stringify(variable),
        actorId: input.actorId,
      });
      return publicVariable(variable);
    }

    const revealMatch = command.path.match(/^\/v1\/variables\/([^/]+)\/reveal$/);
    if (command.method === "POST" && revealMatch) {
      const found = findById(variables, decodeURIComponent(revealMatch[1]!));
      if (!found) {
        throw new StudioV2ActivepiecesVariableError(
          "entity_not_found",
          404,
          "The Activepieces variable was not found."
        );
      }
      return { value: found.variable.value };
    }

    const variableMatch = command.path.match(/^\/v1\/variables\/([^/]+)$/);
    if (command.method === "POST" && variableMatch) {
      const found = findById(variables, decodeURIComponent(variableMatch[1]!));
      if (!found) {
        throw new StudioV2ActivepiecesVariableError(
          "entity_not_found",
          404,
          "The Activepieces variable was not found."
        );
      }
      if (!isRecord(command.body)) {
        throw new StudioV2ActivepiecesVariableError(
          "invalid_variable",
          400,
          "Activepieces variable update must be an object."
        );
      }
      const nextValue = command.body.value;
      if (nextValue !== undefined && typeof nextValue !== "string") {
        throw new StudioV2ActivepiecesVariableError(
          "invalid_variable",
          400,
          "Activepieces variable value must be a string when provided."
        );
      }
      const updated: StoredActivepiecesVariable = {
        ...found.variable,
        value: typeof nextValue === "string" ? nextValue : found.variable.value,
        metadata: command.body.metadata ?? found.variable.metadata,
        updated: new Date().toISOString(),
      };
      await store.put({
        projectId: input.projectId,
        environmentId: input.environmentId,
        key: found.key,
        value: JSON.stringify(updated),
        actorId: input.actorId,
      });
      return publicVariable(updated);
    }

    if (command.method === "DELETE" && variableMatch) {
      const found = findById(variables, decodeURIComponent(variableMatch[1]!));
      if (!found) {
        throw new StudioV2ActivepiecesVariableError(
          "entity_not_found",
          404,
          "The Activepieces variable was not found."
        );
      }
      await store.delete({
        projectId: input.projectId,
        environmentId: input.environmentId,
        key: found.key,
      });
      return undefined;
    }

    throw new StudioV2ActivepiecesVariableError(
      "activepieces_backend_not_mapped",
      501,
      `Activepieces variable operation is not mapped to Flowcordia yet: ${command.method} ${command.path}`
    );
  };
}
