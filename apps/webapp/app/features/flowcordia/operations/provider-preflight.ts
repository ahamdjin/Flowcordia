import { OBJECT_STORE_PROTOCOL, resolveObjectStoreConfiguration } from "~/v3/objectStoreConfig.server";

export const FLOWCORDIA_PROVIDER_PREFLIGHT_SCHEMA_VERSION = "0.1" as const;
export const FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION =
  "EXECUTE_EXACT_FLOWCORDIA_PROVIDER_EMAIL_TEST" as const;

export type FlowcordiaProviderState = "READY" | "BLOCKED" | "UNAVAILABLE";
export type FlowcordiaProviderCheckKey =
  | "application_identity"
  | "email_configuration"
  | "object_store_configuration"
  | "email_confirmation"
  | "object_store_access"
  | "email_acceptance";

export interface FlowcordiaProviderCheck {
  key: FlowcordiaProviderCheckKey;
  state: FlowcordiaProviderState;
  message: string;
}

export interface FlowcordiaProviderConfiguration {
  schemaVersion: "0.1";
  state: "READY" | "BLOCKED";
  checkedAt: string;
  applicationCommitSha: string;
  emailTransport: "resend" | "smtp" | "aws-ses" | "unconfigured";
  objectStoreMode: "static_credentials" | "credential_chain" | "unconfigured";
  checks: FlowcordiaProviderCheck[];
  message: string;
}

export interface FlowcordiaProviderPreflightProjection {
  schemaVersion: "0.1";
  state: FlowcordiaProviderState;
  phase: "configuration" | "object_store" | "email" | "complete";
  checkedAt: string;
  applicationCommitSha: string;
  emailTransport: FlowcordiaProviderConfiguration["emailTransport"];
  objectStoreMode: FlowcordiaProviderConfiguration["objectStoreMode"];
  checks: FlowcordiaProviderCheck[];
  message: string;
}

export interface FlowcordiaProviderConfigurationInput {
  environment: NodeJS.ProcessEnv;
  checkedAt: Date;
  emailRecipientProvided: boolean;
  emailConfirmation?: string;
}

const APPLICATION_SHA = /^[0-9a-f]{40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NON_SECRET_PLACEHOLDERS =
  /^(?:change-me|changeme|example|placeholder|replace-me|todo|undefined|null)$/i;

function presentCheck(
  key: FlowcordiaProviderCheckKey,
  ready: boolean,
  readyMessage: string,
  blockedMessage: string
): FlowcordiaProviderCheck {
  return {
    key,
    state: ready ? "READY" : "BLOCKED",
    message: ready ? readyMessage : blockedMessage,
  };
}

function presentValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || NON_SECRET_PLACEHOLDERS.test(normalized)) return undefined;
  return normalized;
}

function validApplicationSha(value: string | undefined): value is string {
  return Boolean(value && APPLICATION_SHA.test(value) && !/^([0-9a-f])\1{39}$/.test(value));
}

function validEmail(value: string | undefined): boolean {
  const normalized = presentValue(value);
  return Boolean(normalized && EMAIL.test(normalized) && normalized.length <= 254);
}

function validHttpUrl(value: string | undefined): boolean {
  const normalized = presentValue(value);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function selectObjectStore(environment: NodeJS.ProcessEnv) {
  return resolveObjectStoreConfiguration(environment, environment.OBJECT_STORE_DEFAULT_PROTOCOL);
}

function emailConfiguration(environment: NodeJS.ProcessEnv): {
  transport: FlowcordiaProviderConfiguration["emailTransport"];
  ready: boolean;
} {
  const transport = presentValue(environment.EMAIL_TRANSPORT);
  const fromReady = validEmail(environment.FROM_EMAIL);
  const replyReady = validEmail(environment.REPLY_TO_EMAIL);
  if (transport === "resend") {
    return {
      transport,
      ready: fromReady && replyReady && Boolean(presentValue(environment.RESEND_API_KEY)),
    };
  }
  if (transport === "smtp") {
    const port = Number(environment.SMTP_PORT);
    const user = presentValue(environment.SMTP_USER);
    const password = presentValue(environment.SMTP_PASSWORD);
    return {
      transport,
      ready:
        fromReady &&
        replyReady &&
        Boolean(presentValue(environment.SMTP_HOST)) &&
        Number.isSafeInteger(port) &&
        port > 0 &&
        port <= 65_535 &&
        Boolean(user) === Boolean(password),
    };
  }
  if (transport === "aws-ses") {
    return { transport, ready: fromReady && replyReady };
  }
  return { transport: "unconfigured", ready: false };
}

export function presentFlowcordiaProviderConfiguration(
  input: FlowcordiaProviderConfigurationInput
): FlowcordiaProviderConfiguration {
  if (Number.isNaN(input.checkedAt.getTime())) {
    throw new TypeError("Flowcordia provider check time is invalid.");
  }
  const applicationCommitSha = input.environment.FLOWCORDIA_APPLICATION_COMMIT_SHA?.trim() ?? "";
  const applicationReady = validApplicationSha(applicationCommitSha);
  const email = emailConfiguration(input.environment);
  const selectedProtocol = presentValue(input.environment.OBJECT_STORE_DEFAULT_PROTOCOL);
  const protocolReady = !selectedProtocol || OBJECT_STORE_PROTOCOL.test(selectedProtocol);
  const store = selectObjectStore(input.environment);
  const hasStaticCredentials = Boolean(store?.accessKeyId && store.secretAccessKey);
  const credentialsPaired = Boolean(store?.accessKeyId) === Boolean(store?.secretAccessKey);
  const objectStoreReady =
    protocolReady &&
    validHttpUrl(store.baseUrl) &&
    credentialsPaired &&
    (hasStaticCredentials || Boolean(store.bucket));
  const objectStoreMode: FlowcordiaProviderConfiguration["objectStoreMode"] = !store?.baseUrl
    ? "unconfigured"
    : hasStaticCredentials
      ? "static_credentials"
      : "credential_chain";
  const emailConfirmationReady =
    input.emailRecipientProvided &&
    input.emailConfirmation === FLOWCORDIA_PROVIDER_EMAIL_CONFIRMATION;

  const checks: FlowcordiaProviderCheck[] = [
    presentCheck(
      "application_identity",
      applicationReady,
      "The deployed application revision is exact and non-placeholder.",
      "The deployed application revision is missing, malformed, or placeholder-backed."
    ),
    presentCheck(
      "email_configuration",
      email.ready,
      "Product email uses an explicit provider with complete sender and provider configuration.",
      "Product email is unconfigured, console-backed, malformed, or missing paired provider settings."
    ),
    presentCheck(
      "object_store_configuration",
      objectStoreReady,
      "Object storage uses a valid endpoint and one complete credential mode.",
      "Object storage is unconfigured, malformed, embeds credentials in its URL, or has incomplete credential settings."
    ),
    presentCheck(
      "email_confirmation",
      emailConfirmationReady,
      "An operator explicitly authorized one fixed provider-readiness email.",
      "A bounded recipient and exact email-send confirmation are required before contacting the email provider."
    ),
  ];
  const state = checks.some((entry) => entry.state === "BLOCKED") ? "BLOCKED" : "READY";
  return {
    schemaVersion: FLOWCORDIA_PROVIDER_PREFLIGHT_SCHEMA_VERSION,
    state,
    checkedAt: input.checkedAt.toISOString(),
    applicationCommitSha,
    emailTransport: email.transport,
    objectStoreMode,
    checks,
    message:
      state === "READY"
        ? "Provider configuration is ready for bounded live verification."
        : "Provider readiness is blocked before any provider request or email send.",
  };
}
