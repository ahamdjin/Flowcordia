import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  assembleFlowcordiaCleanInstallOnboardingEvidence,
  parseFlowcordiaCleanInstallOnboardingEvidence,
} from "../apps/webapp/app/features/flowcordia/operations/clean-install-onboarding";

function absolute(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required.`);
  const path = resolve(value);
  if (!path.startsWith("/")) throw new Error(`${label} must be absolute.`);
  return path;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      observations: { type: "string" },
      output: { type: "string" },
      repository: { type: "string" },
      "run-id": { type: "string" },
      "run-attempt": { type: "string" },
      "source-sha": { type: "string" },
      "checked-at": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  const observationsPath = absolute(values.observations, "--observations");
  const outputPath = absolute(values.output, "--output");
  const repository = values.repository;
  const runId = values["run-id"];
  const runAttempt = Number(values["run-attempt"]);
  const sourceCommitSha = values["source-sha"];
  const checkedAt = values["checked-at"] ?? new Date().toISOString();
  if (!repository || !runId || !sourceCommitSha || !Number.isSafeInteger(runAttempt)) {
    throw new Error("The evidence workflow identity is incomplete.");
  }

  const observations = JSON.parse(await readFile(observationsPath, "utf8")) as unknown;
  const evidence = assembleFlowcordiaCleanInstallOnboardingEvidence({
    observations,
    checkedAt,
    repository: repository.toLowerCase(),
    runId,
    runAttempt,
    sourceCommitSha,
  });
  parseFlowcordiaCleanInstallOnboardingEvidence(evidence);
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Clean-install onboarding evidence failed."
  );
  process.exitCode = 1;
});
