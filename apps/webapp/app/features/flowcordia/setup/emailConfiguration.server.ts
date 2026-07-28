import { EmailClient, type MailTransportOptions } from "emails";
import { z } from "zod";
import { env } from "~/env.server";
import { logger } from "~/services/logger.server";
import { getSecretStore, type SecretStore } from "~/services/secrets/secretStore.server";
import { singleton } from "~/utils/singleton";

const GENERAL_EMAIL_KEY = "flowcordia:platform:email:general";
const ALERT_EMAIL_KEY = "flowcordia:platform:email:alert";
const EMAIL_CONFIGURATION_VERSION = "1" as const;
const EMAIL_CACHE_TTL_MS = 10_000;

export type EmailChannel = "general" | "alert";
export type EmailConfigurationSource = "environment" | "encrypted_setup" | "general_email";

const SenderSchema = z
  .string()
  .trim()
  .min(3, "Sender email is required.")
  .max(320, "Sender email is too long.")
  .refine((value) => value.includes("@"), "Sender email must contain an email address.");

const ReplyToSchema = z
  .string()
  .trim()
  .min(3, "Reply-to email is required.")
  .max(320, "Reply-to email is too long.")
  .refine((value) => value.includes("@"), "Reply-to email must contain an email address.");

const BaseConfigurationSchema = z.object({
  fromEmail: SenderSchema,
  replyToEmail: ReplyToSchema,
});

const ResendConfigurationSchema = BaseConfigurationSchema.extend({
  transport: z.literal("resend"),
  apiKey: z.string().trim().min(10, "Resend API key is required.").max(1024),
});

const SmtpConfigurationSchema = BaseConfigurationSchema.extend({
  transport: z.literal("smtp"),
  host: z.string().trim().min(1, "SMTP host is required.").max(253),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.preprocess(
    (value) => value === true || value === "true" || value === "1" || value === "on",
    z.boolean()
  ),
  user: z
    .string()
    .trim()
    .max(512)
    .optional()
    .transform((value) => value || undefined),
  password: z
    .string()
    .max(2048)
    .optional()
    .transform((value) => value || undefined),
}).superRefine((value, context) => {
  if (Boolean(value.user) !== Boolean(value.password)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [value.user ? "password" : "user"],
      message: "SMTP username and password must be provided together.",
    });
  }
});

const AwsSesConfigurationSchema = BaseConfigurationSchema.extend({
  transport: z.literal("aws-ses"),
});

export const FlowcordiaEmailConfigurationInputSchema = z.discriminatedUnion("transport", [
  ResendConfigurationSchema,
  SmtpConfigurationSchema,
  AwsSesConfigurationSchema,
]);

export type FlowcordiaEmailConfigurationInput = z.infer<
  typeof FlowcordiaEmailConfigurationInputSchema
>;

const StoredSeparateEmailConfigurationSchema = z.object({
  version: z.literal(EMAIL_CONFIGURATION_VERSION),
  mode: z.literal("separate"),
  configuration: FlowcordiaEmailConfigurationInputSchema,
  updatedAt: z.string().datetime(),
  lastTestedAt: z.string().datetime(),
});

const StoredGeneralEmailReferenceSchema = z.object({
  version: z.literal(EMAIL_CONFIGURATION_VERSION),
  mode: z.literal("general"),
  updatedAt: z.string().datetime(),
});

const StoredEmailConfigurationSchema = z.union([
  StoredSeparateEmailConfigurationSchema,
  StoredGeneralEmailReferenceSchema,
]);

type StoredEmailConfiguration = z.infer<typeof StoredEmailConfigurationSchema>;

type ResolvedEmailConfiguration = {
  configuration: FlowcordiaEmailConfigurationInput;
  source: EmailConfigurationSource;
  mode: "separate" | "general";
  lastTestedAt: string | null;
};

export type EmailConfigurationStatus = {
  channel: EmailChannel;
  state: "configured" | "not-configured" | "misconfigured";
  source: EmailConfigurationSource | "environment" | null;
  mode: "separate" | "general" | null;
  transport: FlowcordiaEmailConfigurationInput["transport"] | null;
  fromEmail: string | null;
  replyToEmail: string | null;
  lastTestedAt: string | null;
  managedByEnvironment: boolean;
  message: string;
};

