import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS } from "../../apps/webapp/app/features/flowcordia/operations/clean-install-onboarding";

type Bootstrap = {
  projectRef: string;
  projectId: string;
  organizationId: string;
  environmentId: string;
  environmentSlug: string;
  environmentApiKey: string;
  personalAccessToken: string;
};

type GitHubFixture = {
  repository: string;
  branch: string;
  referenceCommitSha: string;
  installationId: string;
  appId: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function command(
  executable: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      env: options.env ?? process.env,
      cwd: options.cwd,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolvePromise();
      reject(new Error(`${executable} failed with ${signal ?? `exit code ${code}`}.`));
    });
  });
}

async function mailpitMessages(api: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${api}/api/v1/messages`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Mailpit list returned ${response.status}.`);
  const body = (await response.json()) as unknown;
  if (Array.isArray(body)) return body as Array<Record<string, unknown>>;
  if (body && typeof body === "object") {
    const messages = Reflect.get(body, "messages");
    if (Array.isArray(messages)) return messages as Array<Record<string, unknown>>;
  }
  return [];
}

async function messageFor(api: string, recipient: string): Promise<Record<string, unknown>> {
  let selected: Record<string, unknown> | undefined;
  await expect
    .poll(
      async () => {
        const messages = await mailpitMessages(api);
        selected = messages.find((message) =>
          JSON.stringify(message).toLowerCase().includes(recipient.toLowerCase())
        );
        return Boolean(selected);
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] }
    )
    .toBe(true);
  if (!selected) throw new Error("The expected email was not captured.");
  const id = String(selected.ID ?? selected.Id ?? selected.id ?? "");
  if (!id) return selected;
  const response = await fetch(`${api}/api/v1/message/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Mailpit message returned ${response.status}.`);
  return (await response.json()) as Record<string, unknown>;
}

