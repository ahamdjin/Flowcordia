import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { z } from "zod";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { Header1, Header2 } from "~/components/primitives/Headers";
import { Input } from "~/components/primitives/Input";
import { Label } from "~/components/primitives/Label";
import { Paragraph } from "~/components/primitives/Paragraph";
import { prisma } from "~/db.server";
import { featuresForRequest } from "~/features.server";
import {
  getGitHubOnboardingProjection,
  getSelectableGitHubRepository,
  type GitHubOnboardingProjection,
  type GitHubOnboardingState,
} from "~/features/flowcordia/setup/githubOnboarding.server";
import { executeFlowcordiaBootstrapCommand } from "~/features/flowcordia/workflows/bootstrap/commands.server";
import { FLOWCORDIA_BOOTSTRAP_CONFIRMATION } from "~/features/flowcordia/workflows/bootstrap/command-contract";
import { executeWorkflowStudioCommand } from "~/features/flowcordia/workflows/studio/commands.server";
import { checkGitHubBranchExists } from "~/services/gitHub.server";
import { logger } from "~/services/logger.server";
import { ProjectSettingsService } from "~/services/projectSettings.server";
import { requireUser } from "~/services/session.server";
import { githubAppInstallPath } from "~/utils/pathBuilder";
import { BranchTrackingConfigSchema } from "~/v3/github";

export const meta: MetaFunction = () => [{ title: "GitHub onboarding | Flowcordia" }];

const ActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("connect-repository"),
    repositoryId: z.string().min(1),
    productionBranch: z.string().trim().min(1).max(255),
  }),
  z.object({
    intent: z.literal("update-production-branch"),
    productionBranch: z.string().trim().min(1).max(255),
  }),
  z.object({ intent: z.literal("synchronize") }),
  z.object({ intent: z.literal("bootstrap-starter") }),
]);

type ActionData = {
  status: "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<"repositoryId" | "productionBranch", string>>;
};

type SetupTarget = {
  organization: { id: string; slug: string; title: string };
  project: { id: string; slug: string; name: string; productionEnvironmentSlug: string };
};

async function requireSetupTarget(request: Request): Promise<{
  user: Awaited<ReturnType<typeof requireUser>>;
  target: SetupTarget;
}> {
  if (featuresForRequest(request).isManagedCloud) throw redirect("/");
  const user = await requireUser(request);
  if (!user.admin || user.isImpersonating) throw new Response("Not found", { status: 404 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id, organization: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: {
      organization: {
        select: {
          id: true,
          slug: true,
          title: true,
          projects: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              slug: true,
              name: true,
              environments: {
                where: { type: "PRODUCTION", archivedAt: null },
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { slug: true },
              },
            },
          },
        },
      },
    },
  });

  const organization = membership?.organization;
  const project = organization?.projects[0];
  if (!organization || !project) throw redirect("/setup");

  return {
    user,
    target: {
      organization: {
        id: organization.id,
        slug: organization.slug,
        title: organization.title,
      },
      project: {
        id: project.id,
        slug: project.slug,
        name: project.name,
        productionEnvironmentSlug: project.environments[0]?.slug ?? "prod",
      },
    },
  };
}

function studioPath(target: SetupTarget): string {
  return `/orgs/${target.organization.slug}/projects/${target.project.slug}/env/${target.project.productionEnvironmentSlug}/flowcordia/workflows`;
}

function githubConfigurationPath(target: SetupTarget): string {
  return `/orgs/${target.organization.slug}/settings/flowcordia-setup`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { target } = await requireSetupTarget(request);
  const onboarding = await getGitHubOnboardingProjection({
    organizationId: target.organization.id,
    projectId: target.project.id,
  });

  return typedjson(
    {
      target,
      onboarding,
      githubConfigurationPath: githubConfigurationPath(target),
      githubInstallPath: githubAppInstallPath(target.organization.slug, "/setup/github"),
      studioPath: studioPath(target),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function commandResult(response: Response): Promise<{ ok: boolean; message?: string }> {
  try {
    const value = (await response.json()) as { ok?: unknown; message?: unknown };
    return {
      ok: value.ok === true,
      message: typeof value.message === "string" ? value.message : undefined,
    };
  } catch {
    return { ok: false, message: "The onboarding command returned an invalid response." };
  }
}

async function updateProductionBranch(input: {
  settings: ProjectSettingsService;
  projectId: string;
  productionBranch: string;
}) {
  const current = await prisma.connectedGithubRepository.findUnique({
    where: { projectId: input.projectId },
    select: { branchTracking: true, previewDeploymentsEnabled: true },
  });
  const parsed = current ? BranchTrackingConfigSchema.safeParse(current.branchTracking) : null;
  return input.settings.updateGitSettings(
    input.projectId,
    input.productionBranch,
    parsed?.success ? parsed.data.staging.branch : undefined,
    current?.previewDeploymentsEnabled
  );
}

async function synchronizeRepository(input: {
  request: Request;
  target: SetupTarget;
  userId: string;
}): Promise<ActionData> {
  const response = await executeWorkflowStudioCommand({
    context: {
      organizationId: input.target.organization.id,
      projectId: input.target.project.id,
      projectFound: true,
    },
    request: new Request(input.request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "synchronize" }),
    }),
    userId: input.userId,
  });
  const result = await commandResult(response);
  return result.ok
    ? { status: "success", message: "Repository synchronized successfully." }
    : {
        status: "error",
        message: result.message ?? "Repository synchronization failed safely.",
      };
}

