import { chmod, link, lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createFlowcordiaSelfHostLifecycleEvidence } from "../apps/webapp/app/features/flowcordia/operations/self-host-lifecycle";

interface Options {
  paths: Record<string, string>;
  repository: string;
  runId: string;
  runAttempt: number;
  sourceSha: string;
  output: string;
}

const REQUIRED_PATH_FLAGS = [
  "current-manifest",
  "current-image-evidence",
  "installation-identity-evidence",
  "clean-dependencies-evidence",
  "current-migration-evidence",
  "current-install-diagnostics",
  "current-restart-diagnostics",
  "backup-manifest",
  "restore-evidence",
  "upgrade-evidence",
  "target-manifest",
  "target-image-evidence",
  "target-migration-evidence",
  "target-diagnostics",
  "observations",
] as const;

function usage(): never {
  console.error(
    "Usage: pnpm flowcordia:self-host:lifecycle:evidence --current-manifest <path> --current-image-evidence <path> --installation-identity-evidence <path> --clean-dependencies-evidence <path> --current-migration-evidence <path> --current-install-diagnostics <path> --current-restart-diagnostics <path> --backup-manifest <path> --restore-evidence <path> --upgrade-evidence <path> --target-manifest <path> --target-image-evidence <path> --target-migration-evidence <path> --target-diagnostics <path> [--rollback-diagnostics <path>] --observations <path> --repository <owner/name> --run-id <id> --run-attempt <number> --source-sha <sha> --output <path>"
  );
  process.exit(2);
}

function outsideRepository(candidate: string): string {
  if (!isAbsolute(candidate)) usage();
  const path = resolve(candidate);
  const repository = resolve(process.cwd());
  const location = relative(repository, path);
  if (location === "" || (!location.startsWith("..") && !isAbsolute(location))) usage();
  return path;
}

function parseOptions(args: string[]): Options {
  const paths: Record<string, string> = {};
  let repository = "";
  let runId = "";
  let runAttempt = 0;
  let sourceSha = "";
  let output = "";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (!argument.startsWith("--") || !next) usage();
    const key = argument.slice(2);
    if ([...REQUIRED_PATH_FLAGS, "rollback-diagnostics"].includes(key as never)) {
      paths[key] = outsideRepository(next);
    } else if (key === "repository") repository = next;
    else if (key === "run-id") runId = next;
    else if (key === "run-attempt" && /^[0-9]+$/.test(next)) runAttempt = Number(next);
    else if (key === "source-sha") sourceSha = next;
    else if (key === "output") output = outsideRepository(next);
    else usage();
    index += 1;
  }
  if (
    REQUIRED_PATH_FLAGS.some((key) => !paths[key]) ||
    !repository ||
    !runId ||
    !runAttempt ||
    !sourceSha ||
    !output
  ) {
    usage();
  }
  return { paths, repository, runId, runAttempt, sourceSha, output };
}

async function boundedJson(path: string, label: string): Promise<unknown> {
  const first = await lstat(path);
  if (first.isSymbolicLink() || !first.isFile() || first.size < 2 || first.size > 2 * 1024 * 1024) {
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
  return JSON.parse(source);
}

async function writeNoOverwrite(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const information = await lstat(directory);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new TypeError("Flowcordia lifecycle evidence directory is unsafe.");
  }
  await chmod(directory, 0o700);
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new TypeError("Flowcordia lifecycle evidence already exists.");
    }
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const read = async (key: string) => await boundedJson(options.paths[key]!, key);
  const [
    currentManifest,
    currentImageEvidence,
    installationIdentityEvidence,
    cleanDependenciesEvidence,
    currentMigrationEvidence,
    currentInstallDiagnostics,
    currentRestartDiagnostics,
    backupManifest,
    restoreEvidence,
    upgradeEvidence,
    targetManifest,
    targetImageEvidence,
    targetMigrationEvidence,
    targetDiagnostics,
    observations,
  ] = await Promise.all(REQUIRED_PATH_FLAGS.map(read));
  const rollbackDiagnostics = options.paths["rollback-diagnostics"]
    ? await read("rollback-diagnostics")
    : undefined;
  const evidence = createFlowcordiaSelfHostLifecycleEvidence({
    currentManifest,
    currentImageEvidence,
    installationIdentityEvidence,
    cleanDependenciesEvidence,
    currentMigrationEvidence,
    currentInstallDiagnostics,
    currentRestartDiagnostics,
    backupManifest,
    restoreEvidence,
    upgradeEvidence,
    targetManifest,
    targetImageEvidence,
    targetMigrationEvidence,
    targetDiagnostics,
    rollbackDiagnostics,
    observations,
    checkedAt: new Date(),
    source: {
      repository: options.repository,
      runId: options.runId,
      runAttempt: options.runAttempt,
      sourceCommitSha: options.sourceSha,
    },
  });
  await writeNoOverwrite(options.output, evidence);
  console.log("Flowcordia self-host lifecycle: READY");
  console.log(`Current release: ${evidence.current.releaseId}`);
  console.log(`Target release: ${evidence.target.releaseId}`);
  console.log(`Upgrade kind: ${evidence.upgrade.kind}`);
  console.log(`Rollback mode: ${evidence.rollback.mode}`);
  console.log(`Evidence digest: ${evidence.evidenceSha256}`);
}

void main().catch(() => {
  console.error("Flowcordia self-host lifecycle evidence is blocked or unavailable.");
  process.exitCode = 1;
});
