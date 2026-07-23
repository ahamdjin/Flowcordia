import { createHash } from "node:crypto";
import { link, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleFlowcordiaLaunchManifest,
  FLOWCORDIA_WEBHOOK_RELEASE_STAGE,
  type FlowcordiaLaunchEvidenceSource,
  type FlowcordiaLaunchManifest,
} from "../apps/webapp/app/features/flowcordia/acceptance/release-launch-manifest.server";
import {
  FLOWCORDIA_RELEASE_EVIDENCE_STAGES,
  type FlowcordiaReleaseEvidenceStage,
} from "../apps/webapp/app/features/flowcordia/acceptance/release-manifest.server";

const MAX_EVIDENCE_BYTES = 32 * 1024;
const FLOWCORDIA_LAUNCH_EVIDENCE_STAGES = [
  ...FLOWCORDIA_RELEASE_EVIDENCE_STAGES,
  FLOWCORDIA_WEBHOOK_RELEASE_STAGE,
] as const;
type FlowcordiaLaunchEvidenceStage = (typeof FLOWCORDIA_LAUNCH_EVIDENCE_STAGES)[number];

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  if (value.length > 2_048) throw new Error(`${name} exceeds 2,048 characters.`);
  return value;
}

function sourcePrefix(stage: FlowcordiaLaunchEvidenceStage): string {
  return `FLOWCORDIA_RELEASE_${stage.toUpperCase()}`;
}

async function source(
  environment: Record<string, string | undefined>,
  evidenceRoot: string,
  stage: FlowcordiaLaunchEvidenceStage
): Promise<FlowcordiaLaunchEvidenceSource> {
  const root = join(evidenceRoot, stage);
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.length !== 1 || entries[0]?.name !== "evidence.json" || !entries[0].isFile()) {
    throw new Error(`Stage ${stage} must contain exactly one regular evidence.json file.`);
  }

  const bytes = await readFile(join(root, "evidence.json"));
  if (bytes.byteLength > MAX_EVIDENCE_BYTES) {
    throw new Error(`Stage ${stage} evidence exceeds 32 KiB.`);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let evidence: unknown;
  try {
    evidence = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Stage ${stage} evidence must contain valid JSON.`);
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error(`Stage ${stage} evidence must be an object.`);
  }

  const prefix = sourcePrefix(stage);
  return {
    stage,
    runId: required(environment, `${prefix}_RUN_ID`),
    runAttempt: Number(required(environment, `${prefix}_RUN_ATTEMPT`)),
    workflowPath: required(environment, `${prefix}_WORKFLOW_PATH`),
    workflowCommitSha: required(environment, `${prefix}_WORKFLOW_COMMIT_SHA`),
    artifactName: required(environment, `${prefix}_ARTIFACT`),
    artifactArchiveSha256: required(environment, `${prefix}_ARTIFACT_ARCHIVE_SHA256`),
    evidenceSha256: createHash("sha256").update(bytes).digest("hex"),
    evidence: evidence as Record<string, unknown>,
  } as FlowcordiaLaunchEvidenceSource;
}

export async function assembleFlowcordiaReleaseManifestFromEnvironment(
  environment: Record<string, string | undefined>
): Promise<FlowcordiaLaunchManifest> {
  const evidenceRoot = resolve(required(environment, "FLOWCORDIA_RELEASE_EVIDENCE_ROOT"));
  const outputPath = resolve(required(environment, "FLOWCORDIA_RELEASE_OUTPUT_PATH"));
  if (outputPath === evidenceRoot || outputPath.startsWith(`${evidenceRoot}/`)) {
    throw new Error("FLOWCORDIA_RELEASE_OUTPUT_PATH must be outside the evidence input tree.");
  }

  const manifest = assembleFlowcordiaLaunchManifest({
    releaseId: required(environment, "FLOWCORDIA_RELEASE_ID"),
    applicationCommitSha: required(environment, "FLOWCORDIA_RELEASE_APPLICATION_COMMIT_SHA"),
    workflowId: required(environment, "FLOWCORDIA_RELEASE_WORKFLOW_ID"),
    proposalId: required(environment, "FLOWCORDIA_RELEASE_PROPOSAL_ID"),
    assembledAt: required(environment, "FLOWCORDIA_RELEASE_ASSEMBLED_AT"),
    sources: await Promise.all(
      FLOWCORDIA_LAUNCH_EVIDENCE_STAGES.map((stage) => source(environment, evidenceRoot, stage))
    ),
  });

  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    await link(temporaryPath, outputPath);
  } catch (error) {
    throw new Error("The release manifest output could not be committed atomically.", {
      cause: error,
    });
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
  return manifest;
}

async function main() {
  const manifest = await assembleFlowcordiaReleaseManifestFromEnvironment(process.env);
  console.log(`Assembled ${manifest.releaseId} with digest ${manifest.manifestSha256}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Release evidence assembly failed.");
    process.exitCode = 1;
  });
}
