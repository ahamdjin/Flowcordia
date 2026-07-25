import { lstat, open, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  createFlowcordiaBundledReleaseManifest,
  parseFlowcordiaBundledReleaseManifest,
} from "../apps/webapp/app/features/flowcordia/operations/bundled-release";

interface Options {
  applicationManifestPath: string;
  configPath: string;
  outputPath: string;
  compatibilityVersion: number;
  createdAt: Date;
  verify: boolean;
}

function usage(): never {
  console.error(
    "Usage: pnpm flowcordia:bundled:manifest --application-manifest <absolute-path> --config <absolute-path> --output <absolute-path> --compatibility-version <integer> --created-at <ISO timestamp> [--verify]"
  );
  process.exit(2);
}

function absolutePath(value: string): string {
  if (!isAbsolute(value)) usage();
  return resolve(value);
}

function parseOptions(args: string[]): Options {
  const values: Partial<Options> = { verify: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--verify") {
      values.verify = true;
      continue;
    }
    const next = args[index + 1];
    if (!next) usage();
    if (argument === "--application-manifest") {
      values.applicationManifestPath = absolutePath(next);
    } else if (argument === "--config") {
      values.configPath = absolutePath(next);
    } else if (argument === "--output") {
      values.outputPath = absolutePath(next);
    } else if (argument === "--compatibility-version") {
      values.compatibilityVersion = Number(next);
    } else if (argument === "--created-at") {
      values.createdAt = new Date(next);
    } else {
      usage();
    }
    index += 1;
  }
  if (
    !values.applicationManifestPath ||
    !values.configPath ||
    !values.outputPath ||
    !values.compatibilityVersion ||
    !values.createdAt
  ) {
    usage();
  }
  return values as Options;
}

async function boundedFile(path: string, label: string, maximumBytes: number): Promise<string> {
  const information = await lstat(path);
  if (
    information.isSymbolicLink() ||
    !information.isFile() ||
    information.size < 2 ||
    information.size > maximumBytes
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return readFile(path, "utf8");
}

function parseEnvironment(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [index, original] of source.split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError(`Configuration line ${index + 1} is invalid.`);
    const key = line.slice(0, separator).trim();
    let candidate = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]{1,99}$/.test(key) || Object.hasOwn(result, key)) {
      throw new TypeError("Configuration contains an invalid or duplicate key.");
    }
    if (
      (candidate.startsWith('"') && candidate.endsWith('"')) ||
      (candidate.startsWith("'") && candidate.endsWith("'"))
    ) {
      candidate = candidate.slice(1, -1);
    }
    result[key] = candidate.replace(/\\n/g, "\n");
  }
  return result;
}

async function writeNoOverwrite(path: string, content: string): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.verify) {
    const parsed = parseFlowcordiaBundledReleaseManifest(
      JSON.parse(await boundedFile(options.outputPath, "Bundled release manifest", 128 * 1024))
    );
    console.log(parsed.manifestSha256);
    return;
  }
  const applicationManifest = JSON.parse(
    await boundedFile(options.applicationManifestPath, "Application release manifest", 64 * 1024)
  ) as unknown;
  const environment = parseEnvironment(
    await boundedFile(options.configPath, "Configuration file", 128 * 1024)
  );
  const manifest = createFlowcordiaBundledReleaseManifest({
    compatibilityVersion: options.compatibilityVersion,
    createdAt: options.createdAt,
    applicationManifest,
    environment,
  });
  await writeNoOverwrite(options.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(manifest.manifestSha256);
}

void main().catch(() => {
  console.error("Flowcordia bundled release manifest creation or verification failed safely.");
  process.exitCode = 1;
});
