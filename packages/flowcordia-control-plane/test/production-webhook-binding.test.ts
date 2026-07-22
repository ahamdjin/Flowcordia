import { describe, expect, it } from "vitest";
import {
  ProductionWebhookBindingRevokedError,
  ProductionWebhookBindingService,
  type ProductionWebhookBindingRevisionInput,
  type ProductionWebhookBindingStore,
  type ProductionWebhookBindingTransaction,
  type ProductionWebhookEndpointRecord,
  type ProductionWebhookRevisionRecord,
  productionWebhookBindingFingerprint,
} from "../src/webhook/production-binding";

function binding(
  overrides: Partial<ProductionWebhookBindingRevisionInput> = {}
): ProductionWebhookBindingRevisionInput {
  return {
    tenantId: "org_123",
    projectId: "project_123",
    environmentId: "env_123",
    workflowId: "order_fulfillment",
    nodeId: "receive-order",
    proposalId: "proposal_123",
    mergeCommitSha: "a".repeat(40),
    workflowPath: "flowcordia/workflows/order_fulfillment.json",
    workflowBlobSha: "b".repeat(40),
    workflowCanonicalSha256: "c".repeat(64),
    deploymentId: "deployment_123",
    deploymentShortCode: "dep_123",
    workerId: "worker_123",
    workerVersion: "20260722.1",
    taskIdentifier: "flowcordia-order_fulfillment",
    method: "POST",
    path: "/orders",
    maxBodyBytes: 1_048_576,
    timestampToleranceSeconds: 300,
    credentialReference: "orders-hook",
    credentialEnvironmentName: "FLOWCORDIA_WEBHOOK_HMAC_ORDERS_HOOK",
    credentialVersion: "7",
    ...overrides,
  };
}

class MemoryStore implements ProductionWebhookBindingStore {
  endpoint: ProductionWebhookEndpointRecord | null = null;
  revisions: ProductionWebhookRevisionRecord[] = [];
  activationWrites = 0;

  async transaction<T>(
    callback: (transaction: ProductionWebhookBindingTransaction) => Promise<T>
  ): Promise<T> {
    return callback({
      ensureEndpoint: async ({ scope, publicId }) => {
        if (!this.endpoint) {
          this.endpoint = {
            ...scope,
            storageId: "endpoint_123",
            publicId,
            activeRevisionId: null,
            revokedAt: null,
          };
        }
        return this.endpoint;
      },
      findRevisionByFingerprint: async ({ endpointId, fingerprint }) =>
        this.revisions.find(
          (revision) => revision.endpointId === endpointId && revision.fingerprint === fingerprint
        ) ?? null,
      createRevision: async ({ endpointId, fingerprint, binding, createdAt }) => {
        const revision: ProductionWebhookRevisionRecord = {
          ...binding,
          storageId: `revision_${this.revisions.length + 1}`,
          endpointId,
          revision: this.revisions.length + 1,
          fingerprint,
          createdAt,
        };
        this.revisions.push(revision);
        return revision;
      },
      activateRevision: async ({ endpointId, revisionId }) => {
        if (!this.endpoint || this.endpoint.storageId !== endpointId || this.endpoint.revokedAt) {
          return false;
        }
        this.activationWrites += 1;
        this.endpoint = { ...this.endpoint, activeRevisionId: revisionId };
        return true;
      },
    });
  }
}

describe("ProductionWebhookBindingService", () => {
  it("creates a stable endpoint and activates an immutable revision", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    const result = await service.activate({
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      endpointPublicId: "WebhookPublicIdentity12345",
      revision: 1,
      changed: true,
    });
    expect(store.revisions).toHaveLength(1);
    expect(store.endpoint?.activeRevisionId).toBe("revision_1");
  });

  it("is idempotent for the same immutable binding", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    const input = {
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    };
    const first = await service.activate(input);
    const second = await service.activate({
      ...input,
      proposedPublicId: "DifferentIgnoredPublicId9",
      activatedAt: new Date("2026-07-22T12:05:00.000Z"),
    });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(second).toMatchObject({
      endpointPublicId: "WebhookPublicIdentity12345",
      revision: 1,
      changed: false,
    });
    expect(store.revisions).toHaveLength(1);
    expect(store.activationWrites).toBe(1);
  });

  it("appends and activates a new revision when deployment identity changes", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    await service.activate({
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    const next = await service.activate({
      binding: binding({
        mergeCommitSha: "d".repeat(40),
        workflowBlobSha: "e".repeat(40),
        workflowCanonicalSha256: "f".repeat(64),
        deploymentId: "deployment_456",
        deploymentShortCode: "dep_456",
        workerId: "worker_456",
        workerVersion: "20260722.2",
      }),
      proposedPublicId: "IgnoredPublicIdentity67890",
      activatedAt: new Date("2026-07-22T13:00:00.000Z"),
    });

    expect(next).toMatchObject({ revision: 2, changed: true });
    expect(store.revisions).toHaveLength(2);
    expect(store.endpoint?.activeRevisionId).toBe("revision_2");
  });

  it("fails closed when the stable endpoint is revoked", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    await service.activate({
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    store.endpoint = { ...store.endpoint!, revokedAt: new Date("2026-07-22T12:30:00.000Z") };

    await expect(
      service.activate({
        binding: binding({ workerVersion: "20260722.2" }),
        proposedPublicId: "WebhookPublicIdentity12345",
        activatedAt: new Date("2026-07-22T13:00:00.000Z"),
      })
    ).rejects.toBeInstanceOf(ProductionWebhookBindingRevokedError);
  });

  it("fingerprints credential versions and never accepts secret values", () => {
    const first = productionWebhookBindingFingerprint(binding({ credentialVersion: "7" }));
    const second = productionWebhookBindingFingerprint(binding({ credentialVersion: "8" }));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(JSON.stringify(binding())).not.toContain("secret");
  });
});
