import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createFlowcordiaPrivateBetaDossier,
  type FlowcordiaPrivateBetaSourceInput,
  type FlowcordiaPrivateBetaSourceStage,
} from "../apps/webapp/app/features/flowcordia/acceptance/private-beta-dossier";

const STAGES: FlowcordiaPrivateBetaSourceStage[] = [
  "launch_dossier",
  "bundled_execution",
  "api_reliability",
  "promotion_recovery",
  "failure_campaign",
  "canvas_manual",
];

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const sourceRoot = resolve(argument("--source-root"));
  const output = resolve(argument("--output"));
  const sources: FlowcordiaPrivateBetaSourceInput[] = [];
  for (const stage of STAGES) {
    const metadata = (await json(join(sourceRoot, stage, "source.json"))) as Omit<
      FlowcordiaPrivateBetaSourceInput,
      "evidence"
    >;
    const evidence = await json(join(sourceRoot, stage, "evidence.json"));
    sources.push({ ...metadata, evidence });
  }
  const dossier = createFlowcordiaPrivateBetaDossier({
    releaseId: argument("--release-id"),
    applicationCommitSha: argument("--application-sha"),
    workflowId: argument("--workflow-id"),
    repository: argument("--repository"),
    assembledAt: argument("--assembled-at"),
    assemblerRunId: argument("--run-id"),
    assemblerRunAttempt: Number(argument("--run-attempt")),
    sources,
  });
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, `${JSON.stringify(dossier, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await chmod(output, 0o600);
  console.log("Flowcordia Private Beta dossier: READY");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Private Beta dossier assembly failed.");
  process.exitCode = 1;
});
