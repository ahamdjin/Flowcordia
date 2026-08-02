import type { StudioV2WorkspaceCommand } from "./workspace-http";

const ACTIVEPIECES_PIECES_API_URL = "https://cloud.activepieces.com/api/v1/pieces";
export const ACTIVEPIECES_STUDIO_RELEASE = "0.86.3";
const ACTIVEPIECES_EDITION = "ce";
const REGISTRY_CACHE_TTL_MS = 60 * 60 * 1000;
const METADATA_CACHE_TTL_MS = 60 * 60 * 1000;
const LIST_CACHE_TTL_MS = 60 * 1000;
const LIST_CACHE_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 15_000;

type ActivepiecesApiCommand = Extract<StudioV2WorkspaceCommand, { intent: "activepieces_api" }>;
type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

type PieceRegistryEntry = {
  name: string;
  version: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export class StudioV2ActivepiecesPieceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "StudioV2ActivepiecesPieceError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: string, right: string): number {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  if (!parsedLeft || !parsedRight) return left.localeCompare(right);
  for (let index = 0; index < parsedLeft.length; index += 1) {
    if (parsedLeft[index] !== parsedRight[index]) {
      return parsedLeft[index] - parsedRight[index];
    }
  }
  return 0;
}

function incrementVersion(version: string, kind: "major" | "minor" | "patch"): string {
  const parsed = parseVersion(version);
  if (!parsed) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_version_invalid",
      400,
      `Activepieces piece version is invalid: ${version}`
    );
  }
  const [major, minor, patch] = parsed;
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function versionRange(version: string | undefined) {
  if (!version) return null;
  if (version.startsWith("^")) {
    const baseVersion = version.slice(1);
    return { baseVersion, nextExcludedVersion: incrementVersion(baseVersion, "major") };
  }
  if (version.startsWith("~")) {
    const baseVersion = version.slice(1);
    return { baseVersion, nextExcludedVersion: incrementVersion(baseVersion, "minor") };
  }
  return { baseVersion: version, nextExcludedVersion: incrementVersion(version, "patch") };
}

function resolveVersion(
  registry: PieceRegistryEntry[],
  name: string,
  requestedVersion?: string
): string {
  const range = versionRange(requestedVersion);
  const candidates = registry
    .filter((piece) => piece.name === name)
    .filter((piece) => {
      if (!range) return true;
      return (
        compareVersions(piece.version, range.baseVersion) >= 0 &&
        compareVersions(piece.version, range.nextExcludedVersion) < 0
      );
    })
    .sort((left, right) => compareVersions(right.version, left.version));

  if (candidates.length === 0) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_not_found",
      404,
      `Activepieces piece metadata was not found for ${name}${requestedVersion ? `@${requestedVersion}` : ""}.`
    );
  }
  return candidates[0].version;
}

function latestRegistryVersions(registry: PieceRegistryEntry[]) {
  const latest = new Map<string, string>();
  for (const entry of registry) {
    const current = latest.get(entry.name);
    if (!current || compareVersions(entry.version, current) > 0) {
      latest.set(entry.name, entry.version);
    }
  }
  return latest;
}

function appendQueryValue(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue(params, key, item);
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    params.append(key, String(value));
  }
}

