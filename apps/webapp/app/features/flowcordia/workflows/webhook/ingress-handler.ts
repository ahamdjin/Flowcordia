import {
  PublicWebhookDeliveryConcurrencyError,
  PublicWebhookReplayMismatchError,
  type PublicWebhookDeliveryReservation,
  type ReservePublicWebhookDeliveryInput,
} from "@flowcordia/control-plane";
import { verifyFlowcordiaWebhookSignature } from "@flowcordia/runtime";
import {
  FLOWCORDIA_WEBHOOK_DELIVERY_HEADER,
  FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER,
  FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER,
  type JsonValue,
} from "@flowcordia/workflow";
import { json } from "@remix-run/node";
import { readFlowcordiaBoundedWebhookBody } from "./ingress-body.server";
import {
  FLOWCORDIA_PUBLIC_WEBHOOK_IDEMPOTENCY_MILLISECONDS,
  FLOWCORDIA_PUBLIC_WEBHOOK_LEASE_MILLISECONDS,
  flowcordiaPublicWebhookDeliveryRateKey,
  flowcordiaPublicWebhookRequestedPath,
  flowcordiaPublicWebhookRunIdempotencyKey,
  isFlowcordiaPublicWebhookId,
  isFlowcordiaPublicWebhookJsonContentType,
  parseFlowcordiaPublicWebhookJson,
} from "./ingress-contract.server";
import type {
  FlowcordiaPublicWebhookBindingResolution,
  FlowcordiaPublicWebhookIngressBinding,
} from "./ingress-binding.server";

export interface FlowcordiaPublicWebhookRateLimitResult {
  available: boolean;
  success: boolean;
  reset: number;
}

export interface FlowcordiaPublicWebhookIngressDependencies {
  now(): Date;
  leaseToken(): string;
  resolveBinding(publicId: string): Promise<FlowcordiaPublicWebhookBindingResolution>;
  limitEndpoint(endpointStorageId: string): Promise<FlowcordiaPublicWebhookRateLimitResult>;
  limitDelivery(deliveryKey: string): Promise<FlowcordiaPublicWebhookRateLimitResult>;
  readSecret(binding: FlowcordiaPublicWebhookIngressBinding): Promise<string | null>;
  reserve(input: ReservePublicWebhookDeliveryInput): Promise<PublicWebhookDeliveryReservation>;
  complete(input: {
    storageId: string;
    leaseToken: string;
    runFriendlyId: string;
    completedAt: Date;
  }): Promise<void>;
  fail(input: {
    storageId: string;
    leaseToken: string;
    failureCode: string;
    completedAt: Date;
  }): Promise<void>;
  findExistingRun(
    binding: FlowcordiaPublicWebhookIngressBinding,
    idempotencyKey: string
  ): Promise<string | null>;
  trigger(input: {
    binding: FlowcordiaPublicWebhookIngressBinding;
    payload: JsonValue;
    idempotencyKey: string;
    idempotencyKeyExpiresAt: Date;
    deliveryId: string;
    payloadSha256: string;
  }): Promise<string | null>;
  reportError(event: string, error: unknown, context?: Record<string, string>): void;
}

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

function response(
  status: number,
  body: { accepted?: true; error?: string },
  headers: Record<string, string> = {}
): Response {
  return json(body, { status, headers: { ...RESPONSE_HEADERS, ...headers } });
}

function rateLimited(reset: number, now: Date): Response {
  const resetMilliseconds = reset > 10_000_000_000 ? reset : reset * 1000;
  const retryAfter = Math.max(1, Math.ceil((resetMilliseconds - now.getTime()) / 1000));
  return response(429, { error: "rate_limited" }, { "Retry-After": String(retryAfter) });
}

async function failOwnedDelivery(
  dependencies: FlowcordiaPublicWebhookIngressDependencies,
  reservation: Extract<PublicWebhookDeliveryReservation, { status: "acquired" }>,
  failureCode: string
): Promise<void> {
  try {
    await dependencies.fail({
      storageId: reservation.storageId,
      leaseToken: reservation.leaseToken,
      failureCode,
      completedAt: dependencies.now(),
    });
  } catch (error) {
    dependencies.reportError("flowcordia_public_webhook_failure_recording", error, {
      failureCode,
    });
  }
}