export async function action({ request }: ActionFunctionArgs) {
  const { user, target } = await requireSetupTarget(request);
  const formData = await request.formData();
  const parsed = ActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return typedjson<ActionData>(
      {
        status: "error",
        message: "Check the repository onboarding fields and try again.",
        fieldErrors: {
          repositoryId: fields.repositoryId?.[0],
          productionBranch: fields.productionBranch?.[0],
        },
      },
      { status: 400 }
    );
  }

  const settings = new ProjectSettingsService();

  if (parsed.data.intent === "connect-repository") {
    const repository = await getSelectableGitHubRepository({
      organizationId: target.organization.id,
      repositoryId: parsed.data.repositoryId,
    });
    if (!repository) {
      return typedjson<ActionData>(
        {
          status: "error",
          message: "The selected repository is no longer available to this GitHub installation.",
          fieldErrors: {
            repositoryId: "Choose a repository that the active installation can access.",
          },
        },
        { status: 409 }
      );
    }

    const appInstallationId = Number(repository.installation.appInstallationId);
    if (!Number.isSafeInteger(appInstallationId) || appInstallationId <= 0) {
      return typedjson<ActionData>(
        { status: "error", message: "The GitHub installation identity is invalid." },
        { status: 409 }
      );
    }

    const branchResult = await checkGitHubBranchExists(
      appInstallationId,
      repository.fullName,
      parsed.data.productionBranch
    );
    if (branchResult.isErr()) {
      logger.error("GitHub onboarding branch verification failed", { error: branchResult.error });
      return typedjson<ActionData>(
        {
          status: "error",
          message: "Flowcordia could not verify the production branch through GitHub.",
          fieldErrors: { productionBranch: "Check GitHub availability and App permissions." },
        },
        { status: 503 }
      );
    }
    if (!branchResult.value) {
      return typedjson<ActionData>(
        {
          status: "error",
          message: "The production branch does not exist or is not visible to the GitHub App.",
          fieldErrors: {
            productionBranch: "Enter an existing branch from the selected repository.",
          },
        },
        { status: 400 }
      );
    }

    const connected = await settings.connectGitHubRepo(
      target.project.id,
      target.organization.id,
      repository.id,
      repository.installation.id
    );
    if (connected.isErr()) {
      const message =
        connected.error.type === "project_already_has_connected_repository"
          ? "This project already has a connected repository. Refresh the page before continuing."
          : connected.error.type === "gh_repository_not_found"
            ? "The selected repository is no longer available."
            : "Flowcordia could not connect the selected repository.";
      return typedjson<ActionData>({ status: "error", message }, { status: 409 });
    }

    const updated = await updateProductionBranch({
      settings,
      projectId: target.project.id,
      productionBranch: parsed.data.productionBranch,
    });
    if (updated.isErr()) {
      await settings.disconnectGitHubRepo(target.project.id);
      return typedjson<ActionData>(
        {
          status: "error",
          message: "The repository was not kept because the production branch could not be saved.",
          fieldErrors: { productionBranch: "Verify the branch and try again." },
        },
        { status: 409 }
      );
    }

    return typedjson<ActionData>(
      await synchronizeRepository({ request, target, userId: user.id })
    );
  }

  if (parsed.data.intent === "update-production-branch") {
    const updated = await updateProductionBranch({
      settings,
      projectId: target.project.id,
      productionBranch: parsed.data.productionBranch,
    });
    if (updated.isErr()) {
      const message =
        updated.error.type === "production_tracking_branch_not_found"
          ? "The production branch does not exist or is not visible to the GitHub App."
          : "Flowcordia could not update the production branch.";
      return typedjson<ActionData>(
        { status: "error", message, fieldErrors: { productionBranch: message } },
        { status: 409 }
      );
    }
    return typedjson<ActionData>(
      await synchronizeRepository({ request, target, userId: user.id })
    );
  }

  if (parsed.data.intent === "synchronize") {
    return typedjson<ActionData>(
      await synchronizeRepository({ request, target, userId: user.id })
    );
  }

  const response = await executeFlowcordiaBootstrapCommand({
    context: {
      organizationId: target.organization.id,
      projectId: target.project.id,
      projectFound: true,
    },
    request: new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "bootstrap",
        confirmation: FLOWCORDIA_BOOTSTRAP_CONFIRMATION,
        templateId: "manual",
        workflowId: "starter_workflow",
        name: "Starter workflow",
        description: "A governed first workflow created during Flowcordia setup.",
      }),
    }),
    userId: user.id,
  });
  const result = await commandResult(response);
  return typedjson<ActionData>(
    result.ok
      ? {
          status: "success",
          message:
            "Starter workflow proposal created. Review and merge it in Studio, then synchronize the repository.",
        }
      : {
          status: "error",
          message: result.message ?? "Flowcordia could not create the starter workflow proposal.",
        },
    { status: result.ok ? 200 : response.status }
  );
}

