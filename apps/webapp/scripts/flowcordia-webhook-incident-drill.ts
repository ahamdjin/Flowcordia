import { presentFlowcordiaInstallationPreflight } from "../app/features/flowcordia/operations/installation-preflight";
import {
  FLOWCORDIA_WEBHOOK_INCIDENT_DRILL_CONFIRMATION,
  type FlowcordiaWebhookIncidentDrillProjection,
} from "../app/features/flowcordia/workflows/webhook/incident-drill";

interface Options {
  organizationSlug: string;
  projectParam: string;
  workflowId: string;
  nodeId: string;
  expectedProposalId: string;
  expectedMergeCommitSha: string;
  actorId: string;
  origin: string;
  confirmation: string;
  deliveryTimeoutMilliseconds: number;
  allowGlobalStudio: boolean;
  json: boolean;
}

interface CommandResult {
  schemaVersion: "0.1";
  state: "READY" | "BLOCKED" | "UNAVAILABLE";
  phase: "installation" | "webhook_incident_drill";
  checkedAt: string;
  installation: ReturnType<typeof presentFlowcordiaInstallationPreflight>;
  drill?: FlowcordiaWebhookIncidentDrillProjection;
  message: string;
}

function usage(): never {
  console.error(
    `Usage: pnpm --filter webapp exec tsx scripts/flowcordia-webhook-incident-drill.ts --organization <slug> --project <slug-or-ref> --workflow <workflow-id> --node <node-id> --proposal <proposal-id> --merge-commit <40-char-sha> --actor-id <user-id> --origin <https-origin> --confirm ${FLOWCORDIA_WEBHOOK_INCIDENT_DRILL_CONFIRMATION} [--delivery-timeout-ms <1000-60000>] [--allow-global-studio] [--json]`
  );
  process.exit(2);
}

function parseOptions(args: string[]): Options {
  const values = new Map<string, string>();
  let allowGlobalStudio = false;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--allow-global-studio") {
      allowGlobalStudio = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    const next = args[index + 1];
    if (!argument?.startsWith("--") || !next || next.startsWith("--")) usage();
    if (values.has(argument)) usage();
    values.set(argument, next.trim());
    index += 1;
  }

  const required = [
    "--organization",
    "--project",
    "--workflow",
    "--node",
    "--proposal",
    "--merge-commit",
    "--actor-id",
    "--origin",
    "--confirm",
  ] as const;
  if (required.some((key) => !values.get(key))) usage();
  const allowed = new Set<string>([...required, "--delivery-timeout-ms"]);
  if ([...values.keys()].some((key) => !allowed.has(key))) usage();

  const timeoutSource = values.get("--delivery-timeout-ms") ?? "15000";
  if (!/^[1-9][0-9]{3,4}$/.test(timeoutSource)) usage();
  const deliveryTimeoutMilliseconds = Number(timeoutSource);
  if (
    !Number.isSafeInteger(deliveryTimeoutMilliseconds) ||
    deliveryTimeoutMilliseconds < 1_000 ||
    deliveryTimeoutMilliseconds > 60_000 ||
    values.get("--confirm") !== FLOWCORDIA_WEBHOOK_INCIDENT_DRILL_CONFIRMATION
  ) {
    usage();
  }

  return {
    organizationSlug: values.get("--organization")!,
    projectParam: values.get("--project")!,
    workflowId: values.get("--workflow")!,
    nodeId: values.get("--node")!,
    expectedProposalId: values.get("--proposal")!,
    expectedMergeCommitSha: values.get("--merge-commit")!,
    actorId: values.get("--actor-id")!,
    origin: values.get("--origin")!,
    confirmation: values.get("--confirm")!,
    deliveryTimeoutMilliseconds,
    allowGlobalStudio,
    json,
  };
}

function printResult(result: CommandResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Flowcordia webhook incident drill: ${result.state}`);
  console.log(`Phase: ${result.phase}`);
  console.log(result.message);
  for (const check of result.installation.checks) {
    console.log(`[${check.state}] installation.${check.key}: ${check.message}`);
  }
  for (const check of result.drill?.checks ?? []) {
    console.log(`[${check.state}] webhook.${check.key}: ${check.message}`);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const checkedAt = new Date();
  const installation = presentFlowcordiaInstallationPreflight({
    environment: process.env,
    profile: "release",
    nodeVersion: process.versions.node,
    checkedAt,
    allowGlobalStudio: options.allowGlobalStudio,
  });
  if (installation.state !== "READY") {
    const result: CommandResult = {
      schemaVersion: "0.1",
      state: "BLOCKED",
      phase: "installation",
      checkedAt: checkedAt.toISOString(),
      installation,
      message: "Release configuration is blocked before the webhook incident drill.",
    };
    printResult(result, options.json);
    process.exitCode = 1;
    return;
  }

  const { runConfiguredFlowcordiaWebhookIncidentDrill } = await import(
    "../app/features/flowcordia/workflows/webhook/incident-drill.server"
  );
  const drill = await runConfiguredFlowcordiaWebhookIncidentDrill({
    organizationSlug: options.organizationSlug,
    projectParam: options.projectParam,
    workflowId: options.workflowId,
    nodeId: options.nodeId,
    expectedProposalId: options.expectedProposalId,
    expectedMergeCommitSha: options.expectedMergeCommitSha,
    actorId: options.actorId,
    origin: options.origin,
    confirmation: options.confirmation,
    deliveryTimeoutMilliseconds: options.deliveryTimeoutMilliseconds,
  });
  const result: CommandResult = {
    schemaVersion: "0.1",
    state: drill.state,
    phase: "webhook_incident_drill",
    checkedAt: checkedAt.toISOString(),
    installation,
    drill,
    message: drill.message,
  };
  printResult(result, options.json);
  process.exitCode = drill.state === "READY" ? 0 : 1;
}

void main().catch(() => {
  console.error("Flowcordia webhook incident drill failed safely.");
  process.exitCode = 1;
});
