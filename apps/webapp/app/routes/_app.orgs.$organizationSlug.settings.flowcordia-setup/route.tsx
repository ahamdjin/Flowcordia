import { Form, type MetaFunction, useNavigation } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/server-runtime";
import { typedjson, useTypedActionData, useTypedLoaderData } from "remix-typedjson";
import {
  getFlowcordiaSetupStatuses,
  isGeneralEmailPresent,
  type FlowcordiaSetupGroup,
  type FlowcordiaSetupState,
} from "~/features/flowcordia/setup/configuration.server";
import { env } from "~/env.server";
import { featuresForRequest } from "~/features.server";
import { sendPlainTextEmail } from "~/services/email.server";
import { logger } from "~/services/logger.server";
import { requireUser } from "~/services/session.server";

type ActionData = {
  testEmail?: {
    status: "success" | "error";
    message: string;
  };
};

const groups: FlowcordiaSetupGroup[] = ["Delivery", "Communication", "Infrastructure"];

export const meta: MetaFunction = () => [{ title: "Flowcordia setup" }];

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireUser(request);
  const features = featuresForRequest(request);
  const statuses = getFlowcordiaSetupStatuses(env, {
    isSelfHosted: !features.isManagedCloud,
  });

  return typedjson({ statuses });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

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

  if (!isGeneralEmailPresent(env)) {
    return typedjson<ActionData>(
      {
        testEmail: {
          status: "error",
          message: "General email configuration is incomplete.",
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
        "It was requested from the hidden Flowcordia setup page.",
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

export default function FlowcordiaSetupStatusPage() {
  const { statuses } = useTypedLoaderData<typeof loader>();
  const actionData = useTypedActionData<typeof action>();
  const navigation = useNavigation();
  const isSendingEmail =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "send-general-email-test";
  const generalEmailPresent = statuses.some(
    (status) => status.id === "general-email" && status.status === "present"
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-text-dimmed">
          Hidden foundation route
        </p>
        <h1 className="text-3xl font-semibold text-text-bright">Flowcordia connection readiness</h1>
        <p className="max-w-3xl text-sm leading-6 text-text-dimmed">
          These checks report whether required configuration is present. They never return secret
          values and do not claim that an external service is reachable until a dedicated live test
          exists.
        </p>
      </div>

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
              Sends one plain-text message through the existing product-email client. The recipient
              is always the signed-in user.
            </p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="send-general-email-test" />
            <button
              type="submit"
              disabled={isSendingEmail || !generalEmailPresent}
              className="rounded-md border border-grid-bright bg-charcoal-700 px-4 py-2 text-sm font-medium text-text-bright hover:bg-charcoal-650 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingEmail
                ? "Sending..."
                : generalEmailPresent
                  ? "Send test email"
                  : "Configure email first"}
            </button>
          </Form>
        </div>

        {actionData?.testEmail ? (
          <div
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              actionData.testEmail.status === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
            }`}
          >
            {actionData.testEmail.message}
          </div>
        ) : null}
      </section>

      <div className="rounded-lg border border-grid-bright bg-background-bright p-5 text-sm leading-6 text-text-dimmed">
        Next safe connections: alert-email test, object-storage probe, and GitHub App installation
        test. Each must wrap the existing service and receive its own permission, timeout, and
        failure contract before appearing here.
      </div>
    </div>
  );
}