function statePresentation(state: GitHubOnboardingState) {
  if (state === "ready") {
    return {
      label: "Ready",
      className: "border-green-500/30 bg-green-500/10 text-green-300",
      Icon: CheckCircleIcon,
    };
  }
  if (state === "synchronization_running") {
    return {
      label: "In progress",
      className: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
      Icon: ArrowPathIcon,
    };
  }
  if (state === "repository_selection_required" || state === "synchronization_required") {
    return {
      label: "Action required",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      Icon: ExclamationTriangleIcon,
    };
  }
  return {
    label: "Blocked",
    className: "border-red-500/30 bg-red-500/10 text-red-200",
    Icon: XCircleIcon,
  };
}

function onboardingSteps(onboarding: GitHubOnboardingProjection) {
  const credentialComplete = onboarding.credentialState === "ready";
  const installationComplete =
    credentialComplete &&
    (onboarding.installations.length > 0 || onboarding.connectedRepository !== null);
  const repositoryComplete = onboarding.connectedRepository !== null;
  const branchComplete = Boolean(onboarding.connectedRepository?.productionBranch);
  const synchronizationComplete = onboarding.readiness?.checks.some(
    (check) => check.id === "workflow-index" && check.state === "PASSED"
  );
  return [
    ["GitHub App", credentialComplete],
    ["Installation", installationComplete],
    ["Repository", repositoryComplete],
    ["Production branch", branchComplete],
    ["Synchronization", synchronizationComplete],
    ["Ready for Studio", onboarding.state === "ready"],
  ] as const;
}