function buildUrl(path: string, query?: JsonRecord) {
  const url = new URL(`${ACTIVEPIECES_PIECES_API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query))
      appendQueryValue(url.searchParams, key, value);
  }
  return url;
}

function sanitizeListQuery(query?: JsonRecord): JsonRecord {
  const sanitized: JsonRecord = { ...(query ?? {}), includeHidden: true };
  delete sanitized.projectId;
  delete sanitized.release;
  delete sanitized.edition;
  return sanitized;
}

function cacheKey(query?: JsonRecord) {
  const entries = Object.entries(query ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(entries);
}

function suggestedComponents(source: unknown, pinnedComponents: JsonRecord): unknown[] | undefined {
  if (!Array.isArray(source)) return undefined;
  const result: unknown[] = [];
  for (const candidate of source) {
    if (!isRecord(candidate) || typeof candidate.name !== "string") continue;
    const pinned = pinnedComponents[candidate.name];
    if (pinned !== undefined) result.push(pinned);
  }
  return result;
}

function metadataToSummary(metadata: JsonRecord, sourceSummary?: JsonRecord): JsonRecord {
  const actions = isRecord(metadata.actions) ? metadata.actions : {};
  const triggers = isRecord(metadata.triggers) ? metadata.triggers : {};
  return {
    ...metadata,
    i18n: undefined,
    actions: Object.keys(actions).length,
    triggers: Object.keys(triggers).length,
    suggestedActions: suggestedComponents(sourceSummary?.suggestedActions, actions),
    suggestedTriggers: suggestedComponents(sourceSummary?.suggestedTriggers, triggers),
  };
}

function parseRegistry(value: unknown): PieceRegistryEntry[] {
  if (!Array.isArray(value)) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_catalog_invalid",
      502,
      "Activepieces returned an invalid piece registry."
    );
  }
  const entries: PieceRegistryEntry[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.version !== "string") {
      continue;
    }
    if (!parseVersion(item.version)) continue;
    entries.push({ name: item.name, version: item.version });
  }
  if (entries.length === 0) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_catalog_invalid",
      502,
      "Activepieces returned an empty piece registry."
    );
  }
  return entries;
}

async function fetchJson(fetchImpl: FetchLike, url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_catalog_unavailable",
      503,
      error instanceof Error
        ? `Activepieces piece catalog is unavailable: ${error.message}`
        : "Activepieces piece catalog is unavailable."
    );
  }
  if (!response.ok) {
    throw new StudioV2ActivepiecesPieceError(
      response.status === 404
        ? "activepieces_piece_not_found"
        : "activepieces_piece_catalog_unavailable",
      response.status === 404 ? 404 : 503,
      `Activepieces piece catalog request failed with HTTP ${response.status}.`
    );
  }
  try {
    return await response.json();
  } catch {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_catalog_invalid",
      502,
      "Activepieces returned invalid JSON for the piece catalog."
    );
  }
}

function parsePieceName(path: string): string | null {
  const prefix = "/v1/pieces/";
  if (!path.startsWith(prefix)) return null;
  const remainder = path.slice(prefix.length);
  if (!remainder || ["registry", "categories", "options", "sync"].includes(remainder)) return null;
  try {
    return decodeURIComponent(remainder);
  } catch {
    return remainder;
  }
}

export function createStudioV2ActivepiecesPieceAdapter(options?: {
  fetchImpl?: FetchLike;
  now?: () => number;
}) {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const now = options?.now ?? Date.now;
  let registryCache: CacheEntry<PieceRegistryEntry[]> | null = null;
  const metadataCache = new Map<string, CacheEntry<JsonRecord>>();
  const listCache = new Map<string, CacheEntry<JsonRecord[]>>();

  const clearCaches = () => {
    registryCache = null;
    metadataCache.clear();
    listCache.clear();
  };

  const getRegistry = async () => {
    const timestamp = now();
    if (registryCache && registryCache.expiresAt > timestamp) return registryCache.value;
    const url = buildUrl("/registry", {
      edition: ACTIVEPIECES_EDITION,
      release: ACTIVEPIECES_STUDIO_RELEASE,
    });
    const registry = parseRegistry(await fetchJson(fetchImpl, url));
    registryCache = { value: registry, expiresAt: timestamp + REGISTRY_CACHE_TTL_MS };
    return registry;
  };

  const getPiece = async (input: {
    name: string;
    version?: string;
    locale?: string;
    audience?: string;
  }): Promise<JsonRecord> => {
    const registry = await getRegistry();
    const resolvedVersion = resolveVersion(registry, input.name, input.version);
    const key = [input.name, resolvedVersion, input.locale ?? "", input.audience ?? ""].join("|");
    const timestamp = now();
    const cached = metadataCache.get(key);
    if (cached && cached.expiresAt > timestamp) return cached.value;

    const encodedName = encodeURIComponent(input.name);
    const value = await fetchJson(
      fetchImpl,
      buildUrl(`/${encodedName}`, {
        version: resolvedVersion,
        locale: input.locale,
        audience: input.audience,
      })
    );
    if (!isRecord(value) || value.name !== input.name || value.version !== resolvedVersion) {
      throw new StudioV2ActivepiecesPieceError(
        "activepieces_piece_catalog_invalid",
        502,
        `Activepieces returned invalid metadata for ${input.name}@${resolvedVersion}.`
      );
    }
    metadataCache.set(key, { value, expiresAt: timestamp + METADATA_CACHE_TTL_MS });
    return value;
  };

  const listPieces = async (query?: JsonRecord): Promise<JsonRecord[]> => {
    const sanitizedQuery = sanitizeListQuery(query);
    const key = cacheKey(sanitizedQuery);
    const timestamp = now();
    const cached = listCache.get(key);
    if (cached && cached.expiresAt > timestamp) return cached.value;

    const [registry, value] = await Promise.all([
      getRegistry(),
      fetchJson(fetchImpl, buildUrl("", sanitizedQuery)),
    ]);
    if (!Array.isArray(value)) {
      throw new StudioV2ActivepiecesPieceError(
        "activepieces_piece_catalog_invalid",
        502,
        "Activepieces returned an invalid piece list."
      );
    }

    const pinnedVersions = latestRegistryVersions(registry);
    const includeHidden = query?.includeHidden === true || query?.includeHidden === "true";
    const locale = typeof query?.locale === "string" ? query.locale : undefined;
    const audience = typeof query?.audience === "string" ? query.audience : undefined;
    const summaries = await Promise.all(
      value.map(async (rawSummary) => {
        if (!isRecord(rawSummary) || typeof rawSummary.name !== "string") return null;
        const pinnedVersion = pinnedVersions.get(rawSummary.name);
        if (!pinnedVersion) return null;

        let summary = rawSummary;
        if (rawSummary.version !== pinnedVersion) {
          const metadata = await getPiece({
            name: rawSummary.name,
            version: pinnedVersion,
            locale,
            audience,
          });
          summary = metadataToSummary(metadata, rawSummary);
        }
        if (!includeHidden && summary.deprecated === true) return null;
        return summary;
      })
    );
    const result = summaries.filter((summary): summary is JsonRecord => summary !== null);

    if (listCache.size >= LIST_CACHE_LIMIT) {
      const firstKey = listCache.keys().next().value;
      if (typeof firstKey === "string") listCache.delete(firstKey);
    }
    listCache.set(key, { value: result, expiresAt: timestamp + LIST_CACHE_TTL_MS });
    return result;
  };

  return async function handlePieces(input: {
    command: ActivepiecesApiCommand;
    canWrite: boolean;
  }): Promise<unknown> {
    const { command } = input;

    if (command.method === "GET" && command.path === "/v1/pieces/registry") {
      return getRegistry();
    }
    if (command.method === "GET" && command.path === "/v1/pieces/categories") {
      return fetchJson(fetchImpl, buildUrl("/categories", sanitizeListQuery(command.query)));
    }
    if (command.method === "GET" && command.path === "/v1/pieces") {
      return listPieces(command.query);
    }
    if (command.method === "GET") {
      const name = parsePieceName(command.path);
      if (name) {
        return getPiece({
          name,
          version: typeof command.query?.version === "string" ? command.query.version : undefined,
          locale: typeof command.query?.locale === "string" ? command.query.locale : undefined,
          audience:
            typeof command.query?.audience === "string" ? command.query.audience : undefined,
        });
      }
    }

    if (command.method === "POST" && command.path === "/v1/pieces/sync") {
      if (!input.canWrite) {
        throw new StudioV2ActivepiecesPieceError(
          "forbidden",
          403,
          "This Studio session is read-only."
        );
      }
      clearCaches();
      await getRegistry();
      return undefined;
    }

    if (command.method === "POST" && command.path === "/v1/pieces/options") {
      throw new StudioV2ActivepiecesPieceError(
        "activepieces_piece_options_not_mapped",
        501,
        "Activepieces dynamic piece options are not mapped to Flowcordia yet."
      );
    }

    if (!input.canWrite) {
      throw new StudioV2ActivepiecesPieceError(
        "forbidden",
        403,
        "This Studio session is read-only."
      );
    }

    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_mutation_not_mapped",
      501,
      `Activepieces piece mutation is not mapped to Flowcordia yet: ${command.method} ${command.path}`
    );
  };
}
