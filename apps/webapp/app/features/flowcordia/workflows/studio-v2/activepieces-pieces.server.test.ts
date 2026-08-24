import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVEPIECES_STUDIO_RELEASE,
  FLOWCORDIA_CURATED_ACTIVEPIECES_PIECES,
  createStudioV2ActivepiecesPieceAdapter,
} from "./activepieces-pieces.server";

function command(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  query?: Record<string, unknown>
) {
  return { intent: "activepieces_api" as const, method, path, query };
}

const pieces = [
  {
    name: "@activepieces/piece-http",
    version: "0.11.13",
    sourcePath: "packages/pieces/core/http",
    metadataFile: "metadata/http.json",
    summary: {
      displayName: "HTTP",
      description: "Send HTTP requests",
      actions: 1,
      triggers: 0,
      categories: ["CORE"],
    },
  },
  {
    name: "@activepieces/piece-mcp-client",
    version: "0.0.2",
    sourcePath: "packages/pieces/community/mcp-client",
    metadataFile: "metadata/mcp-client.json",
    summary: {
      displayName: "MCP Client",
      description: "Call an MCP tool",
      actions: 1,
      triggers: 0,
      categories: ["ARTIFICIAL_INTELLIGENCE"],
    },
  },
  {
    name: "@activepieces/piece-slack",
    version: "0.17.6",
    sourcePath: "packages/pieces/community/slack",
    metadataFile: "metadata/slack.json",
    summary: {
      displayName: "Slack",
      description: "Slack integration",
      actions: 2,
      triggers: 1,
      categories: ["COMMUNICATION"],
    },
  },
];

describe("Studio V2 bundled Activepieces piece catalog", () => {
  let catalogRoot: string;

  beforeEach(async () => {
    catalogRoot = await mkdtemp(join(tmpdir(), "flowcordia-activepieces-catalog-"));
    await mkdir(join(catalogRoot, "metadata"));
    await writeFile(
      join(catalogRoot, "manifest.json"),
      JSON.stringify({
        schemaVersion: "0.1",
        upstream: {
          repository: "https://github.com/activepieces/activepieces.git",
          commit: "d1b800f3db6db52379476c069ea3cdbd2c998276",
          release: ACTIVEPIECES_STUDIO_RELEASE,
          license: "MIT",
        },
        pieces,
      })
    );
    for (const piece of pieces) {
      await writeFile(
        join(catalogRoot, piece.metadataFile),
        JSON.stringify({
          ...piece.summary,
          name: piece.name,
          version: piece.version,
          actions: { action: { name: "action", displayName: "Action" } },
          triggers: {},
        })
      );
    }
  });

  afterEach(async () => {
    await rm(catalogRoot, { recursive: true, force: true });
  });

  it("loads exact versions from the local pinned catalog without network access", async () => {
    const adapter = createStudioV2ActivepiecesPieceAdapter({ catalogRoot });
    await expect(
      adapter({ command: command("GET", "/v1/pieces/registry"), canWrite: false })
    ).resolves.toEqual(pieces.map(({ name, version }) => ({ name, version })));

    await expect(
      adapter({
        command: command("GET", "/v1/pieces/@activepieces/piece-http", {
          version: "~0.11.0",
        }),
        canWrite: false,
      })
    ).resolves.toMatchObject({ name: "@activepieces/piece-http", version: "0.11.13" });
  });

  it("searches, filters, and prioritizes the curated local piece list", async () => {
    const adapter = createStudioV2ActivepiecesPieceAdapter({ catalogRoot });
    const all = (await adapter({
      command: command("GET", "/v1/pieces"),
      canWrite: false,
    })) as Array<Record<string, unknown>>;
    expect(all.map((piece) => piece.name)).toEqual([
      "@activepieces/piece-http",
      "@activepieces/piece-mcp-client",
      "@activepieces/piece-slack",
    ]);
    expect(FLOWCORDIA_CURATED_ACTIVEPIECES_PIECES).toContain("@activepieces/piece-mcp-client");

    await expect(
      adapter({
        command: command("GET", "/v1/pieces", { searchQuery: "slack" }),
        canWrite: false,
      })
    ).resolves.toEqual([expect.objectContaining({ name: "@activepieces/piece-slack" })]);
    await expect(
      adapter({
        command: command("GET", "/v1/pieces", {
          categories: ["ARTIFICIAL_INTELLIGENCE"],
        }),
        canWrite: false,
      })
    ).resolves.toEqual([expect.objectContaining({ name: "@activepieces/piece-mcp-client" })]);
  });

  it("routes dynamic options to the Trigger interaction worker boundary", async () => {
    const adapter = createStudioV2ActivepiecesPieceAdapter({ catalogRoot });
    await expect(
      adapter({ command: command("POST", "/v1/pieces/options"), canWrite: true })
    ).rejects.toMatchObject({ code: "activepieces_piece_options_not_mapped", status: 501 });
  });

  it("refreshes the local snapshot only through an authorized sync request", async () => {
    let manifestReads = 0;
    const adapter = createStudioV2ActivepiecesPieceAdapter({
      catalogRoot,
      readFileImpl: async (path, encoding) => {
        if (path.endsWith("manifest.json")) manifestReads += 1;
        return readFile(path, encoding);
      },
    });
    await adapter({ command: command("GET", "/v1/pieces/registry"), canWrite: false });
    await adapter({ command: command("GET", "/v1/pieces/registry"), canWrite: false });
    expect(manifestReads).toBe(1);

    await expect(
      adapter({ command: command("POST", "/v1/pieces/sync"), canWrite: false })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await adapter({ command: command("POST", "/v1/pieces/sync"), canWrite: true });
    expect(manifestReads).toBe(2);
  });
});
