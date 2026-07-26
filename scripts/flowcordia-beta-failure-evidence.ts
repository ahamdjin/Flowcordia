import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createFlowcordiaBetaFailureEvidence,
  type FlowcordiaBetaFailureObservation,
} from "../apps/webapp/app/features/flowcordia/acceptance/beta-failure-contract";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function main() {
  const output = resolve(argument("--output"));
  const evidence = createFlowcordiaBetaFailureEvidence({
    repository: argument("--repository"),
    runId: argument("--run-id"),
    runAttempt: Number(argument("--run-attempt")),
    sourceSha: argument("--source-sha"),
    observation: (await json(argument("--observation"))) as FlowcordiaBetaFailureObservation,
    lifecycle: await json(argument("--lifecycle")),
  });
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await chmod(output, 0o600);
  console.log("Flowcordia Beta failure evidence: READY");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Beta failure evidence failed.");
  process.exitCode = 1;
});
