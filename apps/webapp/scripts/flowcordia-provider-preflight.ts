import {
  FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION,
  type FlowcordiaProviderPreflightProjection,
} from "../app/features/flowcordia/operations/provider-preflight";
import { runFlowcordiaProviderPreflight } from "../app/features/flowcordia/operations/provider-preflight.server";
import { presentFlowcordiaInstallationPreflight } from "../app/features/flowcordia/operations/installation-preflight";
import { sendPlainTextEmail } from "../app/services/email.server";
import { verifyObjectStoreConnection } from "../app/v3/objectStore.server";

interface Options {
  emailRecipient: string;
  emailConfirmation: string;
  allowGlobalStudio: boolean;
  json: boolean;
}

interface CommandResult {
  schemaVersion: "0.1";
  state: "READY" | "BLOCKED" | "UNAVAILABLE";
  phase: "installation" | "provider";
  checkedAt: string;
  installation: ReturnType<typeof presentFlowcordiaInstallationPreflight>;
  providers?: FlowcordiaProviderPreflightProjection;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usage(): never {
  console.error(
    `Usage: pnpm --filter webapp exec tsx scripts/flowcordia-provider-preflight.ts --email-recipient <address> --confirm-email-send ${FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION} [--allow-global-studio] [--json]`
  );
  process.exit(2);
}

function parseOptions(args: string[]): Options {
  let emailRecipient = "";
  let emailConfirmation = "";
  let allowGlobalStudio = false;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--email-recipient" && next) {
      emailRecipient = next.trim();
      index += 1;
      continue;
    }
    if (argument === "--confirm-email-send" && next) {
      emailConfirmation = next;
      index += 1;
      continue;
    }
    if (argument === "--allow-global-studio") {
      allowGlobalStudio = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    usage();
  }
  if (
    !EMAIL.test(emailRecipient) ||
    emailRecipient.length > 254 ||
    emailConfirmation !== FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION
  ) {
    usage();
  }
  return { emailRecipient, emailConfirmation, allowGlobalStudio, json };
}

function printResult(result: CommandResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Flowcordia provider readiness: ${result.state}`);
  console.log(`Phase: ${result.phase}`);
  console.log(result.message);
  for (const entry of result.installation.checks) {
    console.log(`[${entry.state}] installation.${entry.key}: ${entry.message}`);
  }
  for (const entry of result.providers?.checks ?? []) {
    console.log(`[${entry.state}] provider.${entry.key}: ${entry.message}`);
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
      message: "Release configuration is blocked before provider verification.",
    };
    printResult(result, options.json);
    process.exitCode = 1;
    return;
  }

  const providers = await runFlowcordiaProviderPreflight({
    environment: process.env,
    checkedAt,
    emailRecipientProvided: true,
    emailConfirmation: options.emailConfirmation,
    dependencies: {
      verifyObjectStore: () => verifyObjectStoreConnection(),
      sendProviderReadinessEmail: () =>
        sendPlainTextEmail({
          to: options.emailRecipient,
          subject: "Flowcordia provider readiness test",
          text:
            "Flowcordia asked the configured product-email provider to accept this fixed readiness message. No secret, payload, output, or customer data is included.",
        }),
    },
  });
  const result: CommandResult = {
    schemaVersion: "0.1",
    state: providers.state,
    phase: "provider",
    checkedAt: checkedAt.toISOString(),
    installation,
    providers,
    message: providers.message,
  };
  printResult(result, options.json);
  process.exitCode = providers.state === "READY" ? 0 : 1;
}

void main().catch(() => {
  console.error("Flowcordia provider readiness failed safely.");
  process.exitCode = 1;
});
