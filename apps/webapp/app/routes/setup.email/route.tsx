import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { Header1, Header2 } from "~/components/primitives/Headers";
import { Input } from "~/components/primitives/Input";
import { Label } from "~/components/primitives/Label";
import { Paragraph } from "~/components/primitives/Paragraph";
import { featuresForRequest } from "~/features.server";
import {
  configureAlertEmailToUseGeneral,
  configureEmailChannel,
  getEmailConfigurationStatus,
  removeEmailConfiguration,
  sendActiveEmailTest,
  type ConfigureEmailResult,
  type EmailChannel,
  type EmailConfigurationStatus,
} from "~/features/flowcordia/setup/emailConfiguration.server";
import { requireUser } from "~/services/session.server";

export const meta: MetaFunction = () => [{ title: "Configure email | Flowcordia setup" }];

type ActionData = {
  channel: EmailChannel;
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

async function requireSelfHostAdmin(request: Request) {
  if (featuresForRequest(request).isManagedCloud) {
    throw redirect("/");
  }

  const user = await requireUser(request);
  if (!user.admin || user.isImpersonating) {
    throw new Response("Not found", { status: 404 });
  }
  return user;
}

function emailConfigurationFromFormData(formData: FormData): unknown {
  const transport = formData.get("transport");
  const base = {
    transport,
    fromEmail: formData.get("fromEmail"),
    replyToEmail: formData.get("replyToEmail"),
  };

  switch (transport) {
    case "resend":
      return { ...base, apiKey: formData.get("apiKey") };
    case "smtp":
      return {
        ...base,
        host: formData.get("host"),
        port: formData.get("port"),
        secure: formData.get("secure") === "true",
        user: formData.get("user"),
        password: formData.get("password"),
      };
    case "aws-ses":
      return base;
    default:
      return base;
  }
}

function actionData(channel: EmailChannel, result: ConfigureEmailResult, successMessage: string) {
  return typedjson<ActionData>(
    result.success
      ? { channel, success: true, message: successMessage }
      : {
          channel,
          success: false,
          message: result.message,
          fieldErrors: result.fieldErrors,
        },
    result.success ? undefined : { status: 400 }
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireSelfHostAdmin(request);
  const [general, alert] = await Promise.all([
    getEmailConfigurationStatus("general"),
    getEmailConfigurationStatus("alert"),
  ]);

  return typedjson(
    { general, alert, ownerEmail: user.email },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  await requireSelfHostAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "configure-general":
      return actionData(
        "general",
        await configureEmailChannel({
          channel: "general",
          configuration: emailConfigurationFromFormData(formData),
          testRecipient: formData.get("testRecipient"),
        }),
        "General email was tested and saved."
      );
    case "configure-alert":
      return actionData(
        "alert",
        await configureEmailChannel({
          channel: "alert",
          configuration: emailConfigurationFromFormData(formData),
          testRecipient: formData.get("testRecipient"),
        }),
        "Alert email was tested and saved."
      );
    case "reuse-general":
      return actionData(
        "alert",
        await configureAlertEmailToUseGeneral(),
        "Alert email now reuses the active general email configuration."
      );
    case "test-general":
      return actionData(
        "general",
        await sendActiveEmailTest({
          channel: "general",
          recipient: String(formData.get("testRecipient") ?? ""),
        }),
        "General email test was accepted by the provider."
      );
    case "test-alert":
      return actionData(
        "alert",
        await sendActiveEmailTest({
          channel: "alert",
          recipient: String(formData.get("testRecipient") ?? ""),
        }),
        "Alert email test was accepted by the provider."
      );
    case "remove-general":
      return actionData(
        "general",
        await removeEmailConfiguration("general"),
        "Stored general email configuration was removed."
      );
    case "remove-alert":
      return actionData(
        "alert",
        await removeEmailConfiguration("alert"),
        "Stored alert email configuration was removed."
      );
    default:
      return typedjson<ActionData>(
        {
          channel: "general",
          success: false,
          message: "Unknown email setup action.",
        },
        { status: 400 }
      );
  }
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <p className="mt-1 text-xs text-rose-300">{errors[0]}</p> : null;
}

function StatusSummary({ status }: { status: EmailConfigurationStatus }) {
  const ready = status.state === "configured";
  return (
    <div
      className={`rounded-lg border p-4 ${
        ready
          ? "border-green-500/30 bg-green-500/10"
          : status.state === "misconfigured"
            ? "border-red-500/30 bg-red-500/10"
            : "border-amber-500/30 bg-amber-500/10"
      }`}
    >
      <div className="flex items-start gap-3">
        {ready ? (
          <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-green-400" />
        ) : (
          <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-300" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium capitalize text-text-bright">{status.channel} email</p>
            <span className="rounded-full border border-grid-bright px-2 py-1 text-xs text-text-dimmed">
              {ready
                ? "Configured"
                : status.state === "misconfigured"
                  ? "Misconfigured"
                  : "Not configured"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-text-dimmed">{status.message}</p>
          {ready && (
            <p className="mt-2 text-xs text-text-dimmed">
              {status.transport} · {status.fromEmail}
              {status.mode === "general" ? " · reuses general email" : ""}
              {status.lastTestedAt
                ? ` · tested ${new Date(status.lastTestedAt).toLocaleString()}`
                : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveConfigurationActions({
  channel,
  status,
  ownerEmail,
}: {
  channel: EmailChannel;
  status: EmailConfigurationStatus;
  ownerEmail: string;
}) {
  if (status.state !== "configured") return null;

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <Form method="post" className="rounded border border-grid-bright bg-background-dimmed p-4">
        <input type="hidden" name="intent" value={`test-${channel}`} />
        <Label htmlFor={`${channel}-active-test-recipient`}>Test recipient</Label>
        <Input
          id={`${channel}-active-test-recipient`}
          name="testRecipient"
          type="email"
          defaultValue={ownerEmail}
          required
        />
        <Button type="submit" variant="secondary/medium" className="mt-3">
          Send test
        </Button>
      </Form>
      {!status.managedByEnvironment && (
        <Form method="post" className="rounded border border-grid-bright bg-background-dimmed p-4">
          <input type="hidden" name="intent" value={`remove-${channel}`} />
          <p className="text-sm leading-6 text-text-dimmed">
            Remove only the encrypted Flowcordia-managed value. Environment-owned settings cannot be
            changed here.
          </p>
          <Button type="submit" variant="danger/medium" className="mt-3">
            Remove stored configuration
          </Button>
        </Form>
      )}
    </div>
  );
}

function ProviderConfigurationForm({
  channel,
  ownerEmail,
  actionData,
}: {
  channel: EmailChannel;
  ownerEmail: string;
  actionData?: ActionData;
}) {
  const errors = actionData?.channel === channel ? actionData.fieldErrors : undefined;
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === `configure-${channel}`;

  return (
    <Form method="post" className="mt-4 space-y-5 rounded-lg border border-grid-bright p-5">
      <input type="hidden" name="intent" value={`configure-${channel}`} />
      <div className="flex items-start gap-3 rounded border border-grid-bright bg-background-dimmed p-3">
        <LockClosedIcon className="mt-0.5 size-4 shrink-0 text-text-dimmed" />
        <p className="text-xs leading-5 text-text-dimmed">
          Provider secrets are tested before activation, encrypted in PostgreSQL, and never returned
          to this page. Saving replaces the previous stored configuration for this channel.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor={`${channel}-transport`}>Provider</Label>
          <select
            id={`${channel}-transport`}
            name="transport"
            defaultValue="smtp"
            className="mt-1 w-full rounded border border-grid-bright bg-background-dimmed px-3 py-2 text-sm text-text-bright"
          >
            <option value="smtp">SMTP</option>
            <option value="resend">Resend</option>
            <option value="aws-ses">AWS SES</option>
          </select>
          <FieldError errors={errors?.transport} />
        </div>
        <div>
          <Label htmlFor={`${channel}-from-email`}>From address</Label>
          <Input id={`${channel}-from-email`} name="fromEmail" type="email" required />
          <FieldError errors={errors?.fromEmail} />
        </div>
        <div>
          <Label htmlFor={`${channel}-reply-to-email`}>Reply-to address</Label>
          <Input id={`${channel}-reply-to-email`} name="replyToEmail" type="email" required />
          <FieldError errors={errors?.replyToEmail} />
        </div>
      </div>

      <div className="rounded border border-grid-bright bg-background-dimmed p-4">
        <p className="text-sm font-medium text-text-bright">SMTP fields</p>
        <p className="mt-1 text-xs text-text-dimmed">Required only when SMTP is selected.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor={`${channel}-smtp-host`}>Host</Label>
            <Input id={`${channel}-smtp-host`} name="host" autoComplete="off" />
            <FieldError errors={errors?.host} />
          </div>
          <div>
            <Label htmlFor={`${channel}-smtp-port`}>Port</Label>
            <Input id={`${channel}-smtp-port`} name="port" inputMode="numeric" defaultValue="587" />
            <FieldError errors={errors?.port} />
          </div>
          <div>
            <Label htmlFor={`${channel}-smtp-user`}>Username</Label>
            <Input id={`${channel}-smtp-user`} name="user" autoComplete="off" />
            <FieldError errors={errors?.user} />
          </div>
          <div>
            <Label htmlFor={`${channel}-smtp-password`}>Password</Label>
            <Input
              id={`${channel}-smtp-password`}
              name="password"
              type="password"
              autoComplete="new-password"
            />
            <FieldError errors={errors?.password} />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-text-dimmed">
          <input type="checkbox" name="secure" value="true" />
          Use implicit TLS, normally on port 465
        </label>
      </div>

      <div className="rounded border border-grid-bright bg-background-dimmed p-4">
        <p className="text-sm font-medium text-text-bright">Resend field</p>
        <p className="mt-1 text-xs text-text-dimmed">Required only when Resend is selected.</p>
        <div className="mt-3">
          <Label htmlFor={`${channel}-resend-key`}>API key</Label>
          <Input
            id={`${channel}-resend-key`}
            name="apiKey"
            type="password"
            autoComplete="new-password"
          />
          <FieldError errors={errors?.apiKey} />
        </div>
      </div>

      <div className="rounded border border-grid-bright bg-background-dimmed p-4 text-sm leading-6 text-text-dimmed">
        AWS SES uses the standard AWS credential provider chain or the workload identity attached to
        this installation. No AWS secret is stored by this form.
      </div>

      <div>
        <Label htmlFor={`${channel}-test-recipient`}>Test recipient</Label>
        <Input
          id={`${channel}-test-recipient`}
          name="testRecipient"
          type="email"
          defaultValue={ownerEmail}
          required
        />
        <FieldError errors={errors?.testRecipient} />
      </div>

      <Button type="submit" variant="primary/medium" disabled={submitting}>
        {submitting ? "Testing provider…" : "Test and save"}
      </Button>
    </Form>
  );
}

function ChannelSection({
  channel,
  status,
  ownerEmail,
  actionData,
  generalReady,
}: {
  channel: EmailChannel;
  status: EmailConfigurationStatus;
  ownerEmail: string;
  actionData?: ActionData;
  generalReady: boolean;
}) {
  return (
    <section
      id={`${channel}-email`}
      className="rounded-lg border border-grid-bright bg-background-bright p-5"
    >
      <Header2 className="capitalize">{channel} email</Header2>
      <Paragraph variant="small" className="mt-1">
        {channel === "general"
          ? "Used for sign-in links, invitations, account messages, and setup verification."
          : "Used for run, deployment, approval, and operational notifications."}
      </Paragraph>
      <div className="mt-4">
        <StatusSummary status={status} />
      </div>

      {actionData?.channel === channel && (
        <div
          className={`mt-4 rounded border px-3 py-2 text-sm ${
            actionData.success
              ? "border-green-500/30 bg-green-500/10 text-green-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {actionData.message}
        </div>
      )}

      <ActiveConfigurationActions channel={channel} status={status} ownerEmail={ownerEmail} />

      {channel === "alert" && !status.managedByEnvironment && (
        <Form
          method="post"
          className="mt-4 rounded border border-grid-bright bg-background-dimmed p-4"
        >
          <input type="hidden" name="intent" value="reuse-general" />
          <p className="text-sm font-medium text-text-bright">Reuse general email</p>
          <p className="mt-1 text-sm leading-6 text-text-dimmed">
            Keep one tested provider configuration for both product and operational mail.
          </p>
          <Button
            type="submit"
            variant="secondary/medium"
            className="mt-3"
            disabled={!generalReady}
          >
            Use general email for alerts
          </Button>
          {!generalReady && (
            <p className="mt-2 text-xs text-amber-200">Configure general email first.</p>
          )}
        </Form>
      )}

      {!status.managedByEnvironment && (
        <ProviderConfigurationForm
          channel={channel}
          ownerEmail={ownerEmail}
          actionData={actionData}
        />
      )}
    </section>
  );
}

export default function EmailSetupPage() {
  const { general, alert, ownerEmail } = useTypedLoaderData<typeof loader>();
  const result = useActionData<ActionData>();
  const complete = general.state === "configured";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6 md:p-10">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-300">
          Self-host first run
        </p>
        <Header1 className="mt-2">Configure email</Header1>
        <Paragraph variant="base" className="mt-3 max-w-3xl">
          General email is required for the complete invitation and recovery journey. Alert email
          can use the same provider or a separate tested provider.
        </Paragraph>
      </div>

      <ChannelSection
        channel="general"
        status={general}
        ownerEmail={ownerEmail}
        actionData={result}
        generalReady={complete}
      />
      <ChannelSection
        channel="alert"
        status={alert}
        ownerEmail={ownerEmail}
        actionData={result}
        generalReady={complete}
      />

      <section
        className={`rounded-lg border p-5 ${
          complete ? "border-indigo-500/30 bg-indigo-500/10" : "border-amber-500/30 bg-amber-500/10"
        }`}
      >
        <Header2>{complete ? "Email setup complete" : "General email still required"}</Header2>
        <Paragraph variant="small" className="mt-2">
          {complete
            ? "Return to the installation wizard to create the workspace and continue with GitHub."
            : "Test and save a general email provider before continuing the full clean-install journey."}
        </Paragraph>
        <div className="mt-4">
          <LinkButton to="/setup" variant={complete ? "primary/medium" : "secondary/medium"}>
            Return to setup
          </LinkButton>
        </div>
      </section>
    </main>
  );
}
