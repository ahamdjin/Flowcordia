export type FlowcordiaSetupGroup = "Delivery" | "Communication" | "Infrastructure";

export type FlowcordiaSetupState = "present" | "missing" | "detected" | "not-detected";

export type FlowcordiaSetupStatus = {
  id:
    | "github-app"
    | "general-email"
    | "alert-email"
    | "object-storage"
    | "self-host-mode"
    | "app-origin";
  group: FlowcordiaSetupGroup;
  name: string;
  status: FlowcordiaSetupState;
  description: string;
};

function read(source: object, key: string): unknown {
  return Reflect.get(source, key);
}

function stringValue(source: object, key: string): string | undefined {
  const value = read(source, key);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function hasValues(source: object, keys: string[]): boolean {
  return keys.every((key) => stringValue(source, key) !== undefined);
}

function isEmailTransportPresent(source: object, alerts: boolean): boolean {
  const prefix = alerts ? "ALERT_" : "";
  const transport = stringValue(source, `${prefix}EMAIL_TRANSPORT`);
  const fromEmail = stringValue(source, `${prefix}FROM_EMAIL`);

  if (!transport || !fromEmail) {
    return false;
  }

  switch (transport) {
    case "resend":
      return Boolean(stringValue(source, `${prefix}RESEND_API_KEY`));
    case "smtp":
      return hasValues(source, [`${prefix}SMTP_HOST`, `${prefix}SMTP_PORT`]);
    case "aws-ses":
      // AWS credentials may be supplied by the standard provider chain or an instance role.
      return true;
    default:
      return false;
  }
}

export function isGeneralEmailPresent(source: object): boolean {
  return isEmailTransportPresent(source, false);
}

export function getFlowcordiaSetupStatuses(
  source: object,
  options: { isSelfHosted: boolean },
): FlowcordiaSetupStatus[] {
  const githubAppPresent =
    stringValue(source, "GITHUB_APP_ENABLED") === "1" &&
    hasValues(source, [
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_APP_WEBHOOK_SECRET",
      "GITHUB_APP_SLUG",
    ]);

  const objectStoragePresent = hasValues(source, [
    "OBJECT_STORE_BASE_URL",
    "OBJECT_STORE_BUCKET",
    "OBJECT_STORE_ACCESS_KEY_ID",
    "OBJECT_STORE_SECRET_ACCESS_KEY",
  ]);

  return [
    {
      id: "github-app",
      group: "Delivery",
      name: "GitHub App",
      status: githubAppPresent ? "present" : "missing",
      description:
        "Provides organization-controlled repository installation and connection. Event-driven deployment is tracked separately.",
    },
    {
      id: "general-email",
      group: "Communication",
      name: "General email",
      status: isEmailTransportPresent(source, false) ? "present" : "missing",
      description: "Sends product email such as sign-in, invitations, and setup verification.",
    },
    {
      id: "alert-email",
      group: "Communication",
      name: "Alert email",
      status: isEmailTransportPresent(source, true) ? "present" : "missing",
      description:
        "Delivers operational run and deployment notifications through the existing alert system.",
    },
    {
      id: "object-storage",
      group: "Infrastructure",
      name: "Object storage",
      status: objectStoragePresent ? "present" : "missing",
      description: "Stores large packets, payloads, and outputs outside normal database rows.",
    },
    {
      id: "self-host-mode",
      group: "Infrastructure",
      name: "Self-host mode",
      status: options.isSelfHosted ? "detected" : "not-detected",
      description: "Indicates whether this request is served by the self-hosted product mode.",
    },
    {
      id: "app-origin",
      group: "Infrastructure",
      name: "Application origin",
      status: stringValue(source, "APP_ORIGIN") ? "present" : "missing",
      description: "Builds public links, callbacks, and email URLs.",
    },
  ];
}
