import {
  PublicWebhookReplayMismatchError,
  type PublicWebhookDeliveryReservation,
} from "@flowcordia/control-plane";
import { signFlowcordiaWebhook } from "@flowcordia/runtime";
import { describe, expect, it, vi } from "vitest";
import type { FlowcordiaPublicWebhookIngressBinding } from "~/features/flowcordia/workflows/webhook/ingress-binding.server";
import {
  createFlowcordiaPublicWebhookIngressHandler,
  type FlowcordiaPublicWebhookIngressDependencies,
} from "~/features/flowcordia/workflows/webhook/ingress-handler";

const publicId = "A".repeat(32);
const secret = "s".repeat(32);
const now = new Date("2026-07-22T17:00:00.000Z");
const body = JSON.stringify({ order: 42 });
const deliveryId = "delivery-001";
const timestampSeconds = Math.floor(now.getTime() / 1000);

const binding: FlowcordiaPublicWebhookIngressBinding = {
  endpointStorageId: "endpoint_123",
  publicId,
  tenantId: "org_123",
  projectId: "project_123",
  environmentId: "env_123",
  workflowId: "orders_intake",
  nodeId: "webhook_1",
  revisionStorageId: "revision_123",
  revision: 3,
  taskIdentifier: "flowcordia-orders_intake",
  workerVersion: "20260722.1",
  method: "POST",
  path: "/orders",
  maxBodyBytes: 1024,
  timestampToleranceSeconds: 300,
  credentialEnvironmentName: "FLOWCORDIA_WEBHOOK_HMAC_ORDERS",
  credentialVersion: "7",
  environment: {} as FlowcordiaPublicWebhookIngressBinding["environment"],
};

function signedRequest(
  signature = signFlowcordiaWebhook({
    body,
    timestampSeconds,
    deliveryId,
    secret,
  })
) {
  return new Request(`https://flowcordia.example/api/v1/flowcordia/webhooks/${publicId}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-flowcordia-signature": signature,
      "x-flowcordia-timestamp": String(timestampSeconds),
      "x-flowcordia-delivery": deliveryId,
    },
    body,
  });
}

function acquired(): Extract<PublicWebhookDeliveryReservation, { status: "acquired" }> {
  return {
    status: "acquired",
    storageId: "delivery_storage_1",
    attempts: 1,
    resumed: false,
    leaseToken: "lease_token_0001",
    leaseExpiresAt: new Date(now.getTime() + 240_000),
  };
}

function dependencies(
  overrides: Partial<FlowcordiaPublicWebhookIngressDependencies> = {}
): FlowcordiaPublicWebhookIngressDependencies {
  return {
    now: () => now,
    leaseToken: () => "lease_token_0001",
    resolveBinding: async () => ({ status: "ready", binding }),
    limitEndpoint: async () => ({ available: true, success: true, reset: 0 }),
    limitDelivery: async () => ({ available: true, success: true, reset: 0 }),
    readSecret: async () => secret,
    reserve: async () => acquired(),
    complete: async () => undefined,
    fail: async () => undefined,
    findExistingRun: async () => null,
    trigger: async () => "run_123",
    reportError: () => undefined,
    ...overrides,
  };
}

describe("Flowcordia public webhook ingress", () => {
  it("verifies, reserves, triggers the exact binding, and returns no run identity", async () => {
    const order: string[] = [];
    const complete = vi.fn(async () => {
      order.push("complete");
    });
    const handler = createFlowcordiaPublicWebhookIngressHandler(
      dependencies({
        resolveBinding: async () => {
          order.push("binding");
          return { status: "ready", binding };
        },
        readSecret: async () => {
          order.push("secret");
          return secret;
        },
        reserve: async () => {
          order.push("reserve");
          return acquired();
        },
        findExistingRun: async () => {
          order.push("existing");
          return null;
        },
        trigger: async (input) => {
          order.push("trigger");
          expect(input.binding.workerVersion).toBe(binding.workerVersion);
          expect(input.deliveryId).toBe(deliveryId);
          return "run_123";
        },
        complete,
      })
    );

    const response = await handler(signedRequest(), publicId);
    const responseText = await response.text();
    expect(response.status).toBe(202);
    expect(JSON.parse(responseText)).toEqual({ accepted: true });
    expect(order).toEqual(["binding", "secret", "reserve", "existing", "trigger", "complete"]);
    expect(JSON.stringify(complete.mock.calls)).toContain("run_123");
    expect(responseText).not.toContain("run_123");
  });

  it("rejects non-JSON payload declarations before secret or replay work", async () => {
    const readSecret = vi.fn(async () => secret);
    const reserve = vi.fn(async () => acquired());
    const handler = createFlowcordiaPublicWebhookIngressHandler(
      dependencies({ readSecret, reserve })
    );
    const request = signedRequest();
    request.headers.set("content-type", "text/plain");
    const response = await handler(request, publicId);
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
    expect(readSecret).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before replay reservation", async () => {
    const reserve = vi.fn(async () => acquired());
    const handler = createFlowcordiaPublicWebhookIngressHandler(dependencies({ reserve }));
    const response = await handler(signedRequest(`v1=${"0".repeat(64)}`), publicId);
    expect(response.status).toBe(401);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("fails closed when distributed endpoint limiting is unavailable", async () => {
    const readSecret = vi.fn(async () => secret);
    const handler = createFlowcordiaPublicWebhookIngressHandler(
      dependencies({
        limitEndpoint: async () => ({ available: false, success: false, reset: 0 }),
        readSecret,
      })
    );
    const response = await handler(signedRequest(), publicId);
    expect(response.status).toBe(503);
    expect(readSecret).not.toHaveBeenCalled();
  });

  it("returns completed deliveries without creating another run", async () => {
    const trigger = vi.fn(async () => "run_new");
    const handler = createFlowcordiaPublicWebhookIngressHandler(
      dependencies({
        reserve: async () => ({
          status: "completed",
          storageId: "delivery_storage_1",
          attempts: 1,
          runFriendlyId: "run_existing",
          completedAt: now,
        }),
        trigger,
      })
    );
    const response = await handler(signedRequest(), publicId);
    expect(response.status).toBe(200);
    expect(trigger).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("run_existing");
  });

  it("recovers an existing exact-idempotency run before calling TriggerTaskService", async () => {
    const trigger = vi.fn(async () => "run_new");
    const complete = vi.fn(async () => undefined);
    const handler = createFlowcordiaPublicWebhookIngressHandler(
      dependencies({
        findExistingRun: async () => "run_existing",
        trigger,
        complete,
      })
    );
    const response = await handler(signedRequest(), publicId);
    expect(response.status).toBe(200);
    expect(trigger).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ runFriendlyId: "run_existing" })
    );
  });

  it("returns a bounded conflict for delivery identity reuse with another digest", async () => {
    const handler = createFlowcordiaPublicWebhookIngressHandler(
      dependencies({
        reserve: async () => {
          throw new PublicWebhookReplayMismatchError();
        },
      })
    );
    const response = await handler(signedRequest(), publicId);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "delivery_conflict" });
  });
});
