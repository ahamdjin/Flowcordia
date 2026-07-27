from pathlib import Path


def replace_once(path_string: str, old: str, new: str) -> None:
    path = Path(path_string)
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    path.write_text(text.replace(old, new, 1))


setup_route = "apps/webapp/app/routes/_app.orgs.$organizationSlug.settings.flowcordia-setup/route.tsx"
replace_once(
    setup_route,
    'import { TextArea } from "~/components/primitives/TextArea";\n',
    'import { TextArea } from "~/components/primitives/TextArea";\nimport { prisma } from "~/db.server";\n',
)
replace_once(
    setup_route,
    'import { featuresForRequest } from "~/features.server";\n',
    'import { featuresForRequest } from "~/features.server";\nimport { resolveOrgIdFromSlug } from "~/models/organization.server";\n',
)
replace_once(
    setup_route,
    '''export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  requirePlatformAdmin(user);
  const githubApp = await getFlowcordiaGitHubAppConfigurationStatus();
  const features = featuresForRequest(request);
  const statuses = getFlowcordiaSetupStatuses(env, {
    isSelfHosted: !features.isManagedCloud,
    githubAppConfigured: githubApp !== null,
  });

  return typedjson({
    statuses,
    githubApp,
    githubInstallPath: githubAppInstallPath(organizationSlug(params), setupPath(request)),
  });
};''',
    '''export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  requirePlatformAdmin(user);
  const orgSlug = organizationSlug(params);
  const githubApp = await getFlowcordiaGitHubAppConfigurationStatus();
  const organizationId = await resolveOrgIdFromSlug(orgSlug);
  const githubInstallation =
    githubApp && organizationId
      ? await prisma.githubAppInstallation.findFirst({
          where: {
            organizationId,
            deletedAt: null,
            suspendedAt: null,
          },
          select: { accountHandle: true },
          orderBy: { createdAt: "desc" },
        })
      : null;
  const features = featuresForRequest(request);
  const statuses = getFlowcordiaSetupStatuses(env, {
    isSelfHosted: !features.isManagedCloud,
    githubAppConfigured: githubApp !== null,
  });

  return typedjson({
    statuses,
    githubApp,
    githubInstallation,
    githubInstallPath: githubAppInstallPath(orgSlug, setupPath(request)),
  });
};''',
)
replace_once(
    setup_route,
    '  const { statuses, githubApp, githubInstallPath } = useTypedLoaderData<typeof loader>();',
    '''  const { statuses, githubApp, githubInstallation, githubInstallPath } =
    useTypedLoaderData<typeof loader>();''',
)
replace_once(
    setup_route,
    '''                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-300">
                  Configured
                </span>''',
    '''                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-300">
                  {githubInstallation ? "Installed" : "Configured"}
                </span>''',
)
replace_once(
    setup_route,
    '''                <p className="mt-1 text-xs leading-5 text-text-dimmed">
                  The private key and webhook secret remain encrypted or environment-owned and are
                  not readable from the UI.
                </p>''',
    '''                <p className="mt-1 text-xs leading-5 text-text-dimmed">
                  The private key and webhook secret remain encrypted or environment-owned and are
                  not readable from the UI.
                </p>
                <p className="mt-1 text-xs leading-5 text-text-dimmed">
                  {githubInstallation
                    ? `Installed for ${githubInstallation.accountHandle}. Connect repositories from project GitHub settings.`
                    : "Install the App on GitHub to choose repository access."}
                </p>''',
)
replace_once(
    setup_route,
    '''            <LinkButton variant="primary/medium" to={githubInstallPath} LeadingIcon={GitBranchIcon}>
              Install GitHub App
            </LinkButton>''',
    '''            {!githubInstallation && (
              <LinkButton
                variant="primary/medium"
                to={githubInstallPath}
                LeadingIcon={GitBranchIcon}
              >
                Install GitHub App
              </LinkButton>
            )}''',
)

latest_server = "apps/webapp/app/features/flowcordia/deployments/latest.server.ts"
replace_once(
    latest_server,
    '''export function canRequestFlowcordiaDeployLatest(
  status: FlowcordiaLatestDeploymentProjection
): boolean {
  return ["NOT_DEPLOYED", "OUTDATED", "FAILED"].includes(status.state);
}''',
    '''export function canRequestFlowcordiaDeployLatest(
  status: FlowcordiaLatestDeploymentProjection
): boolean {
  return ["NOT_DEPLOYED", "OUTDATED", "FAILED"].includes(status.state);
}

export function isFlowcordiaExpectedCommitCurrent(
  status: FlowcordiaLatestDeploymentProjection,
  expectedCommitSha: string
): boolean {
  return (
    status.commitSha !== null &&
    status.commitSha.toLowerCase() === expectedCommitSha.toLowerCase()
  );
}''',
)

