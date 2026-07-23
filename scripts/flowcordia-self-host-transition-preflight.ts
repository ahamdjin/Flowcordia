import { chmod, lstat, link, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  createFlowcordiaSelfHostInstallationIdentityEvidence,
  type FlowcordiaSelfHostInstallationIdentityEvidence,
} from "../apps/webapp/app/features/flowcordia/operations/self-host-lifecycle-preflight";

interface Options {
  currentConfig: string;
  currentSecrets: string;
  currentManifest: string;
  targetConfig: string;
  targetSecrets: string;
  targetManifest: string;
  output: string;
}

function usage(): never {
  console.error(
    "Usage: pnpm flowcordia:self-host:transition-preflight --current-config <path> --current-secrets <path> --current-manifest <path> --target-config <path> --target-secrets <path> --target-manifest <path> --output <path>"
  );
  process.exit(2);
}

function outsideRepository(candidate: string): string {
  if (!isAbsolute(candidate)) usage();
  const path = resolve(candidate);
  const location = relative(resolve(process.cwd()), path);
  if (location === "" || (!location.startsWith("..") && !isAbsolute(location))) usage();
  return path;
}

function parseOptions(args: string[]): Options {
  const values: Partial<Options> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!value) usage();
    if (key === "--current-config") values.currentConfig = outsideRepository(value);
    else if (key === "--current-secrets") values.currentSecrets = outsideRepository(value);
    else if (key === "--current-manifest") values.currentManifest = outsideRepository(value);
    else if (key === "--target-config") values.targetConfig = outsideRepository(value);
    else if (key === "--target-secrets") values.targetSecrets = outsideRepository(value);
    else if (key === "--target-manifest") values.targetManifest = outsideRepository(value);
    else if (key === "--output") values.output = outsideRepository(value);
    else usage();
  }
  if (Object.values(values).length !== 7) usage();
  return values as Options;
}

async function boundedText(path: string, label: string, maximumBytes: number): Promise<string> {
  const first = await lstat(path);
  if (first.isSymbolicLink() || !first.isFile() || first.size < 2 || first.size > maximumBytes) {
    throw new TypeError(`${label} is invalid or unsafe.`);
  }
  const source = await readFile(path, "utf8");
  const second = await lstat(path);
  if (
    second.isSymbolicLink() ||
    !second.isFile() ||
    first.dev !== second.dev ||
    first.ino !== second.ino ||
    first.size !== second.size ||
    first.mtimeMs !== second.mtimeMs
  ) {
    throw new TypeError(`${label} changed while being read.`);
  }
  return source;
}

function parseEnvironment(source: string, label: string): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [index, original] of source.split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError(`${label} line ${index + 1} is invalid.`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]{1,99}$/.test(key) || Object.hasOwn(environment, key)) {
      throw new TypeError(`${label} contains an invalid or duplicate key.`);
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    environment[key] = value.replace(/\\n/g, "\n");
  }
  return environment;
}

async function deploymentEnvironment(
  config: string,
  secrets: string
): Promise<Record<string, string>> {
  const secretInformation = await lstat(secrets);
  if ((secretInformation.mode & 0o077) !== 0) {
    throw new TypeError("Lifecycle secrets permissions are unsafe.");
  }
  const [configValues, secretValues] = await Promise.all([
    boundedText(config, "Lifecycle configuration", 128 * 1024),
    boundedText(secrets, "Lifecycle secrets", 128 * 1024),
  ]);
  const parsedConfig = parseEnvironment(configValues, "Lifecycle configuration");
  const parsedSecrets = parseEnvironment(secretValues, "Lifecycle secrets");
  if (Object.keys(parsedSecrets).some((key) => Object.hasOwn(parsedConfig, key))) {
    throw new TypeError("Lifecycle configuration and secrets overlap.");
  }
  return { ...parsedConfig, ...parsedSecrets };
}

async function writeEvidence(
  path: string,
  evidence: FlowcordiaSelfHostInstallationIdentityEvidence
) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const information = await lstat(directory);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new TypeError("Lifecycle evidence directory is unsafe.");
  }
  await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new TypeError("Lifecycle installation evidence already exists.");
    }
    throw error;
  }
  await rm(temporary, { force: true });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const [currentEnvironment, targetEnvironment, currentManifest, targetManifest] =
    await Promise.all([
      deploymentEnvironment(options.currentConfig, options.currentSecrets),
      deploymentEnvironment(options.targetConfig, options.targetSecrets),
      boundedText(options.currentManifest, "Current release manifest", 64 * 1024).then(JSON.parse),
      boundedText(options.targetManifest, "Target release manifest", 64 * 1024).then(JSON.parse),
    ]);
  const evidence = createFlowcordiaSelfHostInstallationIdentityEvidence({
    currentManifest,
    targetManifest,
    currentEnvironment,
    targetEnvironment,
    checkedAt: new Date(),
  });
  await writeEvidence(options.output, evidence);
  console.log("Flowcordia lifecycle installation identity: READY");
  console.log(`Installation digest: ${evidence.installationSha256}`);
  console.log(`Evidence digest: ${evidence.evidenceSha256}`);
}

void main().catch(() => {
  console.error("Flowcordia lifecycle installation identity is blocked or unavailable.");
  process.exitCode = 1;
});
