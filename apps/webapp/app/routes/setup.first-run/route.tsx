import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { z } from "zod";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { Header1, Header2 } from "~/components/primitives/Headers";
import { Input } from "~/components/primitives/Input";
import { Label } from "~/components/primitives/Label";
import { Paragraph } from "~/components/primitives/Paragraph";
import { TextArea } from "~/components/primitives/TextArea";
import { featuresForRequest } from "~/features.server";
import {
  configureFlowcordiaGitHubApp,
  type FlowcordiaGitHubAppConfigurationInput,
} from "~/features/flowcordia/setup/githubAppConfiguration.server";
import {
  getGitHubOnboardingProjection,
  getSelectableGitHubRepository,
  type GitHubOnboardingProjection,
} from "~/features/flowcordia/setup/githubOnboarding.server";
import {
  getSelfHostFirstRunTarget,
  type SelfHostFirstRunTarget,
} from "~/features/flowcordia/setup/selfHostFirstRun.server";
import { getPlatformReadiness } from "~/features/flowcordia/setup/platformReadiness.server";
import { executeWorkflowStudioCommand } from "~/features/flowcordia/workflows/studio/commands.server";
import { checkGitHubBranchExists } from "~/services/gitHub.server";
import { logger } from "~/services/logger.server";
import { ProjectSettingsService } from "~/services/projectSettings.server";
import { requireUser } from "~/services/session.server";
import { githubAppInstallPath } from "~/utils/pathBuilder";
import { flowcordiaStudioPath } from "~/features/flowcordia/setup/hostedCustomerOnboarding";

export const meta: MetaFunction = () => [{ title: "Set up Flowcordia" }];

const ActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("configure-github-app"),
    appId: z.string(),
    slug: z.string(),
    privateKey: z.string(),
    webhookSecret: z.string(),
  }),
  z.object({
    intent: z.literal("connect-repository"),
    repositoryId: z.string().min(1),
  }),
  z.object({ intent: z.literal("synchronize") }),
]);

type ActionData = {
  status: "error";
  message: string;
  fieldErrors?: Partial<
    Record<keyof FlowcordiaGitHubAppConfigurationInput | "repositoryId", string[]>
  >;
};

async function requireFirstRunTarget(request: Request): Promise<{
  user: Awaited<ReturnType<typeof requireUser>>;
  target: SelfHostFirstRunTarget;
}> {
  if (featuresForRequest(request).isManagedCloud) throw redirect("/");
  const user = await requireUser(request);
  if (!user.admin || user.isImpersonating) throw new Response("Not found", { status: 404 });

  const target = await getSelfHostFirstRunTarget(user.id);
  if (!target) throw redirect("/setup?advanced=1&recovery=workspace");
  return { user, target };
}

function studioPath(target: SelfHostFirstRunTarget): string {
  return flowcordiaStudioPath({
    organizationSlug: target.organization.slug,
    projectSlug: target.project.slug,
    environmentSlug: target.project.productionEnvironmentSlug,
  });
}

async function commandResult(response: Response): Promise<{ ok: boolean; message?: string }> {
  try {
    const value = (await response.json()) as { ok?: unknown; message?: unknown };
    return {
      ok: value.ok === true,
      message: typeof value.message === "string" ? value.message : undefined,
    };
  } catch {
    return { ok: false, message: "Repository synchronization returned an invalid response." };
  }
}