latest_test = "apps/webapp/app/features/flowcordia/deployments/latest.server.test.ts"
replace_once(
    latest_test,
    'import { deriveFlowcordiaLatestDeploymentProjection } from "./latest.server";',
    '''import {
  deriveFlowcordiaLatestDeploymentProjection,
  isFlowcordiaExpectedCommitCurrent,
} from "./latest.server";''',
)
replace_once(
    latest_test,
    '''  it("marks a newer repository head as outdated without stopping the current deployment", () => {
    const result = deriveFlowcordiaLatestDeploymentProjection({
      ...base,
      exactDeployment: null,
      currentDeployment: { commitSHA: "a".repeat(40), version: "20260726.1", status: "DEPLOYED" },
    });

    expect(result).toMatchObject({
      state: "OUTDATED",
      deployedCommitSha: "a".repeat(40),
      commitSha: base.commitSha,
    });
  });''',
    '''  it("marks a newer repository head as outdated without stopping the current deployment", () => {
    const result = deriveFlowcordiaLatestDeploymentProjection({
      ...base,
      exactDeployment: null,
      currentDeployment: { commitSHA: "a".repeat(40), version: "20260726.1", status: "DEPLOYED" },
    });

    expect(result).toMatchObject({
      state: "OUTDATED",
      deployedCommitSha: "a".repeat(40),
      commitSha: base.commitSha,
    });
  });

  it("rejects a stale commit shown by an older page load", () => {
    const result = deriveFlowcordiaLatestDeploymentProjection({
      ...base,
      exactDeployment: null,
      currentDeployment: null,
    });

    expect(isFlowcordiaExpectedCommitCurrent(result, base.commitSha)).toBe(true);
    expect(isFlowcordiaExpectedCommitCurrent(result, "c".repeat(40))).toBe(false);
    expect(isFlowcordiaExpectedCommitCurrent({ ...result, commitSha: null }, base.commitSha)).toBe(
      false
    );
  });''',
)

action_route = "apps/webapp/app/routes/resources.orgs.$organizationSlug.projects.$projectParam.env.$envParam.deploy-latest.ts"
replace_once(
    action_route,
    '''  canRequestFlowcordiaDeployLatest,
  queryFlowcordiaLatestDeployment,''',
    '''  canRequestFlowcordiaDeployLatest,
  isFlowcordiaExpectedCommitCurrent,
  queryFlowcordiaLatestDeployment,''',
)
replace_once(
    action_route,
    'const DeployLatestCommandSchema = z.object({ intent: z.literal("deploy-latest") }).strict();',
    '''const DeployLatestCommandSchema = z
  .object({
    intent: z.literal("deploy-latest"),
    expectedCommitSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/i, "Expected commit must be a full Git SHA."),
  })
  .strict();''',
)
replace_once(
    action_route,
    '''    if (!canRequestFlowcordiaDeployLatest(latest)) {
      return json({ ok: false as const, message: latest.message }, 409);
    }
    if (!isInitialDeploymentRequestConfigured()) {''',
    '''    if (!canRequestFlowcordiaDeployLatest(latest)) {
      return json({ ok: false as const, message: latest.message }, 409);
    }
    const verifiedCommitSha = latest.commitSha;
    if (
      !verifiedCommitSha ||
      !isFlowcordiaExpectedCommitCurrent(latest, command.data.expectedCommitSha)
    ) {
      return json(
        {
          ok: false as const,
          message:
            "The tracked branch changed since this page loaded. Refresh before deploying the new latest commit.",
        },
        409
      );
    }
    if (!isInitialDeploymentRequestConfigured()) {''',
)
replace_once(
    action_route,
    '        message: "Deployment requested for the latest repository commit.",',
    '        message: `Flowcordia verified ${verifiedCommitSha.slice(0, 7)} and requested a deployment from the tracked branch.`,',
)

deployments_route = "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.deployments/route.tsx"
replace_once(
    deployments_route,
    '''          <input type="hidden" name="intent" value="deploy-latest" />
          <Button''',
    '''          <input type="hidden" name="intent" value="deploy-latest" />
          <input type="hidden" name="expectedCommitSha" value={latest.commitSha ?? ""} />
          <Button''',
)
replace_once(
    deployments_route,
    '{requesting ? "Requesting…" : "Deploy latest"}',
    '{requesting ? "Requesting…" : "Deploy latest commit"}',
)

runbook = "flowcordia/runbooks/github-app-setup-and-deploy-latest.md"
replace_once(
    runbook,
    'After installation, use the existing project GitHub settings to choose one repository. The repository default branch remains the initial production tracking branch. Branch tracking is shown only when it needs operator attention.',
    'After installation, the setup page shows the active GitHub installation instead of offering to install the App again. Use the existing project GitHub settings to choose one repository. The repository default branch remains the initial production tracking branch. Branch tracking is shown only when it needs operator attention.',
)
replace_once(
    runbook,
    '`Deploy latest` is a recovery action for an existing server-side build adapter. It rechecks the repository head and deployment state under deployment-write authorization before requesting the inherited initial-deployment path. It never creates deployment records or promotes a fabricated version.',
    '`Deploy latest commit` is a recovery action for an existing server-side build adapter. The page submits the full commit SHA it displayed, and the server rechecks the tracked branch head and deployment state under deployment-write authorization. If the branch changed after the page loaded, the request fails safely and asks the operator to refresh. The inherited build adapter still owns final branch resolution; Flowcordia never claims an exact-SHA deployment contract that the adapter does not expose, creates deployment records, or promotes a fabricated version.',
)
