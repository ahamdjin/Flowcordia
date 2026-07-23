import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parseFlowcordiaReleaseDistributionManifest } from "../apps/webapp/app/features/flowcordia/operations/release-distribution";
import { parseFlowcordiaReleaseImageEvidence } from "../apps/webapp/app/features/flowcordia/operations/release-image-evidence";

interface Options {
  manifestPath: string;
  imageEvidencePath: string;
  expectedRepository: string;
  expectedRunId: string;
  expectedApplicationSha: string;
  json: boolean;
}

const REPOSITORY = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9][a-z0-9._-]{0,99}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const SHA = /^[0-9a-f]{40}$/;

function usage(): never {
  console.error(
    "Usage: pnpm flowcordia:self-host:artifact-preflight --manifest <path> --image-evidence <path> --expected-repository <owner/name> --expected-run-id <id> --expected-application-sha <sha> [--json]"
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
  const values: Partial<Options> = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--manifest" && next) values.manifestPath = outsideRepository(next);
    else if (argument === "--image-evidence" && next)
      values.imageEvidencePath = outsideRepository(next);
    else if (argument === "--expected-repository" && next) values.expectedRepository = next;
    else if (argument === "--expected-run-id" && next) values.expectedRunId = next;
    else if (argument === "--expected-application-sha" && next)
      values.expectedApplicationSha = next;
    else if (argument === "--json") {
      values.json = true;
      continue;
    } else usage();
    index += 1;
  }
  if (
    !values.manifestPath ||
    !values.imageEvidencePath ||
    !values.expectedRepository ||
    !REPOSITORY.test(values.expectedRepository) ||
    values.expectedRepository !== values.expectedRepository.toLowerCase() ||
    !values.expectedRunId ||
    !RUN_ID.test(values.expectedRunId) ||
    !values.expectedApplicationSha ||
    !SHA.test(values.expectedApplicationSha) ||
    /^([0-9a-f])\1{39}$/.test(values.expectedApplicationSha)
  ) {
    usage();
  }
  return values as Options;
}

async function boundedJson(path: string, label: string): Promise<unknown> {
  const first = await lstat(path);
  if (first.isSymbolicLink() || !first.isFile() || first.size < 2 || first.size > 1024 * 1024) {
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

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const [manifestValue, imageEvidenceValue] = await Promise.all([
    boundedJson(options.manifestPath, "Release manifest"),
    boundedJson(options.imageEvidencePath, "Release image evidence"),
  ]);
  const manifest = parseFlowcordiaReleaseDistributionManifest(manifestValue);
  const imageEvidence = parseFlowcordiaReleaseImageEvidence(imageEvidenceValue, manifest);
  if (
    imageEvidence.workflow.repository !== options.expectedRepository ||
    imageEvidence.workflow.runId !== options.expectedRunId ||
    manifest.applicationCommitSha !== options.expectedApplicationSha
  ) {
    throw new TypeError("Published release artifacts do not match the expected protected run.");
  }
  const result = {
    schemaVersion: "0.1",
    state: "READY",
    releaseId: manifest.releaseId,
    version: manifest.version,
    applicationCommitSha: manifest.applicationCommitSha,
    imageDigest: manifest.image.digest,
    manifestSha256: manifest.manifestSha256,
    publicationEvidenceSha256: imageEvidence.evidenceSha256,
  } as const;
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log("Flowcordia published release artifacts: READY");
    console.log(`Release: ${result.releaseId}`);
    console.log(`Application: ${result.applicationCommitSha}`);
    console.log(`Image digest: ${result.imageDigest}`);
  }
}

void main().catch(() => {
  console.error("Flowcordia published release artifacts are blocked or unavailable.");
  process.exitCode = 1;
});