async function synchronizeRepository(input: {
  request: Request;
  target: SelfHostFirstRunTarget;
  userId: string;
}): Promise<{ ok: boolean; message?: string }> {
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
  return commandResult(response);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { target } = await requireFirstRunTarget(request);
  const url = new URL(request.url);
  const readiness = await getPlatformReadiness({
    requestOrigin: url.origin,
    force: url.searchParams.get("refresh") === "1",
  });
  const readinessFailures = readiness.filter((item) => item.state !== "ready");

  if (readinessFailures.length > 0) {
    return typedjson(
      {
        target,
        stage: "readiness" as const,
        readinessFailures,
        onboarding: null,
        githubInstallPath: null,
        studioPath: studioPath(target),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const onboarding = await getGitHubOnboardingProjection({
    organizationId: target.organization.id,
    projectId: target.project.id,
  });

  if (
    onboarding.state === "ready" ||
    onboarding.action === "open_studio" ||
    onboarding.action === "create_workflow"
  ) {
    throw redirect(studioPath(target));
  }

  return typedjson(
    {
      target,
      stage: "github" as const,
      readinessFailures: [],
      onboarding,
      githubInstallPath: githubAppInstallPath(target.organization.slug, "/setup/first-run"),
      studioPath: studioPath(target),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const { user, target } = await requireFirstRunTarget(request);
  const url = new URL(request.url);
  const readiness = await getPlatformReadiness({ requestOrigin: url.origin });
  if (readiness.some((item) => item.state !== "ready")) {
    return typedjson<ActionData>(
      {
        status: "error",
        message: "Resolve the installation issue shown above before connecting GitHub.",
      },
      { status: 409 }
    );
  }

  const parsed = ActionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return typedjson<ActionData>(
      { status: "error", message: "Check the setup details and try again." },
      { status: 400 }
    );
  }

  if (parsed.data.intent === "configure-github-app") {
    const result = await configureFlowcordiaGitHubApp({
      appId: parsed.data.appId,
      slug: parsed.data.slug,
      privateKey: parsed.data.privateKey,
      webhookSecret: parsed.data.webhookSecret,
    });
    if (!result.success) {
      return typedjson<ActionData>(
        {
          status: "error",
          message: result.message,
          fieldErrors: result.fieldErrors,
        },
        { status: 400 }
      );
    }

    throw redirect(githubAppInstallPath(target.organization.slug, "/setup/first-run"));
  }

  if (parsed.data.intent === "synchronize") {
    const result = await synchronizeRepository({ request, target, userId: user.id });
    if (!result.ok) {
      return typedjson<ActionData>(
        {
          status: "error",
          message: result.message ?? "Flowcordia could not synchronize the repository.",
        },
        { status: 409 }
      );
    }
    throw redirect("/setup/first-run");
  }

  const repository = await getSelectableGitHubRepository({
    organizationId: target.organization.id,
    repositoryId: parsed.data.repositoryId,
  });
  if (!repository) {
    return typedjson<ActionData>(
      {
        status: "error",
        message: "The selected repository is no longer available to this GitHub installation.",
        fieldErrors: { repositoryId: ["Choose an available repository."] },
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
    repository.defaultBranch
  );
  if (branchResult.isErr()) {
    logger.error("Self-host first-run branch verification failed", { error: branchResult.error });
    return typedjson<ActionData>(
      {
        status: "error",
        message: "Flowcordia could not verify the repository default branch through GitHub.",
      },
      { status: 503 }
    );
  }
  if (!branchResult.value) {
    return typedjson<ActionData>(
      {
        status: "error",
        message: "The repository default branch is not visible to the GitHub App.",
      },
      { status: 409 }
    );
  }

  const settings = new ProjectSettingsService();
  const connected = await settings.connectGitHubRepo(
    target.project.id,
    target.organization.id,
    repository.id,
    repository.installation.id
  );
  if (connected.isErr()) {
    return typedjson<ActionData>(
      {
        status: "error",
        message:
          connected.error.type === "project_already_has_connected_repository"
            ? "A repository is already connected. Flowcordia will continue from its current state."
            : "Flowcordia could not connect the selected repository.",
      },
      { status: 409 }
    );
  }

  const updated = await settings.updateGitSettings(
    target.project.id,
    repository.defaultBranch,
    undefined,
    false
  );
  if (updated.isErr()) {
    await settings.disconnectGitHubRepo(target.project.id);
    return typedjson<ActionData>(
      {
        status: "error",
        message: "The repository was not kept because its default branch could not be saved.",
      },
      { status: 409 }
    );
  }

  const synchronized = await synchronizeRepository({ request, target, userId: user.id });
  if (!synchronized.ok) {
    return typedjson<ActionData>(
      {
        status: "error",
        message:
          synchronized.message ??
          "The repository is connected, but synchronization needs to be retried.",
      },
      { status: 409 }
    );
  }

  throw redirect("/setup/first-run");
}

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-red-300">{messages[0]}</p> : null;
}

function progressSteps(onboarding: GitHubOnboardingProjection) {
  const appReady = onboarding.credentialState === "ready";
  const installationReady =
    appReady && (onboarding.installations.length > 0 || onboarding.connectedRepository !== null);
  const repositoryReady = onboarding.connectedRepository !== null;
  return [
    ["GitHub App", appReady],
    ["GitHub access", installationReady],
    ["Repository", repositoryReady],
    ["Studio", false],
  ] as const;
}

export default function SelfHostFirstRunPage() {
  const data = useTypedLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const onboarding = data.onboarding;
  const isSubmitting = navigation.state === "submitting";
  const shouldPoll =
    onboarding?.state === "synchronization_running" || onboarding?.action === "refresh";

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [revalidator, shouldPoll]);

  const repositories =
    onboarding?.installations.flatMap((installation) =>
      installation.repositories.map((repository) => ({
        ...repository,
        accountHandle: installation.accountHandle,
      }))
    ) ?? [];

  return (
    <main className="min-h-screen bg-background-dimmed px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-2xl border border-grid-bright bg-background-bright p-6 shadow-xl shadow-black/10 md:p-8">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-300">
            First-time setup
          </p>
          <Header1 className="mt-2">Connect Flowcordia to GitHub</Header1>
          <Paragraph variant="base" className="mx-auto mt-3 max-w-xl">
            Your workspace is ready. Connect GitHub, choose a repository, and Flowcordia will
            prepare Studio automatically.
          </Paragraph>
        </div>

        {data.stage === "readiness" ? (
          <>
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-300" />
                <div>
                  <Header2>Installation needs attention</Header2>
                  <Paragraph variant="small" className="mt-2">
                    Healthy services are hidden. Resolve only the items below, then run the
                    automatic check again.
                  </Paragraph>
                </div>
              </div>
            </section>

            <div className="space-y-3">
              {data.readinessFailures.map((item) => (
                <section
                  key={item.id}
                  className="rounded-xl border border-grid-bright bg-background-dimmed p-5 shadow-sm"
                >
                  <p className="font-medium text-text-bright">{item.name}</p>
                  <p className="mt-2 text-sm leading-6 text-text-dimmed">{item.summary}</p>
                  {item.recovery && (
                    <p className="mt-3 rounded border border-grid-dimmed bg-background-dimmed p-3 text-sm text-text-bright">
                      {item.recovery}
                    </p>
                  )}
                </section>
              ))}
            </div>

            <LinkButton
              to="/setup/first-run?refresh=1"
              variant="primary/medium"
              LeadingIcon={ArrowPathIcon}
            >
              Check again
            </LinkButton>
          </>
        ) : onboarding ? (
          <>
            <section className="grid overflow-hidden rounded-xl border border-grid-bright bg-background-dimmed sm:grid-cols-4">
              {progressSteps(onboarding).map(([label, complete], index) => (
                <div
                  key={label}
                  className="border-b border-grid-bright bg-background-dimmed p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
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

            {actionData && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                {actionData.message}
              </div>
            )}

            {onboarding.action === "configure_app" && (
              <section className="rounded-xl border border-grid-bright bg-background-dimmed p-5 shadow-sm">
                <Header2>Connect your GitHub App</Header2>
                <Paragraph variant="small" className="mt-2">
                  Enter the App details once. Flowcordia verifies the identity before storing the
                  credentials encrypted, then sends you directly to GitHub installation.
                </Paragraph>
                <Form method="post" className="mt-5 space-y-5">
                  <input type="hidden" name="intent" value="configure-github-app" />
                  <div className="flex items-start gap-3 rounded border border-grid-bright bg-background-dimmed px-3 py-2.5">
                    <LockClosedIcon className="mt-0.5 size-4 shrink-0 text-text-dimmed" />
                    <p className="text-xs leading-5 text-text-dimmed">
                      Private keys and webhook secrets are never returned to the browser after
                      saving.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="github-app-id">App ID</Label>
                      <Input
                        id="github-app-id"
                        name="appId"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                      />
                      <FieldError messages={actionData?.fieldErrors?.appId} />
                    </div>
                    <div>
                      <Label htmlFor="github-app-slug">App slug</Label>
                      <Input
                        id="github-app-slug"
                        name="slug"
                        autoComplete="off"
                        placeholder="flowcordia"
                        required
                      />
                      <FieldError messages={actionData?.fieldErrors?.slug} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="github-app-private-key">Private key</Label>
                    <TextArea
                      id="github-app-private-key"
                      name="privateKey"
                      rows={8}
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono text-xs"
                      placeholder="-----BEGIN PRIVATE KEY-----"
                      required
                    />
                    <FieldError messages={actionData?.fieldErrors?.privateKey} />
                  </div>
                  <div>
                    <Label htmlFor="github-app-webhook-secret">Webhook secret</Label>
                    <Input
                      id="github-app-webhook-secret"
                      name="webhookSecret"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                    <FieldError messages={actionData?.fieldErrors?.webhookSecret} />
                  </div>
                  <Button type="submit" variant="primary/medium" isLoading={isSubmitting}>
                    Save and install
                  </Button>
                </Form>
              </section>
            )}

            {onboarding.action === "install_app" && data.githubInstallPath && (
              <section className="rounded-xl border border-grid-bright bg-background-dimmed p-5 shadow-sm">
                <Header2>Give Flowcordia repository access</Header2>
                <Paragraph variant="small" className="mt-2">
                  Install the App for your GitHub account or organization. GitHub will return you to
                  this same setup automatically.
                </Paragraph>
                <LinkButton to={data.githubInstallPath} variant="primary/medium" className="mt-5">
                  Install on GitHub
                </LinkButton>
              </section>
            )}

            {onboarding.action === "select_repository" && (
              <section className="rounded-xl border border-grid-bright bg-background-dimmed p-5 shadow-sm">
                <Header2>Choose a repository</Header2>
                <Paragraph variant="small" className="mt-2">
                  Flowcordia uses the repository default branch automatically and starts
                  synchronization immediately.
                </Paragraph>
                <Form method="post" className="mt-5 space-y-4">
                  <input type="hidden" name="intent" value="connect-repository" />
                  <div>
                    <Label htmlFor="repositoryId">Repository</Label>
                    <select
                      id="repositoryId"
                      name="repositoryId"
                      required
                      className="mt-2 h-11 w-full rounded-lg border border-grid-bright bg-background-bright px-3 text-sm text-text-bright focus-custom"
                    >
                      <option value="">Choose a repository</option>
                      {repositories.map((repository) => (
                        <option key={repository.id} value={repository.id}>
                          {repository.fullName} · {repository.accountHandle}
                        </option>
                      ))}
                    </select>
                    <FieldError messages={actionData?.fieldErrors?.repositoryId} />
                  </div>
                  <Button type="submit" variant="primary/medium" isLoading={isSubmitting}>
                    Connect repository
                  </Button>
                </Form>
              </section>
            )}

            {(onboarding.state === "synchronization_running" ||
              onboarding.action === "refresh") && (
              <section className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-5">
                <div className="flex items-start gap-3">
                  <ArrowPathIcon className="mt-0.5 size-5 animate-spin text-indigo-300" />
                  <div>
                    <Header2>Preparing Studio</Header2>
                    <Paragraph variant="small" className="mt-2">
                      Flowcordia is synchronizing the repository. This page continues automatically.
                    </Paragraph>
                  </div>
                </div>
              </section>
            )}

            {onboarding.action === "synchronize" && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
                <Header2>Synchronization needs another attempt</Header2>
                <Paragraph variant="small" className="mt-2">
                  The repository remains connected. Retry the safe synchronization operation.
                </Paragraph>
                <Form method="post" className="mt-5">
                  <input type="hidden" name="intent" value="synchronize" />
                  <Button type="submit" variant="primary/medium" isLoading={isSubmitting}>
                    Retry synchronization
                  </Button>
                </Form>
              </section>
            )}

            {onboarding.action === "manage_installation" && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
                <Header2>GitHub access needs attention</Header2>
                <Paragraph variant="small" className="mt-2">
                  Restore repository access in GitHub, then Flowcordia will continue automatically.
                </Paragraph>
                <a
                  href={`https://github.com/settings/installations/${onboarding.installations[0]?.appInstallationId ?? onboarding.connectedRepository?.appInstallationId ?? ""}`}
                  className="mt-5 inline-flex rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Review GitHub access
                </a>
              </section>
            )}

            {onboarding.action === "update_branch" && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
                <Header2>Repository branch needs attention</Header2>
                <Paragraph variant="small" className="mt-2">
                  The default branch changed after connection. Use advanced setup to repair this
                  unusual state.
                </Paragraph>
                <LinkButton to="/setup/github" variant="secondary/medium" className="mt-5">
                  Open advanced repair
                </LinkButton>
              </section>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