export default function GitHubOnboardingPage() {
  const { target, onboarding, githubConfigurationPath, githubInstallPath, studioPath } =
    useTypedLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const presentation = statePresentation(onboarding.state);
  const firstInstallation = onboarding.installations[0];
  const repositoryOptions = onboarding.installations.flatMap((installation) =>
    installation.repositories.map((repository) => ({
      ...repository,
      accountHandle: installation.accountHandle,
    }))
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-6 md:p-10">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-300">
          Self-host first run
        </p>
        <Header1 className="mt-2">Connect GitHub</Header1>
        <Paragraph variant="base" className="mt-3 max-w-3xl">
          Connect {target.project.name} to one installation-scoped repository and prove the exact
          production branch is synchronized before continuing.
        </Paragraph>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {onboardingSteps(onboarding).map(([label, complete], index) => (
          <div
            key={label}
            className="rounded-lg border border-grid-bright bg-background-bright p-4"
          >
            <div className="flex items-center gap-2">
              {complete ? (
                <CheckCircleIcon className="size-5 text-green-400" />
              ) : (
                <span className="grid size-5 place-items-center rounded-full border border-grid-bright text-xs text-text-dimmed">
                  {index + 1}
                </span>
              )}
              <p className="text-sm font-medium text-text-bright">{label}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-grid-bright bg-background-bright p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-3xl items-start gap-3">
            <presentation.Icon className="mt-0.5 size-5 shrink-0 text-text-dimmed" />
            <div>
              <Header2>{onboarding.title}</Header2>
              <Paragraph variant="small" className="mt-2">
                {onboarding.summary}
              </Paragraph>
              {onboarding.recovery && (
                <div className="mt-3 rounded border border-grid-dimmed bg-background-dimmed p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-dimmed">
                    Recovery
                  </p>
                  <p className="mt-1 text-sm leading-6 text-text-bright">{onboarding.recovery}</p>
                </div>
              )}
            </div>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs ${presentation.className}`}>
            {presentation.label}
          </span>
        </div>
      </section>

      {actionData && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            actionData.status === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {actionData.message}
        </div>
      )}

      {onboarding.action === "select_repository" && (
        <section className="rounded-lg border border-grid-bright bg-background-bright p-5">
          <Header2>Select repository and branch</Header2>
          <Form method="post" className="mt-5 space-y-5">
            <input type="hidden" name="intent" value="connect-repository" />
            <div>
              <Label htmlFor="repositoryId">Repository</Label>
              <select
                id="repositoryId"
                name="repositoryId"
                required
                className="mt-2 w-full rounded border border-grid-bright bg-background-dimmed px-3 py-2 text-sm text-text-bright"
              >
                <option value="">Choose a repository</option>
                {repositoryOptions.map((repository) => (
                  <option key={repository.id} value={repository.id}>
                    {repository.fullName} · {repository.accountHandle}
                  </option>
                ))}
              </select>
              {actionData?.fieldErrors?.repositoryId && (
                <p className="mt-1 text-xs text-red-300">{actionData.fieldErrors.repositoryId}</p>
              )}
            </div>
            <div>
              <Label htmlFor="productionBranch">Production branch</Label>
              <Input
                id="productionBranch"
                name="productionBranch"
                defaultValue={repositoryOptions[0]?.defaultBranch ?? "main"}
                required
                maxLength={255}
                className="mt-2 font-mono"
              />
              {actionData?.fieldErrors?.productionBranch && (
                <p className="mt-1 text-xs text-red-300">
                  {actionData.fieldErrors.productionBranch}
                </p>
              )}
            </div>
            <Button type="submit" variant="primary/medium" isLoading={isSubmitting}>
              Connect and synchronize
            </Button>
          </Form>
        </section>
      )}

      {onboarding.action === "update_branch" && (
        <section className="rounded-lg border border-grid-bright bg-background-bright p-5">
          <Header2>Update production branch</Header2>
          <Form method="post" className="mt-5 space-y-4">
            <input type="hidden" name="intent" value="update-production-branch" />
            <div>
              <Label htmlFor="productionBranch">Production branch</Label>
              <Input
                id="productionBranch"
                name="productionBranch"
                defaultValue={onboarding.connectedRepository?.productionBranch ?? "main"}
                required
                maxLength={255}
                className="mt-2 font-mono"
              />
              {actionData?.fieldErrors?.productionBranch && (
                <p className="mt-1 text-xs text-red-300">
                  {actionData.fieldErrors.productionBranch}
                </p>
              )}
            </div>
            <Button type="submit" variant="primary/medium" isLoading={isSubmitting}>
              Save and synchronize
            </Button>
          </Form>
        </section>
      )}

      <section className="flex flex-wrap gap-3 rounded-lg border border-grid-bright bg-background-bright p-5">
        {onboarding.action === "configure_app" && (
          <LinkButton to={githubConfigurationPath} variant="primary/medium">
            {onboarding.actionLabel}
          </LinkButton>
        )}
        {onboarding.action === "install_app" && (
          <LinkButton to={githubInstallPath} variant="primary/medium">
            {onboarding.actionLabel}
          </LinkButton>
        )}
        {onboarding.action === "manage_installation" && (
          <a
            href={`https://github.com/settings/installations/${firstInstallation?.appInstallationId ?? onboarding.connectedRepository?.appInstallationId ?? ""}`}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {onboarding.actionLabel}
          </a>
        )}
        {onboarding.action === "refresh" && (
          <LinkButton to="/setup/github" variant="primary/medium" LeadingIcon={ArrowPathIcon}>
            {onboarding.actionLabel}
          </LinkButton>
        )}
        {onboarding.action === "synchronize" && (
          <Form method="post">
            <input type="hidden" name="intent" value="synchronize" />
            <Button type="submit" variant="primary/medium" isLoading={isSubmitting}>
              {onboarding.actionLabel}
            </Button>
          </Form>
        )}
        {onboarding.action === "create_workflow" && (
          <>
            <Form method="post">
              <input type="hidden" name="intent" value="bootstrap-starter" />
              <Button type="submit" variant="primary/medium" isLoading={isSubmitting}>
                {onboarding.actionLabel}
              </Button>
            </Form>
            <LinkButton to={studioPath} variant="secondary/medium">
              Import or create in Studio
            </LinkButton>
          </>
        )}
        {onboarding.action === "open_studio" && (
          <LinkButton to={studioPath} variant="primary/medium">
            {onboarding.actionLabel}
          </LinkButton>
        )}
        <LinkButton to="/setup" variant="secondary/medium">
          Back to setup
        </LinkButton>
      </section>

      {onboarding.connectedRepository && (
        <p className="text-xs text-text-dimmed">
          Connected repository: {onboarding.connectedRepository.fullName}
          {onboarding.connectedRepository.productionBranch
            ? ` · ${onboarding.connectedRepository.productionBranch}`
            : ""}
        </p>
      )}
    </main>
  );
}