export function createFlowcordiaPublicWebhookIngressHandler(
  dependencies: FlowcordiaPublicWebhookIngressDependencies
) {
  return async function handleFlowcordiaPublicWebhookIngress(
    request: Request,
    publicId: string | undefined
  ): Promise<Response> {
    if (!publicId || !isFlowcordiaPublicWebhookId(publicId)) {
      return response(404, { error: "not_found" });
    }

    let resolution: FlowcordiaPublicWebhookBindingResolution;
    try {
      resolution = await dependencies.resolveBinding(publicId);
    } catch (error) {
      dependencies.reportError("flowcordia_public_webhook_binding_resolution", error);
      return response(503, { error: "temporarily_unavailable" });
    }
    if (resolution.status === "not_found") return response(404, { error: "not_found" });
    if (resolution.status === "temporarily_unavailable") {
      return response(503, { error: "temporarily_unavailable" });
    }
    const binding = resolution.binding;
    const requestedPath = flowcordiaPublicWebhookRequestedPath({
      requestUrl: request.url,
      publicId,
    });
    if (requestedPath !== binding.path || request.method.toUpperCase() !== binding.method) {
      return response(404, { error: "not_found" });
    }

    const now = dependencies.now();
    const endpointLimit = await dependencies.limitEndpoint(binding.endpointStorageId);
    if (!endpointLimit.available) return response(503, { error: "temporarily_unavailable" });
    if (!endpointLimit.success) return rateLimited(endpointLimit.reset, now);

    let bodyResult;
    try {
      bodyResult = await readFlowcordiaBoundedWebhookBody(request, binding.maxBodyBytes);
    } catch {
      return response(400, { error: "invalid_request" });
    }
    if (!bodyResult.success) {
      return bodyResult.code === "body_too_large"
        ? response(413, { error: "request_too_large" })
        : response(400, { error: "invalid_request" });
    }
    if (
      bodyResult.body.byteLength > 0 &&
      !isFlowcordiaPublicWebhookJsonContentType(request.headers.get("content-type"))
    ) {
      return response(415, { error: "unsupported_media_type" });
    }

    let secret: string | null;
    try {
      secret = await dependencies.readSecret(binding);
    } catch (error) {
      dependencies.reportError("flowcordia_public_webhook_secret_resolution", error);
      return response(503, { error: "temporarily_unavailable" });
    }
    if (!secret) return response(503, { error: "temporarily_unavailable" });

    let verification;
    try {
      verification = verifyFlowcordiaWebhookSignature({
        body: bodyResult.body,
        signature: request.headers.get(FLOWCORDIA_WEBHOOK_SIGNATURE_HEADER),
        timestamp: request.headers.get(FLOWCORDIA_WEBHOOK_TIMESTAMP_HEADER),
        deliveryId: request.headers.get(FLOWCORDIA_WEBHOOK_DELIVERY_HEADER),
        secret,
        toleranceSeconds: binding.timestampToleranceSeconds,
        nowMilliseconds: now.getTime(),
      });
    } catch (error) {
      dependencies.reportError("flowcordia_public_webhook_signature_verifier", error);
      return response(503, { error: "temporarily_unavailable" });
    }
    if (!verification.verified) return response(401, { error: "unauthorized" });

    const parsedPayload = parseFlowcordiaPublicWebhookJson(bodyResult.body);
    if (!parsedPayload.success) return response(400, { error: "invalid_request" });

    const deliveryLimit = await dependencies.limitDelivery(
      flowcordiaPublicWebhookDeliveryRateKey({
        endpointStorageId: binding.endpointStorageId,
        deliveryId: verification.deliveryId,
      })
    );
    if (!deliveryLimit.available) return response(503, { error: "temporarily_unavailable" });
    if (!deliveryLimit.success) return rateLimited(deliveryLimit.reset, now);

    let reservation: PublicWebhookDeliveryReservation;
    try {
      reservation = await dependencies.reserve({
        tenantId: binding.tenantId,
        projectId: binding.projectId,
        environmentId: binding.environmentId,
        workflowId: binding.workflowId,
        endpointId: binding.endpointStorageId,
        deliveryId: verification.deliveryId,
        payloadHash: verification.payloadSha256,
        receivedAt: now,
        now,
        leaseToken: dependencies.leaseToken(),
        leaseExpiresAt: new Date(now.getTime() + FLOWCORDIA_PUBLIC_WEBHOOK_LEASE_MILLISECONDS),
      });
    } catch (error) {
      if (error instanceof PublicWebhookReplayMismatchError) {
        return response(409, { error: "delivery_conflict" });
      }
      if (error instanceof PublicWebhookDeliveryConcurrencyError) {
        return response(503, { error: "temporarily_unavailable" });
      }
      dependencies.reportError("flowcordia_public_webhook_replay_reservation", error);
      return response(503, { error: "temporarily_unavailable" });
    }

    if (reservation.status === "completed") return response(200, { accepted: true });
    if (reservation.status === "in_progress") return response(202, { accepted: true });

    const idempotencyKey = flowcordiaPublicWebhookRunIdempotencyKey({
      endpointStorageId: binding.endpointStorageId,
      deliveryId: verification.deliveryId,
    });
    try {
      const existingRunFriendlyId = await dependencies.findExistingRun(binding, idempotencyKey);
      if (existingRunFriendlyId) {
        await dependencies.complete({
          storageId: reservation.storageId,
          leaseToken: reservation.leaseToken,
          runFriendlyId: existingRunFriendlyId,
          completedAt: dependencies.now(),
        });
        return response(200, { accepted: true });
      }

      const runFriendlyId = await dependencies.trigger({
        binding,
        payload: parsedPayload.payload,
        idempotencyKey,
        idempotencyKeyExpiresAt: new Date(
          now.getTime() + FLOWCORDIA_PUBLIC_WEBHOOK_IDEMPOTENCY_MILLISECONDS
        ),
        deliveryId: verification.deliveryId,
        payloadSha256: verification.payloadSha256,
      });
      if (!runFriendlyId) {
        await failOwnedDelivery(dependencies, reservation, "task_unavailable");
        return response(503, { error: "temporarily_unavailable" });
      }
      await dependencies.complete({
        storageId: reservation.storageId,
        leaseToken: reservation.leaseToken,
        runFriendlyId,
        completedAt: dependencies.now(),
      });
      return response(202, { accepted: true });
    } catch (error) {
      await failOwnedDelivery(dependencies, reservation, "trigger_unavailable");
      dependencies.reportError("flowcordia_public_webhook_trigger", error);
      return response(503, { error: "temporarily_unavailable" });
    }
  };
}
