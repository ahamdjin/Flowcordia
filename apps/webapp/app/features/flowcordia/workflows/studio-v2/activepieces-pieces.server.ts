import { readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { StudioV2WorkspaceCommand } from "./workspace-http";

export const ACTIVEPIECES_STUDIO_RELEASE = "0.86.3";

export const FLOWCORDIA_CURATED_ACTIVEPIECES_PIECES = [
  "@activepieces/piece-http",
  "@activepieces/piece-data-mapper",
  "@activepieces/piece-delay",
  "@activepieces/piece-math-helper",
  "@activepieces/piece-text-helper",
  "@activepieces/piece-date-helper",
  "@activepieces/piece-store",
  "@activepieces/piece-subflows",
  "@activepieces/piece-manual-trigger",
  "@activepieces/piece-schedule",
  "@activepieces/piece-webhook",
  "@activepieces/piece-mcp-client",
] as const;

type ActivepiecesApiCommand = Extract<StudioV2WorkspaceCommand, { intent: "activepieces_api" }>;
type JsonRecord = Record<string, unknown>;
type ReadFileLike = (path: string, encoding: "utf8") => Promise<string>;

type CatalogPiece = {
  name: string;
  version: string;
  sourcePath: string;
  metadataFile: string;
  summary: JsonRecord;
};

type CatalogManifest = {
  schemaVersion: "0.1";
  upstream: {
    repository: string;
    commit: string;
    release: string;
    license: string;
  };
  pieces: CatalogPiece[];
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
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionMatches(actual: string, requested?: string): boolean {
  if (!requested) return true;
  const actualVersion = parseVersion(actual);
  const requestedVersion = parseVersion(requested.replace(/^[~^]/, ""));
  if (!actualVersion || !requestedVersion) return actual === requested;
  if (requested.startsWith("~")) {
    return actualVersion[0] === requestedVersion[0] && actualVersion[1] === requestedVersion[1];
  }
  if (requested.startsWith("^")) return actualVersion[0] === requestedVersion[0];
  return actual === requested;
}

function curatedPieceRank(name: unknown): number {
  if (typeof name !== "string") return Number.MAX_SAFE_INTEGER;
  const rank = FLOWCORDIA_CURATED_ACTIVEPIECES_PIECES.indexOf(
    name as (typeof FLOWCORDIA_CURATED_ACTIVEPIECES_PIECES)[number]
  );
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
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

function parseManifest(value: unknown): CatalogManifest {
  if (!isRecord(value) || value.schemaVersion !== "0.1" || !Array.isArray(value.pieces)) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_catalog_invalid",
      500,
      "The bundled Activepieces piece catalog is invalid."
    );
  }
  const pieces: CatalogPiece[] = [];
  for (const candidate of value.pieces) {
    if (
      !isRecord(candidate) ||
      typeof candidate.name !== "string" ||
      typeof candidate.version !== "string" ||
      typeof candidate.sourcePath !== "string" ||
      typeof candidate.metadataFile !== "string" ||
      !isRecord(candidate.summary)
    ) {
      throw new StudioV2ActivepiecesPieceError(
        "activepieces_piece_catalog_invalid",
        500,
        "The bundled Activepieces piece catalog contains an invalid entry."
      );
    }
    pieces.push(candidate as unknown as CatalogPiece);
  }
  const upstream = value.upstream;
  if (!isRecord(upstream) || upstream.release !== ACTIVEPIECES_STUDIO_RELEASE) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_catalog_version_mismatch",
      500,
      `The bundled Activepieces catalog must match Studio release ${ACTIVEPIECES_STUDIO_RELEASE}.`
    );
  }
  return value as unknown as CatalogManifest;
}

function defaultCatalogRoot(): string {
  const configured = process.env.FLOWCORDIA_ACTIVEPIECES_CATALOG_PATH?.trim();
  if (configured) return resolve(configured);
  return resolve(process.cwd(), "../..", "studio-v2", "activepieces-catalog");
}

function catalogFile(root: string, relativePath: string): string {
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_catalog_invalid",
      500,
      "The bundled Activepieces catalog contains an unsafe file path."
    );
  }
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new StudioV2ActivepiecesPieceError(
      "activepieces_piece_catalog_invalid",
      500,
      "The bundled Activepieces catalog contains an unsafe file path."
    );
  }
  return path;
}

function queryStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function filterSummaries(pieces: CatalogPiece[], query?: JsonRecord): JsonRecord[] {
  const search =
    typeof query?.searchQuery === "string" ? query.searchQuery.trim().toLowerCase() : "";
  const categories = new Set(queryStrings(query?.categories));
  const includeHidden = query?.includeHidden === true || query?.includeHidden === "true";
  return pieces
    .map((piece): JsonRecord => ({ ...piece.summary, name: piece.name, version: piece.version }))
    .filter((summary) => includeHidden || summary.deprecated !== true)
    .filter((summary) => {
      if (!search) return true;
      return [summary.name, summary.displayName, summary.description]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(search));
    })
    .filter((summary) => {
      if (categories.size === 0) return true;
      return queryStrings(summary.categories).some((category) => categories.has(category));
    })
    .sort((left, right) => {
      const rank = curatedPieceRank(left.name) - curatedPieceRank(right.name);
      if (rank !== 0) return rank;
      return String(left.displayName ?? left.name).localeCompare(
        String(right.displayName ?? right.name)
      );
    });
}

export function createStudioV2ActivepiecesPieceAdapter(options?: {
  catalogRoot?: string;
  readFileImpl?: ReadFileLike;
}) {
  const catalogRoot = resolve(options?.catalogRoot ?? defaultCatalogRoot());
  const read = options?.readFileImpl ?? ((path, encoding) => readFile(path, encoding));
  let manifestCache: CatalogManifest | null = null;
  const metadataCache = new Map<string, JsonRecord>();

  const clearCaches = () => {
    manifestCache = null;
    metadataCache.clear();
  };

  const getManifest = async () => {
    if (manifestCache) return manifestCache;
    try {
      manifestCache = parseManifest(
        JSON.parse(await read(catalogFile(catalogRoot, "manifest.json"), "utf8"))
      );
      return manifestCache;
    } catch (error) {
      if (error instanceof StudioV2ActivepiecesPieceError) throw error;
      throw new StudioV2ActivepiecesPieceError(
        "activepieces_piece_catalog_unavailable",
        503,
        error instanceof Error
          ? `The bundled Activepieces piece catalog is unavailable: ${error.message}`
          : "The bundled Activepieces piece catalog is unavailable."
      );
    }
  };

  const getPiece = async (name: string, requestedVersion?: string): Promise<JsonRecord> => {
    const manifest = await getManifest();
    const piece = manifest.pieces.find(
      (candidate) => candidate.name === name && versionMatches(candidate.version, requestedVersion)
    );
    if (!piece) {
      throw new StudioV2ActivepiecesPieceError(
        "activepieces_piece_not_found",
        404,
        `Bundled Activepieces piece metadata was not found for ${name}${requestedVersion ? `@${requestedVersion}` : ""}.`
      );
    }
    const cached = metadataCache.get(piece.name);
    if (cached) return cached;
    try {
      const metadata = JSON.parse(await read(catalogFile(catalogRoot, piece.metadataFile), "utf8"));
      if (
        !isRecord(metadata) ||
        metadata.name !== piece.name ||
        metadata.version !== piece.version
      ) {
        throw new Error("metadata identity mismatch");
      }
      metadataCache.set(piece.name, metadata);
      return metadata;
    } catch (error) {
      throw new StudioV2ActivepiecesPieceError(
        "activepieces_piece_catalog_invalid",
        500,
        `Bundled metadata for ${piece.name}@${piece.version} is invalid${
          error instanceof Error ? `: ${error.message}` : "."
        }`
      );
    }
  };

  return async function handlePieces(input: {
    command: ActivepiecesApiCommand;
    canWrite: boolean;
  }): Promise<unknown> {
    const { command } = input;
    const manifest = await getManifest();

    if (command.method === "GET" && command.path === "/v1/pieces/registry") {
      return manifest.pieces.map(({ name, version }) => ({ name, version }));
    }
    if (command.method === "GET" && command.path === "/v1/pieces/categories") {
      return [
        ...new Set(manifest.pieces.flatMap((piece) => queryStrings(piece.summary.categories))),
      ].sort();
    }
    if (command.method === "GET" && command.path === "/v1/pieces") {
      return filterSummaries(manifest.pieces, command.query);
    }
    if (command.method === "GET") {
      const name = parsePieceName(command.path);
      if (name) {
        return getPiece(
          name,
          typeof command.query?.version === "string" ? command.query.version : undefined
        );
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
      await getManifest();
      return undefined;
    }
    if (command.method === "POST" && command.path === "/v1/pieces/options") {
      throw new StudioV2ActivepiecesPieceError(
        "activepieces_piece_options_not_mapped",
        501,
        "Activepieces dynamic piece options must execute through the Trigger.dev interaction worker."
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
      `Activepieces piece mutation is not mapped to Flowcordia: ${command.method} ${command.path}`
    );
  };
}
