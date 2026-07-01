import type { MetaFunction } from "@remix-run/react";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { env } from "~/env.server";
import { featuresForRequest } from "~/features.server";

type SetupStatus = {
  name: string;
  status: "configured" | "missing" | "detected" | "not-detected";
  description: string;
};

export const meta: MetaFunction = () => {
  return [{ title: "Flowcordia setup | Trigger.dev" }];
};

function statusLabel(status: SetupStatus["status"]) {
  switch (status) {
    case "configured":
      return "Configured";
    case "missing":
      return "Missing";
    case "detected":
      return "Detected";
    case "not-detected":
      return "Not detected";
  }
}

function statusClassName(status: SetupStatus["status"]) {
  switch (status) {
    case "configured":
    case "detected":
      return "border-green-500/30 bg-green-500/10 text-green-300";
    case "missing":
    case "not-detected":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  }
}

function isGeneralEmailConfigured() {
  if (!env.EMAIL_TRANSPORT || !env.FROM_EMAIL) {
    return false;
  }

  switch (env.EMAIL_TRANSPORT) {
    case "resend":
      return Boolean(env.RESEND_API_KEY);
    case "smtp":
      return Boolean(env.SMTP_HOST && env.SMTP_PORT);
    case "aws-ses":
      return true;
  }
}

function isAlertEmailConfigured() {
  if (!env.ALERT_EMAIL_TRANSPORT || !env.ALERT_FROM_EMAIL) {
    return false;
  }

  switch (env.ALERT_EMAIL_TRANSPORT) {
    case "resend":
      return Boolean(env.ALERT_RESEND_API_KEY);
    case "smtp":
      return Boolean(env.ALERT_SMTP_HOST && env.ALERT_SMTP_PORT);
    case "aws-ses":
      return true;
  }
}

function isObjectStorageConfigured() {
  return Boolean(
    env.OBJECT_STORE_BASE_URL &&
      env.OBJECT_STORE_BUCKET &&
      env.OBJECT_STORE_ACCESS_KEY_ID &&
      env.OBJECT_STORE_SECRET_ACCESS_KEY
  );
}

export const loader = async ({ request }: { request: Request }) => {
  const features = featuresForRequest(request);
  const isSelfHosted = !features.isManagedCloud;

  const statuses: SetupStatus[] = [
    {
      name: "GitHub App",
      status: env.GITHUB_APP_ENABLED === "1" ? "configured" : "missing",
      description: "Required for repository connection flows. This does not confirm push or pull request deployment events yet.",
    },
    {
      name: "General email",
      status: isGeneralEmailConfigured() ? "configured" : "missing",
      description: "Used for product email such as login and invitation flows.",
    },
    {
      name: "Alert email",
      status: isAlertEmailConfigured() ? "configured" : "missing",
      description: "Used for run and deployment alert emails.",
    },
    {
      name: "Object storage",
      status: isObjectStorageConfigured() ? "configured" : "missing",
      description: "Used for large payloads, outputs, and packet storage.",
    },
    {
      name: "Self-host mode",
      status: isSelfHosted ? "detected" : "not-detected",
      description: "Detected from the current request host and cloud environment mode.",
    },
    {
      name: "App URL",
      status: env.APP_ORIGIN ? "configured" : "missing",
      description: "Public application origin used by links, callbacks, and email URLs.",
    },
  ];

  return typedjson({ statuses });
};

export default function FlowcordiaSetupStatusPage() {
  const { statuses } = useTypedLoaderData<typeof loader>();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-text-dimmed">Hidden setup page</p>
        <h1 className="text-3xl font-semibold text-text-bright">Flowcordia setup status</h1>
        <p className="max-w-3xl text-sm text-text-dimmed">
          Read-only self-host setup checks. This page never shows secret values and does not change any configuration.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {statuses.map((item) => (
          <div key={item.name} className="rounded-lg border border-grid-bright bg-background-bright p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-medium text-text-bright">{item.name}</h2>
                <p className="mt-2 text-sm leading-6 text-text-dimmed">{item.description}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClassName(item.status)}`}>
                {statusLabel(item.status)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-grid-bright bg-background-bright p-5 text-sm leading-6 text-text-dimmed">
        Next safe step after this page works: add one test action at a time, starting with email. The settings side menu should stay untouched until the direct route is verified.
      </div>
    </div>
  );
}
