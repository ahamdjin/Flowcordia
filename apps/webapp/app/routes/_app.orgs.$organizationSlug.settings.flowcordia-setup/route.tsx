import { redirect } from "@remix-run/node";
import { Form, type MetaFunction, useActionData, useNavigation } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/server-runtime";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import { GitBranchIcon, ShieldCheckIcon } from "lucide-react";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { Input } from "~/components/primitives/Input";
import { Label } from "~/components/primitives/Label";
import { TextArea } from "~/components/primitives/TextArea";
import { prisma } from "~/db.server";
import {
  getFlowcordiaSetupStatuses,
  type FlowcordiaSetupGroup,
  type FlowcordiaSetupState,
} from "~/features/flowcordia/setup/configuration.server";
import { getEmailConfigurationStatus } from "~/features/flowcordia/setup/emailConfiguration.server";
import {
  configureFlowcordiaGitHubApp,
  getFlowcordiaGitHubAppConfigurationStatus,
  type FlowcordiaGitHubAppConfigurationInput,
} from "~/features/flowcordia/setup/githubAppConfiguration.server";
import { env } from "~/env.server";
import { featuresForRequest } from "~/features.server";
import { resolveOrgIdFromSlug } from "~/models/organization.server";
import { sendPlainTextEmail } from "~/services/email.server";
import { logger } from "~/services/logger.server";
import { requireUser } from "~/services/session.server";
import { githubAppInstallPath } from "~/utils/pathBuilder";

const groups: FlowcordiaSetupGroup[] = ["Communication", "Infrastructure"];

type SetupFeedback = {
  status: "success" | "error";
  message: string;
};

type ActionData = {
  githubAppSetup?: SetupFeedback & {
    fieldErrors?: Partial<Record<keyof FlowcordiaGitHubAppConfigurationInput, string[]>>;
  };
  testEmail?: SetupFeedback;
};

export const meta: MetaFunction = () => [{ title: "Flowcordia setup" }];

function requirePlatformAdmin(user: Awaited<ReturnType<typeof requireUser>>) {
  if (!user.admin || user.isImpersonating) {
    throw new Response("Not found", { status: 404 });
  }
}

function statusLabel(status: FlowcordiaSetupState) {
  switch (status) {
    case "present":
      return "Present";
    case "missing":
      return "Missing";
    case "detected":
      return "Detected";
    case "not-detected":
      return "Not detected";
  }
}

function statusClassName(status: FlowcordiaSetupState) {
  switch (status) {
    case "present":
    case "detected":
      return "border-green-500/30 bg-green-500/10 text-green-300";
    case "missing":
    case "not-detected":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  }
}

function setupPath(request: Request): string {
  return new URL(request.url).pathname;
}

