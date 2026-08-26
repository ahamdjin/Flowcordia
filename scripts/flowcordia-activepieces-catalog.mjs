#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PIECES_ROOT = path.join(
  REPOSITORY_ROOT,
  "studio-v2",
  "activepieces-core-nodes",
  "packages",
  "pieces"
);
const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, "studio-v2", "activepieces-catalog");
const METADATA_ROOT = path.join(OUTPUT_ROOT, "metadata");
const UPSTREAM_COMMIT = "d1b800f3db6db52379476c069ea3cdbd2c998276";
const ACTIVEPIECES_RELEASE = "0.86.3";
const CATALOG_URL = "https://cloud.activepieces.com/api/v1/pieces";
const CONCURRENCY = 16;

async function packageDirectories(group) {
  const root = path.join(PIECES_ROOT, group);
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
}

async function vendoredPieces() {
  const directories = [
    ...(await packageDirectories("core")),
    ...(await packageDirectories("community")),
  ];
  const pieces = [];
  for (const directory of directories) {
    const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    if (
      typeof manifest.name !== "string" ||
      !manifest.name.startsWith("@activepieces/piece-") ||
      typeof manifest.version !== "string"
    ) {
      throw new Error(`Invalid Activepieces piece manifest: ${directory}`);
    }
    pieces.push({
      name: manifest.name,
      version: manifest.version,
      sourcePath: path.relative(REPOSITORY_ROOT, directory).replaceAll("\\", "/"),
    });
  }
  return pieces.sort((left, right) => left.name.localeCompare(right.name));
}

function metadataFile(pieceName) {
  return `${pieceName.replace("@activepieces/piece-", "")}.json`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Activepieces catalog request failed with HTTP ${response.status}: ${url}`);
  }
  return response.json();
}

async function mapConcurrent(values, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        output[index] = await worker(values[index], index);
      }
    })
  );
  return output;
}

async function main() {
  const pieces = await vendoredPieces();
  const summaries = await fetchJson(`${CATALOG_URL}?edition=ce&includeHidden=true`);
  if (!Array.isArray(summaries)) throw new Error("Activepieces returned an invalid piece list.");
  const summaryByName = new Map(summaries.map((summary) => [summary.name, summary]));

  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(METADATA_ROOT, { recursive: true });

  const catalogPieces = await mapConcurrent(pieces, async (piece, index) => {
    const scopedName = piece.name.split("/");
    const url = `${CATALOG_URL}/${encodeURIComponent(scopedName[0])}/${encodeURIComponent(
      scopedName[1]
    )}?version=${encodeURIComponent(piece.version)}`;
    const metadata = await fetchJson(url);
    if (metadata?.name !== piece.name || metadata?.version !== piece.version) {
      throw new Error(
        `Activepieces returned mismatched metadata for ${piece.name}@${piece.version}.`
      );
    }
    const file = metadataFile(piece.name);
    await writeFile(path.join(METADATA_ROOT, file), `${JSON.stringify(metadata)}\n`, "utf8");
    if ((index + 1) % 50 === 0 || index + 1 === pieces.length) {
      process.stdout.write(`Fetched ${index + 1}/${pieces.length} piece metadata records.\n`);
    }
    const summary = summaryByName.get(piece.name);
    return {
      name: piece.name,
      version: piece.version,
      sourcePath: piece.sourcePath,
      metadataFile: `metadata/${file}`,
      summary:
        summary && summary.version === piece.version
          ? summary
          : {
              ...metadata,
              i18n: undefined,
              actions: Object.keys(metadata.actions ?? {}).length,
              triggers: Object.keys(metadata.triggers ?? {}).length,
            },
    };
  });

  const manifest = {
    schemaVersion: "0.1",
    upstream: {
      repository: "https://github.com/activepieces/activepieces.git",
      commit: UPSTREAM_COMMIT,
      release: ACTIVEPIECES_RELEASE,
      license: "MIT",
    },
    generatedAt: new Date().toISOString(),
    pieces: catalogPieces,
  };
  await writeFile(path.join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest)}\n`, "utf8");
  await writeFile(
    path.join(OUTPUT_ROOT, "README.md"),
    `# Flowcordia Activepieces catalog\n\nGenerated from the MIT-licensed Activepieces CE source at \`${UPSTREAM_COMMIT}\`. Runtime catalog reads are local; regenerate with \`pnpm flowcordia:activepieces:catalog\`.\n`,
    "utf8"
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
