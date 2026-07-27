import { parseArgs } from "node:util";
import {
  FLOWCORDIA_INSTALLATION_PROFILES,
  presentFlowcordiaInstallationPreflight,
  type FlowcordiaInstallationProfile,
} from "../apps/webapp/app/features/flowcordia/operations/installation-preflight";

interface CliOptions {
  profile: FlowcordiaInstallationProfile;
  json: boolean;
  allowGlobalStudio: boolean;
}

function usage(): never {
  console.error(
    "Usage: pnpm exec tsx scripts/flowcordia-installation-preflight.ts --profile <web|worker|release> [--json] [--allow-global-studio]"
  );
  process.exit(2);
}

function parseOptions(args: string[]): CliOptions {
  const values = (() => {
    try {
      return parseArgs({
        args,
        options: {
          profile: { type: "string" },
          json: { type: "boolean", default: false },
          "allow-global-studio": { type: "boolean", default: false },
        },
        strict: true,
        allowPositionals: false,
      }).values;
    } catch {
      usage();
    }
  })();
  if (
    !values.profile ||
    !FLOWCORDIA_INSTALLATION_PROFILES.includes(values.profile as FlowcordiaInstallationProfile)
  ) {
    usage();
  }
  return {
    profile: values.profile as FlowcordiaInstallationProfile,
    json: values.json,
    allowGlobalStudio: values["allow-global-studio"],
  };
}

const options = parseOptions(process.argv.slice(2));
const projection = presentFlowcordiaInstallationPreflight({
  environment: process.env,
  profile: options.profile,
  nodeVersion: process.versions.node,
  checkedAt: new Date(),
  allowGlobalStudio: options.allowGlobalStudio,
});

if (options.json) {
  console.log(JSON.stringify(projection, null, 2));
} else {
  console.log(`Flowcordia installation preflight: ${projection.state}`);
  console.log(projection.message);
  for (const check of projection.checks) {
    console.log(`[${check.state}] ${check.key}: ${check.message}`);
  }
}

process.exitCode = projection.state === "READY" ? 0 : 1;