function organizationSlug(params: LoaderFunctionArgs["params"]): string {
  if (!params.organizationSlug) throw new Response("Not found", { status: 404 });
  return params.organizationSlug;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  requirePlatformAdmin(user);
  const orgSlug = organizationSlug(params);
  const [githubApp, generalEmail, alertEmail] = await Promise.all([
    getFlowcordiaGitHubAppConfigurationStatus(),
    getEmailConfigurationStatus("general"),
    getEmailConfigurationStatus("alert"),
  ]);
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
    generalEmailConfigured: generalEmail.state === "configured",
    alertEmailConfigured: alertEmail.state === "configured",
  });

  return typedjson({
    statuses,
    githubApp,
    githubInstallation,
    githubInstallPath: githubAppInstallPath(orgSlug, setupPath(request)),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const user = await requireUser(request);
  requirePlatformAdmin(user);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "configure-github-app") {
    const result = await configureFlowcordiaGitHubApp({
      appId: formData.get("appId"),
      slug: formData.get("slug"),
      privateKey: formData.get("privateKey"),
      webhookSecret: formData.get("webhookSecret"),
    });
    if (!result.success) {
      return typedjson<ActionData>(
        {
          githubAppSetup: {
            status: "error",
            message: result.message,
            fieldErrors: result.fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    return redirect(githubAppInstallPath(organizationSlug(params), setupPath(request)));
  }

  if (intent !== "send-general-email-test") {
    return typedjson<ActionData>(
      {
        testEmail: {
          status: "error",
          message: "Unknown setup action.",
        },
      },
      { status: 400 }
    );
  }

  const generalEmail = await getEmailConfigurationStatus("general");
  if (generalEmail.state !== "configured") {
    return typedjson<ActionData>(
      {
        testEmail: {
          status: "error",
          message: generalEmail.message,
        },
      },
      { status: 400 }
    );
  }

  try {
    await sendPlainTextEmail({
      to: user.email,
      subject: "Flowcordia email connection test",
      text: [
        "Flowcordia email connection test",
        "",
        "The general email transport accepted this message.",
        "",
        "It was requested from the Flowcordia setup page.",
      ].join("\n"),
    });

    return typedjson<ActionData>({
      testEmail: {
        status: "success",
        message: `Test email sent to ${user.email}.`,
      },
    });
  } catch (error) {
    logger.error("Flowcordia general email test failed", { error });

    return typedjson<ActionData>(
      {
        testEmail: {
          status: "error",
          message: "The email transport rejected the test. Check the server logs for details.",
        },
      },
      { status: 502 }
    );
  }
};

function Feedback({ feedback }: { feedback?: SetupFeedback }) {
  if (!feedback) return null;
  return (
    <div
      className={`rounded border px-3 py-2 text-sm ${
        feedback.status === "success"
          ? "border-green-500/30 bg-green-500/10 text-green-200"
          : "border-rose-500/30 bg-rose-500/10 text-rose-200"
      }`}
    >
      {feedback.message}
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-rose-300">{messages[0]}</p> : null;
}

export default function FlowcordiaSetupStatusPage() {
  const { statuses, githubApp, githubInstallation, githubInstallPath } =
    useTypedLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submittingIntent = navigation.formData?.get("intent");
  const isConfiguringGitHub =
    navigation.state === "submitting" && submittingIntent === "configure-github-app";
  const isSendingEmail =
    navigation.state === "submitting" && submittingIntent === "send-general-email-test";
  const generalEmailPresent = statuses.some(
    (status) => status.id === "general-email" && status.status === "present"
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-text-dimmed">
          Platform setup
        </p>
        <h1 className="text-3xl font-semibold text-text-bright">Flowcordia connections</h1>
        <p className="max-w-3xl text-sm leading-6 text-text-dimmed">
          Configure platform-owned services once. Secret values remain server-side and are never
          returned to this page after submission.
        </p>
      </div>

      <section className="overflow-hidden rounded-lg border border-grid-bright bg-background-bright">
        <div className="flex items-start gap-3 border-b border-grid-bright p-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-grid-bright bg-background-dimmed">
            <GitBranchIcon className="size-4 text-indigo-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-text-bright">GitHub App</h2>
                <p className="mt-1 text-sm leading-6 text-text-dimmed">
                  Gives Flowcordia server-side repository access for installation, proposals, and
                  deployment events.
                </p>
              </div>
              {githubApp && (
                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-300">
                  {githubInstallation ? "Installed" : "Configured"}
                </span>
              )}
            </div>
          </div>
        </div>

        {githubApp ? (
          <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-green-300" />
              <div className="min-w-0">
                <p className="font-medium text-text-bright">{githubApp.slug}</p>
                <p className="mt-1 text-sm leading-6 text-text-dimmed">
                  App ID {githubApp.appId} ·{" "}
                  {githubApp.source === "environment" ? "Server environment" : "Encrypted setup"}
                </p>
                <p className="mt-1 text-xs leading-5 text-text-dimmed">
                  The private key and webhook secret remain encrypted or environment-owned and are
                  not readable from the UI.
                </p>
                <p className="mt-1 text-xs leading-5 text-text-dimmed">
                  {githubInstallation
                    ? `Installed for ${githubInstallation.accountHandle}. Connect repositories from project GitHub settings.`
                    : "Install the App on GitHub to choose repository access."}
                </p>
              </div>
            </div>
            {!githubInstallation && (
              <LinkButton
                variant="primary/medium"
                to={githubInstallPath}
                LeadingIcon={GitBranchIcon}
              >
                Install GitHub App
              </LinkButton>
            )}
          </div>
        ) : (
          <Form method="post" className="space-y-5 p-5">
            <input type="hidden" name="intent" value="configure-github-app" />
            <div className="flex items-start gap-3 rounded border border-grid-bright bg-background-dimmed px-3 py-2.5">
              <LockClosedIcon className="mt-0.5 size-4 shrink-0 text-text-dimmed" />
              <p className="text-xs leading-5 text-text-dimmed">
                Flowcordia authenticates the App before saving. After success, you continue directly
                to GitHub installation. The credentials are never included in a response or log.
              </p>
            </div>
            <Feedback feedback={actionData?.githubAppSetup} />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="github-app-id">App ID</Label>
                <Input
                  id="github-app-id"
                  name="appId"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="123456"
                  required
                />
                <FieldError messages={actionData?.githubAppSetup?.fieldErrors?.appId} />
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
                <FieldError messages={actionData?.githubAppSetup?.fieldErrors?.slug} />
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
              <FieldError messages={actionData?.githubAppSetup?.fieldErrors?.privateKey} />
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
              <FieldError messages={actionData?.githubAppSetup?.fieldErrors?.webhookSecret} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="primary/medium" isLoading={isConfiguringGitHub}>
                Save and install
              </Button>
            </div>
          </Form>
        )}
      </section>

      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-text-dimmed">{group}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {statuses
              .filter((item) => item.group === group)
              .map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-grid-bright bg-background-bright p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-medium text-text-bright">{item.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-text-dimmed">{item.description}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClassName(item.status)}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}

      <section className="rounded-lg border border-grid-bright bg-background-bright p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-medium text-text-bright">General email live test</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-dimmed">
              Sends one plain-text message through the existing general product email transport to
              your signed-in address.
            </p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="send-general-email-test" />
            <Button
              type="submit"
              variant="secondary/medium"
              disabled={!generalEmailPresent || isSendingEmail}
              isLoading={isSendingEmail}
            >
              Send test email
            </Button>
          </Form>
        </div>
        <div className="mt-4">
          <Feedback feedback={actionData?.testEmail} />
        </div>
      </section>
    </div>
  );
}
