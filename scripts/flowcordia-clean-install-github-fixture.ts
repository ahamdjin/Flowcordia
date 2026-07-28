import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { App } from "octokit";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function absolute(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required.`);
  const path = resolve(value);
  if (!path.startsWith("/")) throw new Error(`${label} must be absolute.`);
  return path;
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolvePromise();
      reject(new Error(`${command} failed with ${signal ?? `exit code ${code}`}.`));
    });
  });
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      checkout: { type: "string" },
      output: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  const checkout = absolute(values.checkout, "--checkout");
  const output = absolute(values.output, "--output");
  const appId = Number(requiredEnvironment("FLOWCORDIA_ACCEPTANCE_GITHUB_APP_ID"));
  const privateKey = requiredEnvironment("FLOWCORDIA_ACCEPTANCE_GITHUB_PRIVATE_KEY").replace(
    /\\n/g,
    "\n"
  );
  const installationId = Number(
    requiredEnvironment("FLOWCORDIA_ACCEPTANCE_GITHUB_INSTALLATION_ID")
  );
  const repository = requiredEnvironment("FLOWCORDIA_ACCEPTANCE_REFERENCE_REPOSITORY").toLowerCase();
  const branch = requiredEnvironment("FLOWCORDIA_ACCEPTANCE_REFERENCE_BRANCH");
  if (
    !Number.isSafeInteger(appId) ||
    appId < 1 ||
    !Number.isSafeInteger(installationId) ||
    installationId < 1
  ) {
    throw new Error("The GitHub App or installation identity is invalid.");
  }
  const [owner, name] = repository.split("/");
  if (!owner || !name) throw new Error("The reference repository is invalid.");

  const app = new App({ appId, privateKey });
  const appIdentity = await app.octokit.rest.apps.getAuthenticated();
  if (appIdentity.data.id !== appId) throw new Error("GitHub authenticated a different App.");
  const octokit = await app.getInstallationOctokit(installationId);
  const repositoryResponse = await octokit.rest.repos.get({ owner, repo: name });
  if (repositoryResponse.data.full_name.toLowerCase() !== repository) {
    throw new Error("The installation resolved a different repository.");
  }
  const branchResponse = await octokit.rest.repos.getBranch({ owner, repo: name, branch });
  const referenceCommitSha = branchResponse.data.commit.sha;
  if (!/^[0-9a-f]{40}$/.test(referenceCommitSha)) {
    throw new Error("The reference branch did not resolve to an immutable commit.");
  }

  const auth = await octokit.auth({ type: "installation" });
  const token = typeof auth === "object" && auth && "token" in auth ? String(auth.token) : "";
  if (!token) throw new Error("GitHub did not issue an installation token.");

  const privateDirectory = dirname(output);
  const tokenPath = resolve(privateDirectory, "github-installation-token");
  const askpassPath = resolve(privateDirectory, "github-askpass.sh");
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await rm(checkout, { recursive: true, force: true });
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600, flag: "wx" });
  await writeFile(
    askpassPath,
    `#!/bin/sh\ncase "$1" in\n  *Username*) printf '%s\\n' 'x-access-token' ;;\n  *Password*) cat '${tokenPath}' ;;\n  *) exit 1 ;;\nesac\n`,
    { mode: 0o700, flag: "wx" }
  );
  await chmod(askpassPath, 0o700);

  try {
    await run(
      "git",
      [
        "clone",
        "--single-branch",
        "--branch",
        branch,
        "--depth",
        "1",
        `https://github.com/${repository}.git`,
        checkout,
      ],
      {
        ...process.env,
        GIT_ASKPASS: askpassPath,
        GIT_TERMINAL_PROMPT: "0",
      }
    );
    await run("git", ["-C", checkout, "checkout", "--detach", referenceCommitSha], process.env);
  } finally {
    await rm(tokenPath, { force: true });
    await rm(askpassPath, { force: true });
  }

  await writeFile(
    output,
    `${JSON.stringify(
      {
        schemaVersion: "0.1",
        repository,
        branch,
        referenceCommitSha,
        installationId: String(installationId),
        appId: String(appId),
      },
      null,
      2
    )}\n`,
    { mode: 0o600, flag: "wx" }
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "GitHub fixture preparation failed.");
  process.exitCode = 1;
});