async function clearMailbox(api: string): Promise<void> {
  const response = await fetch(`${api}/api/v1/messages`, {
    method: "DELETE",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Mailpit deletion returned ${response.status}.`);
  }
}

function extractLocalUrl(message: Record<string, unknown>, baseUrl: string): string {
  const text = JSON.stringify(message).replaceAll("&amp;", "&");
  const matches = text.match(/https?:\\?\/\\?\/[A-Za-z0-9.:_-]+[^\s"'<>\\]*/g) ?? [];
  const normalizedBase = new URL(baseUrl).origin;
  const match = matches
    .map((value) => value.replaceAll("\\/", "/"))
    .find((value) => {
      try {
        return new URL(value).origin === normalizedBase;
      } catch {
        return false;
      }
    });
  if (!match) throw new Error("The captured email does not contain a local Flowcordia link.");
  return match;
}

async function signOut(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/logout`);
  await page.waitForURL(/\/login/);
}

async function createCliBootstrap(input: {
  checkout: string;
  privateDirectory: string;
  applicationNetwork: string;
  helperImage: string;
  config: string;
  secrets: string;
  ownerEmail: string;
  projectName: string;
}): Promise<string> {
  const output = resolve(input.privateDirectory, "cli-bootstrap.json");
  await command("docker", [
    "run",
    "--rm",
    "--network",
    input.applicationNetwork,
    "--env-file",
    input.config,
    "--env-file",
    input.secrets,
    "-e",
    `FLOWCORDIA_ACCEPTANCE_OWNER_EMAIL=${input.ownerEmail}`,
    "-e",
    `FLOWCORDIA_ACCEPTANCE_PROJECT_NAME=${input.projectName}`,
    "-e",
    `HOST_UID=${process.getuid?.() ?? 1000}`,
    "-e",
    `HOST_GID=${process.getgid?.() ?? 1000}`,
    "-v",
    `${input.checkout}:/workspace`,
    "-v",
    `${input.privateDirectory}:/private`,
    "-w",
    "/workspace",
    input.helperImage,
    "sh",
    "-lc",
    'corepack enable >/dev/null && corepack prepare pnpm@10.33.2 --activate >/dev/null && pnpm --filter webapp exec tsx apps/webapp/scripts/flowcordia-clean-install-cli-bootstrap.ts --output /private/cli-bootstrap.json && chown "$HOST_UID:$HOST_GID" /private/cli-bootstrap.json',
  ]);
  return output;
}

async function deployReference(input: {
  checkout: string;
  referenceCheckout: string;
  privateDirectory: string;
  apiUrl: string;
  registryPort: string;
  bootstrap: Bootstrap;
}): Promise<string> {
  const githubOutput = resolve(input.privateDirectory, "deploy-output");
  const githubEnv = resolve(input.privateDirectory, "deploy-env");
  await writeFile(githubOutput, "", { mode: 0o600, flag: "wx" });
  await writeFile(githubEnv, "", { mode: 0o600, flag: "wx" });
  await command(
    "node",
    [
      resolve(input.checkout, "packages/cli-v3/dist/esm/index.js"),
      "deploy",
      input.referenceCheckout,
      "--env",
      "prod",
      "--project-ref",
      input.bootstrap.projectRef,
      "--skip-update-check",
      "--skip-sync-env-vars",
      "--local-build",
      "--push",
      "--plain",
    ],
    {
      cwd: input.checkout,
      env: {
        ...process.env,
        GITHUB_OUTPUT: githubOutput,
        GITHUB_ENV: githubEnv,
        TRIGGER_ACCESS_TOKEN: input.bootstrap.personalAccessToken,
        TRIGGER_API_URL: input.apiUrl,
        TRIGGER_PROJECT_REF: input.bootstrap.projectRef,
        TRIGGER_LOCAL_BUILD_LABEL_DISABLED: "1",
        TRIGGER_DEPLOYMENT_LINK_OUTPUT_DISABLED: "1",
        DEPLOY_REGISTRY_HOST: `127.0.0.1:${input.registryPort}`,
        FLOWCORDIA_DEPLOY_REGISTRY_HOST: `127.0.0.1:${input.registryPort}`,
      },
    }
  );
  const output = await readFile(githubOutput, "utf8");
  const deploymentVersion = output
    .split(/\r?\n/)
    .find((line) => line.startsWith("deploymentVersion="))
    ?.slice("deploymentVersion=".length);
  if (!deploymentVersion || deploymentVersion.length > 256) {
    throw new Error("The real CLI deployment did not return a deployment version.");
  }
  return deploymentVersion;
}

async function acceptInvitation(input: {
  context: BrowserContext;
  baseUrl: string;
  mailpitApi: string;
  email: string;
}): Promise<void> {
  const page = await input.context.newPage();
  await page.goto(`${input.baseUrl}/login/magic`);
  await page.getByPlaceholder("Email Address").fill(input.email);
  await page.getByRole("button", { name: "Send a magic link" }).click();
  await expect(page.getByText("We've sent you a magic link!")).toBeVisible();
  const magicMessage = await messageFor(input.mailpitApi, input.email);
  const magicLink = extractLocalUrl(magicMessage, input.baseUrl);
  await page.goto(magicLink);
  await page.goto(`${input.baseUrl}/invites`);
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page).not.toHaveURL(/\/invites$/);
  await expect(page.getByText(/You joined|Organizations|Projects/i).first()).toBeVisible();
  await input.context.close();
}

