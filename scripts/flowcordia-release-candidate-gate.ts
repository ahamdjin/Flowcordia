import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { validateFlowcordiaReleaseCandidateEvidence } from "../apps/webapp/app/features/flowcordia/acceptance/release-candidate-evidence.server";

interface Options {
  releaseId: string;
  currentApplicationCommitSha: string;
  targetApplicationCommitSha: string;
  liveDependencyPath: string;
  backupManifestPath: string;
  restoreEvidencePath: string;
  upgradeEvidencePath: string;
  maximumAgeMs: number;
  json: boolean;
}

const MAX_JSON_BYTES = 1024 * 1024;

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-release-candidate-gate.ts --release-id <id> --current-application-sha <sha> --target-application-sha <sha> --live-dependency <path> --backup-manifest <path> --restore-evidence <path> --upgrade-evidence <path> [--max-age-hours <1-168>] [--json]"
  );
  process.exit(2);
}

function outsideRepository(path: string): string {
  const repository = resolve(process.cwd());
  const location = resolve(path);
  const relativePath = relative(repository, location);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    console.error("Flowcordia release-candidate evidence must be stored outside the repository.");
    process.exit(2);
  }
  return location;
}

function parseOptions(args: string[]): Options {
  const values: Partial<Options> = { maximumAgeMs: 24 * 60 * 60 * 1_000, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--release-id" && next) {
      values.releaseId = next;
      index += 1;
      continue;
    }
    if (argument === "--current-application-sha" && next) {
      values.currentApplicationCommitSha = next;
      index += 1;
      continue;
    }
    if (argument === "--target-application-sha" && next) {
      values.targetApplicationCommitSha = next;
      index += 1;
      continue;
    }
    if (argument === "--live-dependency" && next) {
      values.liveDependencyPath = outsideRepository(next);
      index += 1;
      continue;
    }
    if (argument === "--backup-manifest" && next) {
      values.backupManifestPath = outsideRepository(next);
      index += 1;
      continue;
    }
    if (argument === "--restore-evidence" && next) {
      values.restoreEvidencePath = outsideRepository(next);
      index += 1;
      continue;
    }
    if (argument === "--upgrade-evidence" && next) {
      values.upgradeEvidencePath = outsideRepository(next);
      index += 1;
      continue;
    }
    if (argument === "--max-age-hours" && next && /^[0-9]+$/.test(next)) {
      const hours = Number(next);
      if (!Number.isSafeInteger(hours) || hours < 1 || hours > 168) usage();
      values.maximumAgeMs = hours * 60 * 60 * 1_000;
      index += 1;
      continue;
    }
    if (argument === "--json") {
      values.json = true;
      continue;
    }
    usage();
  }
  if (
    !values.releaseId ||
    !values.currentApplicationCommitSha ||
    !values.targetApplicationCommitSha ||
    !values.liveDependencyPath ||
    !values.backupManifestPath ||
    !values.restoreEvidencePath ||
    !values.upgradeEvidencePath
  ) {
    usage();
  }
  return values as Options;
}

async function readBoundedJson(path: string): Promise<unknown> {
  const file = await stat(path);
  if (!file.isFile() || file.size <= 0 || file.size > MAX_JSON_BYTES) {
    throw new TypeError("Release-candidate evidence file is invalid.");
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const [liveDependencyEvidence, backupManifestEvidence, restoreEvidence, upgradeEvidence] =
    await Promise.all([
      readBoundedJson(options.liveDependencyPath),
      readBoundedJson(options.backupManifestPath),
      readBoundedJson(options.restoreEvidencePath),
      readBoundedJson(options.upgradeEvidencePath),
    ]);
  const result = validateFlowcordiaReleaseCandidateEvidence({
    liveDependencyEvidence,
    backupManifestEvidence,
    restoreEvidence,
    upgradeEvidence,
    releaseId: options.releaseId,
    currentApplicationCommitSha: options.currentApplicationCommitSha,
    targetApplicationCommitSha: options.targetApplicationCommitSha,
    checkedAt: new Date().toISOString(),
    maximumAgeMs: options.maximumAgeMs,
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Flowcordia release-candidate gate: READY");
  console.log(`Release: ${result.releaseId}`);
  console.log(`Upgrade: ${result.summary.upgrade.kind}`);
  console.log(`Pending migrations: ${result.summary.upgrade.pendingMigrationCount}`);
  console.log(`Restore evidence: ${result.summary.recovery.restoreEvidenceSha256}`);
}

void main().catch(() => {
  console.error("Flowcordia release-candidate evidence is blocked or unavailable.");
  process.exitCode = 1;
});
