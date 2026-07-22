import { randomBytes } from "node:crypto";
import { PublicWebhookDeliveryService } from "@flowcordia/control-plane";
import { Ratelimit } from "@upstash/ratelimit";
import { prisma } from "~/db.server";
import { logger } from "~/services/logger.server";
import { RateLimiter } from "~/services/rateLimiter.server";
import { runStore } from "~/v3/runStore.server";
import { EnvironmentVariablesRepository } from "~/v3/environmentVariables/environmentVariablesRepository.server";
import { TriggerTaskService } from "~/v3/services/triggerTask.server";
import { parseFlowcordiaStoredWebhookSecret } from "../credentials/webhook-secret";
import { resolveFlowcordiaPublicWebhookIngressBinding } from "./ingress-binding.server";
import {
  FLOWCORDIA_PUBLIC_WEBHOOK_IDEMPOTENCY_MILLISECONDS,
  flowcordiaPublicWebhookRunIdempotencyKey,
} from "./ingress-contract.server";
import {
  createFlowcordiaPublicWebhookIngressHandler,
  type FlowcordiaPublicWebhookIngressDependencies,
  type FlowcordiaPublicWebhookRateLimitResult,
} from "./ingress-handler";
import { flowcordiaPublicWebhookDeliveryStore } from "./prisma.server";

const deliveryService = new PublicWebhookDeliveryService(flowcordiaPublicWebhookDeliveryStore);
const environmentVariables = new EnvironmentVariablesRepository();
let endpointRateLimiter: RateLimiter | undefined;
let deliveryRateLimiter: RateLimiter | undefined;

function getEndpointRateLimiter(): RateLimiter {
  endpointRateLimiter ??= new RateLimiter({
    keyPrefix: "flowcordia-public-webhook-endpoint-v1",
    limiter: Ratelimit.slidingWindow(600, "1 m"),
    logSuccess: false,
  });
  return endpointRateLimiter;
}

function getDeliveryRateLimiter(): RateLimiter {
  deliveryRateLimiter ??= new RateLimiter({
    keyPrefix: "flowcordia-public-webhook-delivery-v1",
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    logSuccess: false,
  });
  return deliveryRateLimiter;
}

async function safeRateLimit(
  limiter: RateLimiter,
  identifier: string
): Promise<FlowcordiaPublicWebhookRateLimitResult> {
  try {
    const result = await limiter.limit(identifier);
    return { available: true, success: result.success, reset: result.reset };
  } catch (error) {
    logger.error("Flowcordia public webhook rate limiter unavailable", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { available: false, success: false, reset: 0 };
  }
}

const dependencies: FlowcordiaPublicWebhookIngressDependencies = {
  now: () => new Date(),
  leaseToken: () => randomBytes(24).toString("base64url"),
  resolveBinding: resolveFlowcordiaPublicWebhookIngressBinding,
  limitEndpoint: (endpointStorageId) => safeRateLimit(getEndpointRateLimiter(), endpointStorageId),
  limitDelivery: (deliveryKey) => safeRateLimit(getDeliveryRateLimiter(), deliveryKey),
  readSecret: async (binding) => {
    const values = await environmentVariables.getVariableValuesForKeys(binding.projectId, [
      {
        environmentId: binding.environmentId,
        key: binding.credentialEnvironmentName,
      },
    ]);
    const serialized = values.get(`${binding.environmentId}:${binding.credentialEnvironmentName}`);
    if (!serialized) return null;

    const credential = await prisma.environmentVariable.findFirst({
      where: {
        projectId: binding.projectId,
        key: binding.credentialEnvironmentName,
      },
      select: {
        values: {
          where: {
            environmentId: binding.environmentId,
            isSecret: true,
          },
          select: { version: true },
          take: 1,
        },
      },
    });
    if (String(credential?.values[0]?.version ?? "") !== binding.credentialVersion) return null;

    const parsed = parseFlowcordiaStoredWebhookSecret(serialized);
    return parsed.success ? parsed.secret : null;
  },
  reserve: (input) => deliveryService.reserve(input),
  complete: (input) => deliveryService.complete(input),
  fail: (input) => deliveryService.fail(input),
  findExistingRun: async (binding, idempotencyKey) => {
    const run = await runStore.findRun(
      {
        runtimeEnvironmentId: binding.environmentId,
        taskIdentifier: binding.taskIdentifier,
        idempotencyKey,
      },
      { select: { friendlyId: true } },
      prisma
    );
    return run?.friendlyId ?? null;
  },
  trigger: async ({
    binding,
    payload,
    idempotencyKey,
    idempotencyKeyExpiresAt,
    deliveryId,
    payloadSha256,
  }) => {
    const result = await new TriggerTaskService().call(
      binding.taskIdentifier,
      binding.environment,
      {
        payload: JSON.stringify(payload),
        options: {
          payloadType: "application/json",
          lockToVersion: binding.workerVersion,
          idempotencyKey,
          idempotencyKeyTTL: "24h",
          metadata: {
            flowcordiaWebhook: {
              endpointId: binding.endpointStorageId,
              revision: binding.revision,
              nodeId: binding.nodeId,
              deliveryId,
              payloadSha256,
            },
          },
        },
      },
      {
        idempotencyKey,
        idempotencyKeyExpiresAt,
        triggerSource: "flowcordia_webhook",
        triggerAction: "flowcordia_public_webhook",
      }
    );
    return result?.run.friendlyId ?? null;
  },
  reportError: (event, error, context = {}) => {
    logger.error(event, {
      ...context,
      errorName: error instanceof Error ? error.name : "unknown",
    });
  },
};

export const handleFlowcordiaPublicWebhookIngress =
  createFlowcordiaPublicWebhookIngressHandler(dependencies);

export {
  flowcordiaPublicWebhookRunIdempotencyKey,
  FLOWCORDIA_PUBLIC_WEBHOOK_IDEMPOTENCY_MILLISECONDS,
};