test("proves the complete clean-install onboarding journey", async ({ browser }) => {
  const baseUrl = required("FLOWCORDIA_ACCEPTANCE_BASE_URL");
  const apiUrl = required("FLOWCORDIA_ACCEPTANCE_API_URL");
  const output = required("FLOWCORDIA_ACCEPTANCE_OBSERVATIONS_OUTPUT");
  const checkout = required("FLOWCORDIA_ACCEPTANCE_CHECKOUT");
  const referenceCheckout = required("FLOWCORDIA_ACCEPTANCE_REFERENCE_CHECKOUT");
  const privateDirectory = required("FLOWCORDIA_ACCEPTANCE_PRIVATE_DIR");
  const applicationNetwork = required("FLOWCORDIA_ACCEPTANCE_APPLICATION_NETWORK");
  const helperImage = required("FLOWCORDIA_ACCEPTANCE_HELPER_IMAGE");
  const config = required("FLOWCORDIA_ACCEPTANCE_CONFIG_FILE");
  const secrets = required("FLOWCORDIA_ACCEPTANCE_SECRETS_FILE");
  const registryPort = required("FLOWCORDIA_ACCEPTANCE_REGISTRY_PORT");
  const mailpitApi = required("FLOWCORDIA_ACCEPTANCE_MAILPIT_API");
  const workspaceId = required("FLOWCORDIA_ACCEPTANCE_WORKSPACE_ID");
  const startedAt = required("FLOWCORDIA_ACCEPTANCE_STARTED_AT");
  const ownerEmail = required("FLOWCORDIA_ACCEPTANCE_OWNER_EMAIL").toLowerCase();
  const ownerPassword = required("FLOWCORDIA_ACCEPTANCE_OWNER_PASSWORD");
  const setupToken = required("FLOWCORDIA_ACCEPTANCE_SETUP_TOKEN");
  const secondEmail = required("FLOWCORDIA_ACCEPTANCE_SECOND_USER_EMAIL").toLowerCase();
  const appId = required("FLOWCORDIA_ACCEPTANCE_GITHUB_APP_ID");
  const appSlug = required("FLOWCORDIA_ACCEPTANCE_GITHUB_APP_SLUG");
  const privateKey = required("FLOWCORDIA_ACCEPTANCE_GITHUB_PRIVATE_KEY").replace(/\\n/g, "\n");
  const webhookSecret = required("FLOWCORDIA_ACCEPTANCE_GITHUB_WEBHOOK_SECRET");
  const installationId = required("FLOWCORDIA_ACCEPTANCE_GITHUB_INSTALLATION_ID");
  const fixture = JSON.parse(
    await readFile(required("FLOWCORDIA_ACCEPTANCE_GITHUB_FIXTURE"), "utf8")
  ) as GitHubFixture;
  const release = JSON.parse(
    await readFile(required("FLOWCORDIA_ACCEPTANCE_RELEASE_IDENTITY"), "utf8")
  ) as {
    releaseId: string;
    version: string;
    applicationCommitSha: string;
    imageDigest: string;
    manifestSha256: string;
    publicationEvidenceSha256: string;
  };

  const organizationName = `Flowcordia Acceptance ${workspaceId}`;
  const organizationSlug = `flowcordia-acceptance-${workspaceId}`;
  const projectName = `Acceptance ${workspaceId}`;
  const projectSlug = `acceptance-${workspaceId}`;
  const journey: Array<{
    key: (typeof FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS)[number];
    state: "READY";
    observedAt: string;
  }> = [];
  const record = (key: (typeof FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS)[number]) => {
    const expected = FLOWCORDIA_CLEAN_INSTALL_ONBOARDING_STEPS[journey.length];
    if (key !== expected) throw new Error(`Unexpected journey step ${key}; expected ${expected}.`);
    journey.push({ key, state: "READY", observedAt: new Date().toISOString() });
  };

  record("clean_install");
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseUrl}/setup/owner`);
  await page.getByLabel("One-time setup token").fill(setupToken);
  await page.getByLabel("Administrator name").fill("Flowcordia Acceptance Owner");
  await page.getByLabel("Administrator email").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(ownerPassword);
  await page.getByLabel("Confirm password").fill(ownerPassword);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await page.waitForURL(/\/setup$/);
  record("owner_created");

  await signOut(page, baseUrl);
  await page.goto(`${baseUrl}/login/password`);
  await page.getByPlaceholder("Email address").fill(ownerEmail);
  await page.getByPlaceholder("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  record("password_login");

  await page.goto(`${baseUrl}/setup?refresh=1`);
  const readiness = page
    .getByRole("heading", { name: "Platform readiness" })
    .locator("xpath=ancestor::section");
  await expect(readiness.getByText("Not configured")).toHaveCount(0);
  await expect(readiness.getByText("Misconfigured")).toHaveCount(0);
  await expect(readiness.getByText("Unreachable")).toHaveCount(0);
  record("platform_ready");

  await page.goto(`${baseUrl}/setup/email`);
  await page.locator("#general-transport").selectOption("smtp");
  await page.locator("#general-from-email").fill("Flowcordia <flowcordia@localhost.invalid>");
  await page.locator("#general-reply-to-email").fill("support@localhost.invalid");
  await page.locator("#general-smtp-host").fill("mailpit");
  await page.locator("#general-smtp-port").fill("1025");
  await page.locator("#general-test-recipient").fill(ownerEmail);
  await page.getByRole("button", { name: "Test and save" }).first().click();
  await expect(page.getByText(/Configured and encrypted by Flowcordia setup/i)).toBeVisible();
  await messageFor(mailpitApi, ownerEmail);
  record("email_configured");

  await page.goto(`${baseUrl}/orgs/new`);
  await page.getByLabel("Organization name *").fill(organizationName);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(new RegExp(`/orgs/${organizationSlug}(?:/|$)`));
  record("organization_created");

  await page.goto(`${baseUrl}/orgs/${organizationSlug}/projects/new`);
  await page.getByLabel(/Project name/).fill(projectName);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(new RegExp(`/projects/${projectSlug}(?:/|$)`));
  record("project_created");

  let externalInstallUrl = "";
  await page.route("https://github.com/**", async (route) => {
    externalInstallUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "GitHub installation redirect captured for protected acceptance.",
    });
  });
  await page.goto(`${baseUrl}/orgs/${organizationSlug}/settings/flowcordia-setup`);
  await page.getByLabel("App ID").fill(appId);
  await page.getByLabel("App slug").fill(appSlug);
  await page.getByLabel("Private key").fill(privateKey);
  await page.getByLabel("Webhook secret").fill(webhookSecret);
  await page.getByRole("button", { name: "Save and install" }).click();
  await expect.poll(() => externalInstallUrl, { timeout: 60_000 }).not.toBe("");
  const state = new URL(externalInstallUrl).searchParams.get("state");
  if (!state) throw new Error("The secure GitHub installation state was not created.");
  record("github_app_configured");

  await page.goto(
    `${baseUrl}/github/callback?setup_action=install&installation_id=${encodeURIComponent(installationId)}&state=${encodeURIComponent(state)}`
  );
  await page.waitForURL(/\/setup\/github/);
  await expect(page.getByText(/installed successfully/i)).toBeVisible();
  record("github_installation_linked");

  const repositoryOption = page
    .locator("#repositoryId option")
    .filter({ hasText: fixture.repository });
  const repositoryId = await repositoryOption.getAttribute("value");
  if (!repositoryId) throw new Error("The real GitHub repository is not selectable.");
  await page.locator("#repositoryId").selectOption(repositoryId);
  await page.locator("#productionBranch").fill(fixture.branch);
  await page.getByRole("button", { name: "Connect and synchronize" }).click();
  await expect(page.getByText("Repository synchronized successfully.")).toBeVisible();
  record("repository_connected");
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole("heading", { name: "GitHub repository is ready" }).isVisible();
      },
      { timeout: 120_000, intervals: [2_000, 5_000] }
    )
    .toBe(true);
  record("workflow_synchronized");

  const bootstrapPath = await createCliBootstrap({
    checkout,
    privateDirectory,
    applicationNetwork,
    helperImage,
    config,
    secrets,
    ownerEmail,
    projectName,
  });
  const bootstrap = JSON.parse(await readFile(bootstrapPath, "utf8")) as Bootstrap;
  const deploymentVersion = await deployReference({
    checkout,
    referenceCheckout,
    privateDirectory,
    apiUrl,
    registryPort,
    bootstrap,
  });
  await page.goto(
    `${baseUrl}/orgs/${organizationSlug}/projects/${projectSlug}/env/${bootstrap.environmentSlug}/deployments?version=${encodeURIComponent(deploymentVersion)}`
  );
  await expect(page.getByText(deploymentVersion, { exact: false }).first()).toBeVisible({
    timeout: 120_000,
  });
  record("deployment_completed");

  await clearMailbox(mailpitApi);
  await page.goto(`${baseUrl}/orgs/${organizationSlug}/invite`);
  await page.locator('input[name="emails"]').first().fill(secondEmail);
  await page.getByRole("button", { name: "Send invitations" }).click();
  await page.waitForURL(new RegExp(`/orgs/${organizationSlug}/settings/team`));
  await messageFor(mailpitApi, secondEmail);
  record("second_user_invited");

  await clearMailbox(mailpitApi);
  await signOut(page, baseUrl);
  await context.close();
  const secondContext = await browser.newContext();
  await acceptInvitation({ context: secondContext, baseUrl, mailpitApi, email: secondEmail });
  record("second_user_signed_in");

  await rm(bootstrapPath, { force: true });
  await writeFile(
    output,
    `${JSON.stringify(
      {
        schemaVersion: "0.1",
        kind: "flowcordia-clean-install-onboarding-observations",
        workspaceId,
        startedAt,
        completedAt: new Date().toISOString(),
        release,
        fixture: {
          githubAppIdSha256: sha256(appId),
          githubInstallationIdSha256: sha256(installationId),
          referenceRepositorySha256: sha256(fixture.repository),
          referenceBranchSha256: sha256(fixture.branch),
          referenceCommitSha: fixture.referenceCommitSha,
          secondUserEmailSha256: sha256(secondEmail),
        },
        deployment: {
          projectRefSha256: sha256(bootstrap.projectRef),
          deploymentVersionSha256: sha256(deploymentVersion),
          sourceCommitSha: fixture.referenceCommitSha,
        },
        journey,
        teardown: {
          containersAbsent: false,
          networksAbsent: false,
          volumesAbsent: false,
          browserStateAbsent: false,
          mailboxAbsent: false,
          temporaryCredentialsAbsent: false,
        },
      },
      null,
      2
    )}\n`,
    { mode: 0o600, flag: "wx" }
  );
});
