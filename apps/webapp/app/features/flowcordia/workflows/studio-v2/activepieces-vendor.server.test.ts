import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyVendoredActivepiecesPiece } from "./activepieces-vendor.server";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("bundled Activepieces source", () => {
  it.each([
    ["@activepieces/piece-http", "0.11.13"],
    ["@activepieces/piece-mcp-client", "0.0.2"],
  ])(
    "copies %s and its workspace runtime dependencies",
    async (pieceName, pieceVersion) => {
      const contextDirectory = await mkdtemp(join(tmpdir(), "flowcordia-piece-vendor-"));
      temporaryDirectories.push(contextDirectory);

      const result = await copyVendoredActivepiecesPiece({
        repositoryRoot: resolve(process.cwd(), "../.."),
        contextDirectory,
        pieceName,
        pieceVersion,
      });

      expect(result.upstreamCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(result.copiedPackages).toContain(pieceName);
      expect(result.copiedPackages).toContain("@activepieces/pieces-framework");
      expect(result.copiedPackages).toContain("@activepieces/core-formula");

      const packageDirectory = join(
        contextDirectory,
        "packages",
        pieceName.replace(/^@/, "").replaceAll("/", "__")
      );
      const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
      expect(manifest.main).toBe("./src/index.ts");
      expect(manifest.devDependencies).toBeUndefined();
      await expect(stat(join(packageDirectory, "src", "index.ts"))).resolves.toBeDefined();
      await expect(stat(join(packageDirectory, "LICENSE"))).resolves.toBeDefined();
    },
    15_000
  );
});