export type ConfigureEmailResult =
  | { success: true; status: EmailConfigurationStatus }
  | {
      success: false;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

type EnvironmentResolution =
  | { kind: "absent" }
  | { kind: "invalid"; message: string }
  | { kind: "configured"; configuration: FlowcordiaEmailConfigurationInput };

type CachedResolution = {
  expiresAt: number;
  value: Promise<ResolvedEmailConfiguration | null>;
};

const resolutionCache = singleton(
  "flowcordiaEmailConfigurationCache",
  () => new Map<EmailChannel, CachedResolution>()
);

function store(): SecretStore {
  return getSecretStore("DATABASE");
}

function keyFor(channel: EmailChannel): string {
  return channel === "general" ? GENERAL_EMAIL_KEY : ALERT_EMAIL_KEY;
}

function environmentPrefix(channel: EmailChannel): string {
  return channel === "alert" ? "ALERT_" : "";
}

function environmentValue(source: object, key: string): unknown {
  return Reflect.get(source, key);
}

function optionalString(source: object, key: string): string | undefined {
  const value = environmentValue(source, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function environmentKeys(channel: EmailChannel): string[] {
  const prefix = environmentPrefix(channel);
  return [
    `${prefix}EMAIL_TRANSPORT`,
    `${prefix}FROM_EMAIL`,
    `${prefix}REPLY_TO_EMAIL`,
    `${prefix}RESEND_API_KEY`,
    `${prefix}SMTP_HOST`,
    `${prefix}SMTP_PORT`,
    `${prefix}SMTP_SECURE`,
    `${prefix}SMTP_USER`,
    `${prefix}SMTP_PASSWORD`,
  ];
}

function environmentEmailConfiguration(
  channel: EmailChannel,
  source: object = env
): EnvironmentResolution {
  const prefix = environmentPrefix(channel);
  const hasAnyValue = environmentKeys(channel).some((key) => {
    const value = environmentValue(source, key);
    return value !== undefined && value !== null && String(value).trim().length > 0;
  });
  if (!hasAnyValue) return { kind: "absent" };

  const transport = optionalString(source, `${prefix}EMAIL_TRANSPORT`);
  const fromEmail = optionalString(source, `${prefix}FROM_EMAIL`);
  const replyToEmail = optionalString(source, `${prefix}REPLY_TO_EMAIL`) ?? fromEmail;
  if (!transport || !fromEmail || !replyToEmail) {
    return {
      kind: "invalid",
      message: `${prefix || "General "}email environment variables are incomplete.`,
    };
  }

  let candidate: unknown;
  switch (transport) {
    case "resend":
      candidate = {
        transport,
        fromEmail,
        replyToEmail,
        apiKey: optionalString(source, `${prefix}RESEND_API_KEY`),
      };
      break;
    case "smtp":
      candidate = {
        transport,
        fromEmail,
        replyToEmail,
        host: optionalString(source, `${prefix}SMTP_HOST`),
        port: environmentValue(source, `${prefix}SMTP_PORT`),
        secure: environmentValue(source, `${prefix}SMTP_SECURE`) ?? false,
        user: optionalString(source, `${prefix}SMTP_USER`),
        password: optionalString(source, `${prefix}SMTP_PASSWORD`),
      };
      break;
    case "aws-ses":
      candidate = { transport, fromEmail, replyToEmail };
      break;
    default:
      return {
        kind: "invalid",
        message: `${prefix || "General "}EMAIL_TRANSPORT is unsupported.`,
      };
  }

  const parsed = FlowcordiaEmailConfigurationInputSchema.safeParse(candidate);
  return parsed.success
    ? { kind: "configured", configuration: parsed.data }
    : {
        kind: "invalid",
        message: `${prefix || "General "}email environment variables are incomplete or invalid.`,
      };
}

export function toMailTransportOptions(
  configuration: FlowcordiaEmailConfigurationInput
): MailTransportOptions {
  switch (configuration.transport) {
    case "resend":
      return { type: "resend", config: { apiKey: configuration.apiKey } };
    case "smtp":
      return {
        type: "smtp",
        config: {
          host: configuration.host,
          port: configuration.port,
          secure: configuration.secure,
          ...(configuration.user && configuration.password
            ? { auth: { user: configuration.user, pass: configuration.password } }
            : {}),
        },
      };
    case "aws-ses":
      return { type: "aws-ses" };
  }
}

export function createConfiguredEmailClient(
  configuration: FlowcordiaEmailConfigurationInput
): EmailClient {
  return new EmailClient({
    transport: toMailTransportOptions(configuration),
    imagesBaseUrl: env.APP_ORIGIN,
    from: configuration.fromEmail,
    replyTo: configuration.replyToEmail,
  });
}

async function storedConfiguration(
  channel: EmailChannel
): Promise<StoredEmailConfiguration | null> {
  return (await store().getSecret(StoredEmailConfigurationSchema, keyFor(channel))) ?? null;
}

async function resolveUncached(channel: EmailChannel): Promise<ResolvedEmailConfiguration | null> {
  const environment = environmentEmailConfiguration(channel);
  if (environment.kind === "configured") {
    return {
      configuration: environment.configuration,
      source: "environment",
      mode: "separate",
      lastTestedAt: null,
    };
  }
  if (environment.kind === "invalid") {
    return null;
  }

  const stored = await storedConfiguration(channel);
  if (!stored) return null;
  if (stored.mode === "separate") {
    return {
      configuration: stored.configuration,
      source: "encrypted_setup",
      mode: "separate",
      lastTestedAt: stored.lastTestedAt,
    };
  }

  if (channel !== "alert") return null;
  const general = await resolveEmailConfiguration("general");
  return general
    ? {
        configuration: general.configuration,
        source: "general_email",
        mode: "general",
        lastTestedAt: general.lastTestedAt,
      }
    : null;
}

export async function resolveEmailConfiguration(
  channel: EmailChannel,
  options: { force?: boolean } = {}
): Promise<ResolvedEmailConfiguration | null> {
  const now = Date.now();
  const cached = resolutionCache.get(channel);
  if (!options.force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = resolveUncached(channel).catch((error) => {
    resolutionCache.delete(channel);
    throw error;
  });
  resolutionCache.set(channel, { expiresAt: now + EMAIL_CACHE_TTL_MS, value });
  return value;
}

function clearResolutionCache(): void {
  resolutionCache.clear();
}

function statusFromResolved(
  channel: EmailChannel,
  resolved: ResolvedEmailConfiguration
): EmailConfigurationStatus {
  return {
    channel,
    state: "configured",
    source: resolved.source,
    mode: resolved.mode,
    transport: resolved.configuration.transport,
    fromEmail: resolved.configuration.fromEmail,
    replyToEmail: resolved.configuration.replyToEmail,
    lastTestedAt: resolved.lastTestedAt,
    managedByEnvironment: resolved.source === "environment",
    message:
      resolved.source === "environment"
        ? "Configured by server environment variables."
        : resolved.source === "general_email"
          ? "Alert email reuses the active general email configuration."
          : "Configured and encrypted by Flowcordia setup.",
  };
}

export async function getEmailConfigurationStatus(
  channel: EmailChannel
): Promise<EmailConfigurationStatus> {
  const environment = environmentEmailConfiguration(channel);
  if (environment.kind === "invalid") {
    return {
      channel,
      state: "misconfigured",
      source: "environment",
      mode: "separate",
      transport: null,
      fromEmail: null,
      replyToEmail: null,
      lastTestedAt: null,
      managedByEnvironment: true,
      message: `${environment.message} Correct the environment variables and restart Flowcordia.`,
    };
  }

  const resolved = await resolveEmailConfiguration(channel);
  return resolved
    ? statusFromResolved(channel, resolved)
    : {
        channel,
        state: "not-configured",
        source: null,
        mode: null,
        transport: null,
        fromEmail: null,
        replyToEmail: null,
        lastTestedAt: null,
        managedByEnvironment: false,
        message:
          channel === "general"
            ? "General product email is not configured."
            : "Alert email is not configured.",
      };
}

function validationFieldErrors(error: z.ZodError): Record<string, string[]> {
  const flattened = error.flatten().fieldErrors;
  return Object.fromEntries(
    Object.entries(flattened).filter((entry): entry is [string, string[]] => Boolean(entry[1]))
  );
}

async function sendConfigurationTest(input: {
  channel: EmailChannel;
  configuration: FlowcordiaEmailConfigurationInput;
  recipient: string;
}): Promise<void> {
  const client = createConfiguredEmailClient(input.configuration);
  await client.sendPlainText({
    to: input.recipient,
    subject: `Flowcordia ${input.channel} email test`,
    text: `Flowcordia successfully delivered a ${input.channel} email configuration test.`,
  });
}

export async function configureEmailChannel(input: {
  channel: EmailChannel;
  configuration: unknown;
  testRecipient: unknown;
}): Promise<ConfigureEmailResult> {
  const environment = environmentEmailConfiguration(input.channel);
  if (environment.kind !== "absent") {
    return {
      success: false,
      message: "This email channel is managed by server environment variables.",
    };
  }

  const parsedConfiguration = FlowcordiaEmailConfigurationInputSchema.safeParse(
    input.configuration
  );
  const parsedRecipient = z
    .string()
    .trim()
    .email("Enter a valid test recipient.")
    .safeParse(input.testRecipient);
  if (!parsedConfiguration.success || !parsedRecipient.success) {
    return {
      success: false,
      message: "Check the email provider details and test recipient.",
      fieldErrors: {
        ...(parsedConfiguration.success ? {} : validationFieldErrors(parsedConfiguration.error)),
        ...(parsedRecipient.success
          ? {}
          : { testRecipient: parsedRecipient.error.issues.map((i) => i.message) }),
      },
    };
  }

  try {
    await sendConfigurationTest({
      channel: input.channel,
      configuration: parsedConfiguration.data,
      recipient: parsedRecipient.data,
    });
  } catch (error) {
    logger.warn("Flowcordia email configuration test failed", {
      channel: input.channel,
      transport: parsedConfiguration.data.transport,
      errorName: error instanceof Error ? error.name : "UnknownEmailError",
    });
    return {
      success: false,
      message:
        "Flowcordia could not deliver the test email. Check the provider credentials, sender authorization, network access, and recipient, then retry.",
    };
  }

  const now = new Date().toISOString();
  await store().setSecret(keyFor(input.channel), {
    version: EMAIL_CONFIGURATION_VERSION,
    mode: "separate",
    configuration: parsedConfiguration.data,
    updatedAt: now,
    lastTestedAt: now,
  });
  clearResolutionCache();

  return { success: true, status: await getEmailConfigurationStatus(input.channel) };
}

export async function configureAlertEmailToUseGeneral(): Promise<ConfigureEmailResult> {
  const environment = environmentEmailConfiguration("alert");
  if (environment.kind !== "absent") {
    return {
      success: false,
      message: "Alert email is managed by server environment variables.",
    };
  }

  const general = await resolveEmailConfiguration("general", { force: true });
  if (!general) {
    return {
      success: false,
      message: "Configure and test general email before reusing it for alerts.",
    };
  }

  await store().setSecret(ALERT_EMAIL_KEY, {
    version: EMAIL_CONFIGURATION_VERSION,
    mode: "general",
    updatedAt: new Date().toISOString(),
  });
  clearResolutionCache();
  return { success: true, status: await getEmailConfigurationStatus("alert") };
}

export async function removeEmailConfiguration(
  channel: EmailChannel
): Promise<ConfigureEmailResult> {
  const environment = environmentEmailConfiguration(channel);
  if (environment.kind !== "absent") {
    return {
      success: false,
      message: "This email channel is managed by server environment variables.",
    };
  }

  try {
    await store().deleteSecret(keyFor(channel));
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Record to delete does not exist")) {
      throw error;
    }
  }
  clearResolutionCache();
  return { success: true, status: await getEmailConfigurationStatus(channel) };
}

export async function sendActiveEmailTest(input: {
  channel: EmailChannel;
  recipient: string;
}): Promise<ConfigureEmailResult> {
  const parsedRecipient = z
    .string()
    .trim()
    .email("Enter a valid test recipient.")
    .safeParse(input.recipient);
  if (!parsedRecipient.success) {
    return {
      success: false,
      message: parsedRecipient.error.issues[0]?.message ?? "Enter a valid test recipient.",
      fieldErrors: { testRecipient: parsedRecipient.error.issues.map((issue) => issue.message) },
    };
  }

  const resolved = await resolveEmailConfiguration(input.channel, { force: true });
  if (!resolved) {
    return { success: false, message: "Configure this email channel before sending a test." };
  }

  try {
    await sendConfigurationTest({
      channel: input.channel,
      configuration: resolved.configuration,
      recipient: parsedRecipient.data,
    });
    return { success: true, status: statusFromResolved(input.channel, resolved) };
  } catch (error) {
    logger.warn("Flowcordia active email test failed", {
      channel: input.channel,
      transport: resolved.configuration.transport,
      errorName: error instanceof Error ? error.name : "UnknownEmailError",
    });
    return {
      success: false,
      message:
        "Flowcordia could not deliver the test email. Check provider availability, sender authorization, credentials, and network access.",
    };
  }
}
