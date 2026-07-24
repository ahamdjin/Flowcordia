import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { presentFlowcordiaBundledSelfHostTopology } from "../apps/webapp/app/features/flowcordia/operations/bundled-self-host-topology";

interface Options {
  configPath: string;
  secretsPath: string;
  manifestPath: string;
  registryAuthPath: string;
}

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-bundled-validate.ts --config <deployment.env> --secrets <deployment.secrets> --manifest <release-manifest.json> --registry-auth <registry.htpasswd>"
  );
  process.exit(2);
}

function optionPath(candidate: string): string {
  if (!isAbsolute(candidate)) usage();
  return resolve(candidate);
}

function parseOptions(args: string[]): Options {
  const values: Partial<Options> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (!next) usage();
    if (argument === "--config") values.configPath = optionPath(next);
    else if (argument === "--secrets") values.secretsPath = optionPath(next);
    else if (argument === "--manifest") values.manifestPath = optionPath(next);
    else if (argument === "--registry-auth") values.registryAuthPath = optionPath(next);
    else usage();
    index += 1;
  }
  if (
    !values.configPath ||
    !values.secretsPath ||
    !values.manifestPath ||
    !values.registryAuthPath
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

function parseEnvironment(source: string, label: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [index, original] of source.split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError(`${label} line ${index + 1} is invalid.`);
    const key = line.slice(0, separator).trim();
    let candidate = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]{1,99}$/.test(key) || Object.hasOwn(result, key)) {
      throw new TypeError(`${label} contains an invalid or duplicate key.`);
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

function ensureOutsideRepository(path: string, label: string): void {
  const repository = resolve(process.cwd());
  const relativePath = relative(repository, path);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    throw new TypeError(`${label} must be stored outside the repository.`);
  }
}

function ensureOwnerOnly(mode: number, label: string): void {
  if ((mode & 0o077) !== 0) {
    throw new TypeError(`${label} must not be readable or writable by group or other users.`);
  }
}

function validRegistryAuth(source: string): boolean {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length === 1 && /^flowcordia:\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(lines[0]);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  ensureOutsideRepository(options.configPath, "Configuration file");
  ensureOutsideRepository(options.secretsPath, "Secrets file");
  ensureOutsideRepository(options.manifestPath, "Release manifest");
  ensureOutsideRepository(options.registryAuthPath, "Registry authentication file");

  const secretsInformation = await lstat(options.secretsPath);
  ensureOwnerOnly(secretsInformation.mode, "Secrets file");
  const registryInformation = await lstat(options.registryAuthPath);
  ensureOwnerOnly(registryInformation.mode, "Registry authentication file");

  const config = parseEnvironment(
    await boundedFile(options.configPath, "Configuration file", 128 * 1024),
    "Configuration file"
  );
  const secrets = parseEnvironment(
    await boundedFile(options.secretsPath, "Secrets file", 128 * 1024),
    "Secrets file"
  );
  const duplicate = Object.keys(secrets).find((key) => Object.hasOwn(config, key));
  if (duplicate) {
    throw new TypeError("Configuration and secrets files must not define the same key.");
  }

  const registryAuth = await boundedFile(
    options.registryAuthPath,
    "Registry authentication file",
    8 * 1024
  );
  if (!validRegistryAuth(registryAuth)) {
    throw new TypeError("Registry authentication file is malformed or uses an unexpected user.");
  }

  const environment = { ...config, ...secrets };
  if (resolve(environment.FLOWCORDIA_REGISTRY_AUTH_FILE ?? "") !== options.registryAuthPath) {
    throw new TypeError("Registry authentication file does not match deployment configuration.");
  }

  const manifest = JSON.parse(
    await boundedFile(options.manifestPath, "Release manifest", 64 * 1024)
  ) as unknown;
  const projection = presentFlowcordiaBundledSelfHostTopology({
    environment,
    releaseManifest: manifest,
    checkedAt: new Date(),
    nodeVersion: process.versions.node,
  });

  console.log(`Flowcordia bundled self-host topology: ${projection.state}`);
  console.log(`Release: ${projection.releaseId}`);
  console.log(`Application: ${projection.applicationCommitSha}`);
  console.log(`Image digest: ${projection.imageDigest}`);
  for (const candidate of projection.checks) {
    console.log(`${candidate.key}: ${candidate.state}`);
  }
  if (projection.state !== "READY") process.exitCode = 1;
}

void main().catch(() => {
  console.error("Flowcordia bundled self-host topology is blocked or unavailable.");
  process.exitCode = 1;
});
