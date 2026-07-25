import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createFlowcordiaApiTriggerReliabilityEvidence,
  type FlowcordiaApiTriggerReliabilityObservation,
} from "../apps/webapp/app/features/flowcordia/acceptance/api-trigger-reliability-contract";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

async function main() {
  const output = resolve(argument("--output"));
  const observation = JSON.parse(
    await readFile(resolve(argument("--observation")), "utf8")
  ) as FlowcordiaApiTriggerReliabilityObservation;
  const evidence = createFlowcordiaApiTriggerReliabilityEvidence({
    repository: argument("--repository"),
    applicationCommitSha: argument("--application-sha"),
    runId: argument("--run-id"),
    runAttempt: Number(argument("--run-attempt")),
    observation,
  });
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await chmod(output, 0o600);
  console.log("Flowcordia API trigger reliability evidence: READY");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "API trigger evidence failed.");
  process.exitCode = 1;
});
