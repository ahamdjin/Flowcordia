import { createHash } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFlowcordiaBetaPromotionRecoveryEvidence,
  type FlowcordiaBetaPromotionRecoveryEvidence,
  type FlowcordiaBetaRecoverySource,
} from "../apps/webapp/app/features/flowcordia/acceptance/beta-promotion-recovery";

const MAX_EVIDENCE_BYTES = 64 * 1024;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  if (value.length > 2_048) throw new Error(`${name} exceeds 2,048 characters.`);
  return value;
}

async function evidenceFile(pathName: string): Promise<{ value: unknown; sha256: string }> {
  const path = resolve(required(pathName));
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_EVIDENCE_BYTES) {
    throw new Error(`${pathName} exceeds 64 KiB.`);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return {
    value: JSON.parse(text) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function source(
  prefix: "LIFECYCLE" | "PRODUCTION" | "ROLLBACK",
  stage: FlowcordiaBetaRecoverySource["stage"],
  evidenceSha256: string
): FlowcordiaBetaRecoverySource {
  return {
    stage,
    runId: required(`FLOWCORDIA_BETA_${prefix}_RUN_ID`),
    runAttempt: Number(required(`FLOWCORDIA_BETA_${prefix}_RUN_ATTEMPT`)),
    workflowPath: required(`FLOWCORDIA_BETA_${prefix}_WORKFLOW_PATH`),
    workflowCommitSha: required(`FLOWCORDIA_BETA_${prefix}_WORKFLOW_COMMIT_SHA`),
    artifactName: required(`FLOWCORDIA_BETA_${prefix}_ARTIFACT_NAME`),
    artifactArchiveSha256: required(`FLOWCORDIA_BETA_${prefix}_ARCHIVE_SHA256`),
    evidenceSha256,
  };
}

export async function assembleFlowcordiaBetaPromotionRecoveryFromEnvironment(): Promise<FlowcordiaBetaPromotionRecoveryEvidence> {
  const lifecycle = await evidenceFile("FLOWCORDIA_BETA_LIFECYCLE_EVIDENCE_PATH");
  const production = await evidenceFile("FLOWCORDIA_BETA_PRODUCTION_EVIDENCE_PATH");
  const rollback = await evidenceFile("FLOWCORDIA_BETA_ROLLBACK_EVIDENCE_PATH");
  const outputPath = resolve(required("FLOWCORDIA_BETA_RECOVERY_OUTPUT_PATH"));

  const evidence = createFlowcordiaBetaPromotionRecoveryEvidence({
    releaseId: required("FLOWCORDIA_BETA_RELEASE_ID"),
    applicationCommitSha: required("FLOWCORDIA_BETA_APPLICATION_COMMIT_SHA"),
    workflowId: required("FLOWCORDIA_BETA_WORKFLOW_ID"),
    lifecycleEvidence: lifecycle.value,
    productionEvidence: production.value,
    rollbackProductionEvidence: rollback.value,
    checkedAt: new Date(required("FLOWCORDIA_BETA_CHECKED_AT")),
    sources: [
      source("LIFECYCLE", "self_host_lifecycle", lifecycle.sha256),
      source("PRODUCTION", "production", production.sha256),
      source("ROLLBACK", "rollback_production", rollback.sha256),
    ],
  });

  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    await link(temporaryPath, outputPath);
  } catch (error) {
    throw new Error("Beta promotion and recovery evidence could not be committed atomically.", {
      cause: error,
    });
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
  return evidence;
}

async function main() {
  const evidence = await assembleFlowcordiaBetaPromotionRecoveryFromEnvironment();
  console.log(`Assembled Beta recovery chain ${evidence.evidenceSha256}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Beta recovery assembly failed.");
    process.exitCode = 1;
  });
}
