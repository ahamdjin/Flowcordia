import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

type PackageManifest = {
  name?: string;
  version?: string;
  type?: string;
  main?: string;
  types?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type CatalogManifest = {
  schemaVersion: string;
  upstream: { commit: string; release: string };
  pieces: Array<{ name: string; version: string; sourcePath: string }>;
};

type VendoredPackage = { name: string; sourceDirectory: string; manifest: PackageManifest };

const PACKAGE_ROOTS = [
  "studio-v2/activepieces-core-nodes/packages/core",
  "studio-v2/activepieces-core-nodes/packages/pieces/common",
  "studio-v2/activepieces-core-nodes/packages/pieces/core",
  "studio-v2/activepieces-core-nodes/packages/pieces/community",
  "studio-v2/activepieces-core-nodes/packages/pieces/framework",
] as const;
const DEPENDENCY_PACKAGE_ROOTS = [
  "studio-v2/activepieces-core-nodes/packages/core",
  "studio-v2/activepieces-core-nodes/packages/pieces/common",
  "studio-v2/activepieces-core-nodes/packages/pieces/framework",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function packageManifest(directory: string): Promise<PackageManifest | null> {
  try {
    const value = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    return isRecord(value) ? (value as PackageManifest) : null;
  } catch {
    return null;
  }
}

async function packageIndex(repositoryRoot: string): Promise<Map<string, VendoredPackage>> {
  const index = new Map<string, VendoredPackage>();
  for (const relativeRoot of DEPENDENCY_PACKAGE_ROOTS) {
    const root = resolve(repositoryRoot, relativeRoot);
    const rootManifest = await packageManifest(root);
    if (typeof rootManifest?.name === "string") {
      index.set(rootManifest.name, {
        name: rootManifest.name,
        sourceDirectory: root,
        manifest: rootManifest,
      });
    }
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = join(root, entry.name);
      const manifest = await packageManifest(directory);
      if (typeof manifest?.name !== "string") continue;
      index.set(manifest.name, { name: manifest.name, sourceDirectory: directory, manifest });
    }
  }
  return index;
}

function workspaceDependencies(manifest: PackageManifest): string[] {
  return [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies]
    .filter((value): value is Record<string, string> => Boolean(value))
    .flatMap((dependencies) =>
      Object.entries(dependencies)
        .filter(([, version]) => version.startsWith("workspace:"))
        .map(([name]) => name)
    );
}

function targetPackageDirectory(packagesDirectory: string, packageName: string): string {
  return join(packagesDirectory, packageName.replace(/^@/, "").replaceAll("/", "__"));
}

function runtimeManifest(manifest: PackageManifest): PackageManifest {
  const next = { ...manifest };
  delete next.scripts;
  delete next.devDependencies;
  next.private = true;
  next.main = "./src/index.ts";
  next.types = "./src/index.ts";
  return next;
}

function shouldCopy(source: string): boolean {
  const normalized = source.replaceAll("\\", "/");
  return !["/node_modules/", "/dist/", "/.turbo/", "/coverage/", "/.git/"].some((segment) =>
    normalized.includes(segment)
  );
}

async function catalog(repositoryRoot: string): Promise<CatalogManifest> {
  const value = JSON.parse(
    await readFile(
      join(repositoryRoot, "studio-v2", "activepieces-catalog", "manifest.json"),
      "utf8"
    )
  );
  if (!isRecord(value) || value.schemaVersion !== "0.1" || !Array.isArray(value.pieces)) {
    throw new Error("The bundled Activepieces catalog manifest is invalid.");
  }
  return value as unknown as CatalogManifest;
}

export async function copyVendoredActivepiecesPiece(input: {
  repositoryRoot: string;
  contextDirectory: string;
  pieceName: string;
  pieceVersion: string;
}): Promise<{ upstreamCommit: string; copiedPackages: string[] }> {
  const catalogManifest = await catalog(input.repositoryRoot);
  const catalogPiece = catalogManifest.pieces.find(
    (piece) => piece.name === input.pieceName && piece.version === input.pieceVersion
  );
  if (!catalogPiece) {
    throw new Error(
      `Activepieces piece ${input.pieceName}@${input.pieceVersion} is not present in the bundled catalog.`
    );
  }

  const index = await packageIndex(input.repositoryRoot);
  const sourceDirectory = resolve(input.repositoryRoot, catalogPiece.sourcePath);
  const sourceManifest = await packageManifest(sourceDirectory);
  if (sourceManifest?.name !== input.pieceName || sourceManifest.version !== input.pieceVersion) {
    throw new Error(`Bundled source for ${input.pieceName}@${input.pieceVersion} is unavailable.`);
  }
  index.set(input.pieceName, {
    name: input.pieceName,
    sourceDirectory,
    manifest: sourceManifest,
  });

  const selected = new Map<string, VendoredPackage>();
  const queue = [input.pieceName, "@activepieces/core-formula"];
  while (queue.length > 0) {
    const packageName = queue.shift()!;
    if (selected.has(packageName)) continue;
    const candidate = index.get(packageName);
    if (!candidate)
      throw new Error(`Bundled Activepieces dependency ${packageName} is unavailable.`);
    selected.set(packageName, candidate);
    for (const dependency of workspaceDependencies(candidate.manifest)) queue.push(dependency);
  }

  const packagesDirectory = join(input.contextDirectory, "packages");
  await mkdir(packagesDirectory, { recursive: true });
  for (const candidate of selected.values()) {
    const destination = targetPackageDirectory(packagesDirectory, candidate.name);
    await cp(candidate.sourceDirectory, destination, { recursive: true, filter: shouldCopy });
    await writeFile(
      join(destination, "package.json"),
      `${JSON.stringify(runtimeManifest(candidate.manifest), null, 2)}\n`,
      "utf8"
    );
    const license = join(input.repositoryRoot, "studio-v2", "activepieces-core-nodes", "LICENSE");
    await cp(license, join(destination, "LICENSE"));
  }

  return {
    upstreamCommit: catalogManifest.upstream.commit,
    copiedPackages: [...selected.keys()].sort(),
  };
}

export const activepiecesVendorContract = {
  packageRoots: [...PACKAGE_ROOTS],
  targetName(packageName: string) {
    return basename(targetPackageDirectory("", packageName));
  },
};
