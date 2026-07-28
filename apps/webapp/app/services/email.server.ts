import type { DeliverEmail, SendPlainTextOptions } from "emails";
import { EmailClient } from "emails";
import type { SendEmailOptions } from "remix-auth-email-link";
import { redirect } from "remix-typedjson";
import { env } from "~/env.server";
import {
  createConfiguredEmailClient,
  resolveEmailConfiguration,
  type EmailChannel,
} from "~/features/flowcordia/setup/emailConfiguration.server";
import { assertEmailAllowed } from "~/utils/email";
import { singleton } from "~/utils/singleton";
import type { AuthUser } from "./authUser";
import { logger } from "./logger.server";

const fallbackClient = singleton(
  "email-client-unconfigured",
  () =>
    new EmailClient({
      imagesBaseUrl: env.APP_ORIGIN,
      from: env.FROM_EMAIL ?? "team@email.trigger.dev",
      replyTo: env.REPLY_TO_EMAIL ?? "help@email.trigger.dev",
    })
);

const fallbackAlertsClient = singleton(
  "alerts-email-client-unconfigured",
  () =>
    new EmailClient({
      imagesBaseUrl: env.APP_ORIGIN,
      from: env.ALERT_FROM_EMAIL ?? "noreply@alerts.trigger.dev",
      replyTo: env.ALERT_REPLY_TO_EMAIL ?? env.REPLY_TO_EMAIL ?? "help@email.trigger.dev",
    })
);

async function emailClientFor(channel: EmailChannel): Promise<EmailClient> {
  const resolved = await resolveEmailConfiguration(channel);
  if (resolved) {
    return createConfiguredEmailClient(resolved.configuration);
  }

  return channel === "alert" ? fallbackAlertsClient : fallbackClient;
}

export async function sendMagicLinkEmail(options: SendEmailOptions<AuthUser>): Promise<void> {
  assertEmailAllowed(options.emailAddress);

  // Auto redirect when in development mode
  if (env.NODE_ENV === "development") {
    throw redirect(options.magicLink);
  }

  logger.debug("Sending magic link email", { emailAddress: options.emailAddress });

  try {
    const client = await emailClientFor("general");
    return await client.send({
      email: "magic_link",
      to: options.emailAddress,
      magicLink: options.magicLink,
    });
  } catch (error) {
    logger.error("Error sending magic link email", { error: JSON.stringify(error) });
    throw error;
  }
}

export async function sendPlainTextEmail(options: SendPlainTextOptions) {
  const client = await emailClientFor("general");
  return client.sendPlainText(options);
}

export async function sendAlertPlainTextEmail(options: SendPlainTextOptions) {
  const client = await emailClientFor("alert");
  return client.sendPlainText(options);
}

export async function sendEmail(data: DeliverEmail) {
  const client = await emailClientFor("general");
  return client.send(data);
}

export async function sendAlertEmail(data: DeliverEmail) {
  const client = await emailClientFor("alert");
  return client.send(data);
}
