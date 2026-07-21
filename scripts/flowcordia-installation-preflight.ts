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
  let profile: FlowcordiaInstallationProfile | null = null;
  let json = false;
  let allowGlobalStudio = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--profile") {
      const candidate = args[index + 1];
      if (!candidate || !FLOWCORDIA_INSTALLATION_PROFILES.includes(candidate as FlowcordiaInstallationProfile)) {
        usage();
      }
      profile = candidate as FlowcordiaInstallationProfile;
      index += 1;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--allow-global-studio") {
      allowGlobalStudio = true;
      continue;
    }
    usage();
  }

  if (!profile) usage();
  return { profile, json, allowGlobalStudio };
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
