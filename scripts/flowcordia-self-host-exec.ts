import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

interface Options {
  configPath: string;
  secretsPath: string;
  cwd: string;
  command: string[];
}

const COMMAND = /^(node|pnpm|docker)$/;

function usage(): never {
  console.error(
    "Usage: pnpm flowcordia:self-host:exec --config <path> --secrets <path> --cwd <path> -- <node|pnpm|docker> [args...]"
  );
  process.exit(2);
}

function absolute(candidate: string): string {
  if (!isAbsolute(candidate)) usage();
  return resolve(candidate);
}

function parseOptions(args: string[]): Options {
  const separator = args.indexOf("--");
  if (separator < 0 || separator === args.length - 1) usage();
  const flags = args.slice(0, separator);
  const command = args.slice(separator + 1);
  let configPath = "";
  let secretsPath = "";
  let cwd = "";
  for (let index = 0; index < flags.length; index += 2) {
    const key = flags[index];
    const value = flags[index + 1];
    if (!value) usage();
    if (key === "--config") configPath = absolute(value);
    else if (key === "--secrets") secretsPath = absolute(value);
    else if (key === "--cwd") cwd = absolute(value);
    else usage();
  }
  if (!configPath || !secretsPath || !cwd || !COMMAND.test(command[0] ?? "")) usage();
  return { configPath, secretsPath, cwd, command };
}

async function boundedEnvironment(path: string, label: string): Promise<Record<string, string>> {
  const first = await lstat(path);
  if (first.isSymbolicLink() || !first.isFile() || first.size < 2 || first.size > 128 * 1024) {
    throw new TypeError(`${label} is invalid or unsafe.`);
  }
  const source = await readFile(path, "utf8");
  const second = await lstat(path);
  if (first.dev !== second.dev || first.ino !== second.ino || first.mtimeMs !== second.mtimeMs) {
    throw new TypeError(`${label} changed while being read.`);
  }
  const result: Record<string, string> = {};
  for (const [index, original] of source.split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError(`${label} line ${index + 1} is invalid.`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]{1,99}$/.test(key) || Object.hasOwn(result, key)) {
      throw new TypeError(`${label} contains an invalid or duplicate key.`);
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value.replace(/\\n/g, "\n");
  }
  return result;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const repository = resolve(process.cwd());
  for (const path of [options.configPath, options.secretsPath]) {
    const location = relative(repository, path);
    if (location === "" || (!location.startsWith("..") && !isAbsolute(location))) {
      throw new TypeError(
        "Flowcordia lifecycle configuration must be stored outside the repository."
      );
    }
  }
  const secretInformation = await lstat(options.secretsPath);
  if ((secretInformation.mode & 0o077) !== 0) {
    throw new TypeError("Flowcordia lifecycle secrets permissions are unsafe.");
  }
  const [config, secrets] = await Promise.all([
    boundedEnvironment(options.configPath, "Configuration file"),
    boundedEnvironment(options.secretsPath, "Secrets file"),
  ]);
  if (Object.keys(secrets).some((key) => Object.hasOwn(config, key))) {
    throw new TypeError("Flowcordia lifecycle configuration and secrets overlap.");
  }
  const inherited: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TZ"]) {
    if (process.env[key]) inherited[key] = process.env[key];
  }
  const child = spawn(options.command[0]!, options.command.slice(1), {
    cwd: options.cwd,
    env: { ...inherited, ...config, ...secrets },
    stdio: "inherit",
    windowsHide: true,
  });
  const result = await new Promise<number>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) reject(new Error("Flowcordia lifecycle command was interrupted."));
      else resolvePromise(code ?? 1);
    });
  });
  process.exitCode = result;
}

void main().catch(() => {
  console.error("Flowcordia lifecycle command failed safely.");
  process.exitCode = 1;
});
