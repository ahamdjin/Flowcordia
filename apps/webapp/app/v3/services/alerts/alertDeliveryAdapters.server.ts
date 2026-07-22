import {
  type ChatPostMessageArguments,
  ErrorCode,
  type WebAPIHTTPError,
  type WebAPIPlatformError,
  type WebAPIRateLimitedError,
  type WebAPIRequestError,
} from "@slack/web-api";
import { subtle } from "node:crypto";
import { env } from "~/env.server";
import {
  OrgIntegrationRepository,
  type OrganizationIntegrationForService,
} from "~/models/orgIntegration.server";
import type { ProjectAlertWebhookProperties } from "~/models/projectAlert.server";
import { logger } from "~/services/logger.server";
import { decryptSecret } from "~/services/secrets/secretStore.server";

export class AlertDeliveryNoRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlertDeliveryNoRetryError";
  }
}

function isWebAPIPlatformError(error: unknown): error is WebAPIPlatformError {
  return (error as WebAPIPlatformError).code === ErrorCode.PlatformError;
}

function isWebAPIRequestError(error: unknown): error is WebAPIRequestError {
  return (error as WebAPIRequestError).code === ErrorCode.RequestError;
}

function isWebAPIHTTPError(error: unknown): error is WebAPIHTTPError {
  return (error as WebAPIHTTPError).code === ErrorCode.HTTPError;
}

function isWebAPIRateLimitedError(error: unknown): error is WebAPIRateLimitedError {
  return (error as WebAPIRateLimitedError).code === ErrorCode.RateLimitedError;
}

export async function deliverAlertWebhook<T>(
  payload: T,
  webhook: ProjectAlertWebhookProperties
): Promise<void> {
  const rawPayload = JSON.stringify(payload);
  const secret = await decryptSecret(env.ENCRYPTION_KEY, webhook.secret);
  const key = await subtle.importKey(
    "raw",
    Buffer.from(secret, "utf8"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await subtle.sign("HMAC", key, Buffer.from(rawPayload, "utf8"));
  const response = await fetch(webhook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-trigger-signature-hmacsha256": Buffer.from(signature).toString("hex"),
    },
    body: rawPayload,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    logger.info("[AlertDelivery] Alert webhook rejected the request", {
      status: response.status,
    });
    throw new Error("Alert webhook rejected the request");
  }
}

export async function postAlertSlackMessage(
  integration: OrganizationIntegrationForService<"SLACK">,
  message: ChatPostMessageArguments
) {
  const client = await OrgIntegrationRepository.getAuthenticatedClientForIntegration(integration, {
    forceBotToken: true,
  });
  try {
    return await client.chat.postMessage({
      ...message,
      unfurl_links: false,
      unfurl_media: false,
    });
  } catch (error) {
    if (isWebAPIRateLimitedError(error)) {
      logger.warn("[AlertDelivery] Slack rate limited the alert request");
      throw new Error("Slack rate limited the alert request");
    }
    if (isWebAPIHTTPError(error)) {
      logger.warn("[AlertDelivery] Slack returned an HTTP error");
      throw new Error("Slack returned an HTTP error");
    }
    if (isWebAPIRequestError(error)) {
      logger.warn("[AlertDelivery] Slack request failed before a platform response");
      throw new Error("Slack request failed");
    }
    if (isWebAPIPlatformError(error)) {
      if (error.data.error === "invalid_blocks") {
        throw new AlertDeliveryNoRetryError("Slack rejected invalid message blocks");
      }
      if (error.data.error === "account_inactive") {
        throw new AlertDeliveryNoRetryError("Slack account is inactive");
      }
      logger.warn("[AlertDelivery] Slack returned a platform error");
      throw new Error("Slack returned a platform error");
    }
    logger.warn("[AlertDelivery] Slack alert delivery failed");
    throw error;
  }
}
