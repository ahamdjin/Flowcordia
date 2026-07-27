import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createFlowcordiaReleaseImageEvidence } from "../apps/webapp/app/features/flowcordia/operations/release-image-evidence";

interface Options {
  manifestPath: string;
  repository: string;
  runId: string;
  runAttempt: number;
  attestationId: string;
  createdAt: string;
  outputPath: string;
}

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-release-image-evidence.ts --manifest <outside-repository.json> --repository <owner/name> --run-id <id> --run-attempt <number> --attestation-id <id> --created-at <canonical-rfc3339> --output <outside-repository.json>"
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
    console.error("Flowcordia release image evidence must use JSON paths outside the repository.");
    process.exit(2);
  }
  return location;
}

function parsePositiveInteger(value: string): number {
  if (!/^[1-9][0-9]{0,3}$/.test(value)) usage();
  return Number(value);
}

function parseOptions(args: string[]): Options {
  const values = (() => {
    try {
      return parseArgs({
        args,
        options: {
          manifest: { type: "string" },
          repository: { type: "string" },
          "run-id": { type: "string" },
          "run-attempt": { type: "string" },
          "attestation-id": { type: "string" },
          "created-at": { type: "string" },
          output: { type: "string" },
        },
        strict: true,
        allowPositionals: false,
      }).values;
    } catch {
      usage();
    }
  })();
  if (
    !values.manifest ||
    !values.repository ||
    !values["run-id"] ||
    !values["run-attempt"] ||
    !values["attestation-id"] ||
    !values["created-at"] ||
    !values.output
  ) {
    usage();
  }
  return {
    manifestPath: outsideRepository(values.manifest),
    repository: values.repository,
    runId: values["run-id"],
    runAttempt: parsePositiveInteger(values["run-attempt"]),
    attestationId: values["attestation-id"],
    createdAt: values["created-at"],
    outputPath: outsideRepository(values.output),
  };
}

async function boundedJson(path: string): Promise<unknown> {
  const information = await stat(path);
  if (!information.isFile() || information.size < 2 || information.size > 64 * 1024) {
    throw new TypeError("Release manifest input is invalid.");
  }
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const parent = await stat(dirname(options.outputPath));
  if (!parent.isDirectory()) throw new TypeError("Evidence output directory is invalid.");

  const evidence = createFlowcordiaReleaseImageEvidence({
    releaseManifest: await boundedJson(options.manifestPath),
    repository: options.repository,
    runId: options.runId,
    runAttempt: options.runAttempt,
    attestationId: options.attestationId,
    createdAt: options.createdAt,
  });
  await writeFile(options.outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log("Flowcordia self-host image evidence: PUBLISHED");
  console.log(`Release: ${evidence.releaseId}`);
  console.log(`Application: ${evidence.applicationCommitSha}`);
  console.log(`Image: ${evidence.image.reference}`);
  console.log(`Manifest: ${evidence.releaseManifestSha256}`);
  console.log(`Evidence: ${evidence.evidenceSha256}`);
}

void main().catch(() => {
  console.error("Flowcordia self-host image evidence is blocked or unavailable.");
  process.exitCode = 1;
});
