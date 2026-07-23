import { stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { buildFlowcordiaReleaseDistributionManifest } from "../apps/webapp/app/features/flowcordia/operations/release-distribution.server";

interface Options {
  releaseId: string;
  version: string;
  applicationCommitSha: string;
  upstreamCommitSha: string;
  imageReference: string;
  createdAt: Date;
  outputPath: string;
}

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-release-distribution.ts --release-id <id> --version <semver> --application-sha <sha> --upstream-sha <sha> --image <repository@sha256:digest> --created-at <canonical-rfc3339> --output <outside-repository.json>"
  );
  process.exit(2);
}

function outsideRepository(value: string): string {
  const repository = resolve(process.cwd());
  const location = resolve(value);
  const relativePath = relative(repository, location);
  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath)) ||
    !location.endsWith(".json")
  ) {
    console.error("Flowcordia release manifests must use a JSON path outside the repository.");
    process.exit(2);
  }
  return location;
}

function canonicalDate(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) usage();
  return parsed;
}

function parseOptions(args: string[]): Options {
  const values: Partial<Options> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--release-id" && next) {
      values.releaseId = next;
      index += 1;
      continue;
    }
    if (argument === "--version" && next) {
      values.version = next;
      index += 1;
      continue;
    }
    if (argument === "--application-sha" && next) {
      values.applicationCommitSha = next;
      index += 1;
      continue;
    }
    if (argument === "--upstream-sha" && next) {
      values.upstreamCommitSha = next;
      index += 1;
      continue;
    }
    if (argument === "--image" && next) {
      values.imageReference = next;
      index += 1;
      continue;
    }
    if (argument === "--created-at" && next) {
      values.createdAt = canonicalDate(next);
      index += 1;
      continue;
    }
    if (argument === "--output" && next) {
      values.outputPath = outsideRepository(next);
      index += 1;
      continue;
    }
    usage();
  }
  if (
    !values.releaseId ||
    !values.version ||
    !values.applicationCommitSha ||
    !values.upstreamCommitSha ||
    !values.imageReference ||
    !values.createdAt ||
    !values.outputPath
  ) {
    usage();
  }
  return values as Options;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const parent = await stat(dirname(options.outputPath));
  if (!parent.isDirectory()) {
    throw new TypeError("Release manifest output directory is invalid.");
  }
  const manifest = await buildFlowcordiaReleaseDistributionManifest({
    releaseId: options.releaseId,
    version: options.version,
    applicationCommitSha: options.applicationCommitSha,
    upstreamCommitSha: options.upstreamCommitSha,
    createdAt: options.createdAt,
    imageReference: options.imageReference,
  });
  await writeFile(options.outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log("Flowcordia self-host release manifest: CREATED");
  console.log(`Release: ${manifest.releaseId}`);
  console.log(`Version: ${manifest.version}`);
  console.log(`Application: ${manifest.applicationCommitSha}`);
  console.log(`Image: ${manifest.image.reference}`);
  console.log(`Migrations: ${manifest.migrations.count}`);
  console.log(`Manifest: ${manifest.manifestSha256}`);
}

void main().catch(() => {
  console.error("Flowcordia self-host release manifest is blocked or unavailable.");
  process.exitCode = 1;
});
