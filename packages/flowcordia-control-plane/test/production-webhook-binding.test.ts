import { describe, expect, it } from "vitest";
import {
  ProductionWebhookBindingNotFoundError,
  ProductionWebhookBindingRevokedError,
  ProductionWebhookBindingService,
  ProductionWebhookReplacementRequiresRevocationError,
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
  endpoints: ProductionWebhookEndpointRecord[] = [];
  revisions: ProductionWebhookRevisionRecord[] = [];
  activationWrites = 0;
  revocationWrites = 0;
  replacementWrites = 0;

  get endpoint(): ProductionWebhookEndpointRecord | null {
    return this.endpoints.find((endpoint) => !endpoint.supersededAt) ?? null;
  }

  set endpoint(value: ProductionWebhookEndpointRecord | null) {
    if (!value) {
      this.endpoints = [];
      return;
    }
    const index = this.endpoints.findIndex((endpoint) => endpoint.storageId === value.storageId);
    if (index >= 0) this.endpoints[index] = value;
    else this.endpoints.push(value);
  }

  private updateEndpoint(value: ProductionWebhookEndpointRecord): void {
    const index = this.endpoints.findIndex((endpoint) => endpoint.storageId === value.storageId);
    if (index < 0) throw new Error("Endpoint not found");
    this.endpoints[index] = value;
  }

  async transaction<T>(
    callback: (transaction: ProductionWebhookBindingTransaction) => Promise<T>
  ): Promise<T> {
    return callback({
      ensureEndpoint: async ({ scope, publicId, now }) => {
        const current = this.endpoints.find((endpoint) => !endpoint.supersededAt);
        if (current) return current;
        if (this.endpoints.length > 0) throw new Error("Missing current endpoint");
        const endpoint: ProductionWebhookEndpointRecord = {
          ...scope,
          storageId: "endpoint_1",
          publicId,
          generation: 1,
          activeRevisionId: null,
          revokedAt: null,
          revokedByUserId: null,
          revocationReason: null,
          supersededAt: null,
          replacesEndpointId: null,
          replacementCreatedByUserId: null,
          createdAt: now,
        };
        this.endpoints.push(endpoint);
        return endpoint;
      },
      findRevisionByFingerprint: async ({ endpointId, fingerprint }) =>
        this.revisions.find(
          (revision) => revision.endpointId === endpointId && revision.fingerprint === fingerprint
        ) ?? null,
      createRevision: async ({ endpointId, fingerprint, binding, createdAt }) => {
        const endpointRevisions = this.revisions.filter(
          (revision) => revision.endpointId === endpointId
        );
        const revision: ProductionWebhookRevisionRecord = {
          ...binding,
          storageId: `revision_${this.revisions.length + 1}`,
          endpointId,
          revision: endpointRevisions.length + 1,
          fingerprint,
          createdAt,
        };
        this.revisions.push(revision);
        return revision;
      },
      activateRevision: async ({ endpointId, revisionId }) => {
        const endpoint = this.endpoints.find((candidate) => candidate.storageId === endpointId);
        if (!endpoint || endpoint.revokedAt || endpoint.supersededAt) return false;
        this.activationWrites += 1;
        this.updateEndpoint({ ...endpoint, activeRevisionId: revisionId });
        return true;
      },
      revokeEndpoint: async ({ scope, expectedPublicId, actorId, reason, revokedAt }) => {
        const endpoint = this.endpoints.find(
          (candidate) =>
            candidate.tenantId === scope.tenantId &&
            candidate.projectId === scope.projectId &&
            candidate.environmentId === scope.environmentId &&
            candidate.workflowId === scope.workflowId &&
            candidate.nodeId === scope.nodeId &&
            candidate.publicId === expectedPublicId
        );
        if (!endpoint?.activeRevisionId) return { status: "not_found" as const };
        if (endpoint.revokedAt) {
          return { status: "already_revoked" as const, endpoint };
        }
        this.revocationWrites += 1;
        const revoked = {
          ...endpoint,
          revokedAt,
          revokedByUserId: actorId,
          revocationReason: reason,
        };
        this.updateEndpoint(revoked);
        return { status: "revoked" as const, endpoint: revoked };
      },
      replaceRevokedEndpoint: async (input) => {
        const predecessor = this.endpoints.find(
          (candidate) =>
            candidate.tenantId === input.scope.tenantId &&
            candidate.projectId === input.scope.projectId &&
            candidate.environmentId === input.scope.environmentId &&
            candidate.workflowId === input.scope.workflowId &&
            candidate.nodeId === input.scope.nodeId &&
            candidate.publicId === input.expectedRevokedPublicId
        );
        if (!predecessor?.activeRevisionId) return { status: "not_found" as const };
        const existing = this.endpoints.find(
          (candidate) => candidate.replacesEndpointId === predecessor.storageId
        );
        if (existing) {
          return {
            status: "already_replaced" as const,
            endpoint: existing,
            replacesPublicId: predecessor.publicId,
          };
        }
        if (!predecessor.revokedAt || predecessor.supersededAt) {
          return { status: "not_revoked" as const };
        }
        this.updateEndpoint({ ...predecessor, supersededAt: input.replacedAt });
        const endpoint: ProductionWebhookEndpointRecord = {
          ...input.scope,
          storageId: `endpoint_${this.endpoints.length + 1}`,
          publicId: input.proposedPublicId,
          generation: predecessor.generation + 1,
          activeRevisionId: null,
          revokedAt: null,
          revokedByUserId: null,
          revocationReason: null,
          supersededAt: null,
          replacesEndpointId: predecessor.storageId,
          replacementCreatedByUserId: input.actorId,
          createdAt: input.replacedAt,
        };
        this.endpoints.push(endpoint);
        this.replacementWrites += 1;
        return {
          status: "replaced" as const,
          endpoint,
          replacesPublicId: predecessor.publicId,
        };
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

  it("permanently revokes an exact endpoint and preserves immutable revision evidence", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    await service.activate({
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    const first = await service.revoke({
      scope: binding(),
      expectedPublicId: "WebhookPublicIdentity12345",
      actorId: "user_123",
      reason: "credential_compromise",
      revokedAt: new Date("2026-07-22T12:30:00.000Z"),
    });
    const second = await service.revoke({
      scope: binding(),
      expectedPublicId: "WebhookPublicIdentity12345",
      actorId: "user_456",
      reason: "manual_emergency_stop",
      revokedAt: new Date("2026-07-22T12:35:00.000Z"),
    });

    expect(first).toMatchObject({
      endpointPublicId: "WebhookPublicIdentity12345",
      changed: true,
      reason: "credential_compromise",
    });
    expect(second).toMatchObject({ changed: false, reason: "credential_compromise" });
    expect(store.revocationWrites).toBe(1);
    expect(store.endpoint).toMatchObject({
      activeRevisionId: "revision_1",
      revokedByUserId: "user_123",
      revocationReason: "credential_compromise",
    });
  });

  it("rejects revocation when the public endpoint identity does not match", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    await service.activate({
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    await expect(
      service.revoke({
        scope: binding(),
        expectedPublicId: "DifferentPublicIdentity12345",
        actorId: "user_123",
        reason: "unexpected_traffic",
        revokedAt: new Date("2026-07-22T12:30:00.000Z"),
      })
    ).rejects.toBeInstanceOf(ProductionWebhookBindingNotFoundError);
  });

  it("fails closed when the stable endpoint is revoked", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    await service.activate({
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    store.endpoint = {
      ...store.endpoint!,
      revokedAt: new Date("2026-07-22T12:30:00.000Z"),
      revokedByUserId: "user_123",
      revocationReason: "manual_emergency_stop",
    };

    await expect(
      service.activate({
        binding: binding({ workerVersion: "20260722.2" }),
        proposedPublicId: "WebhookPublicIdentity12345",
        activatedAt: new Date("2026-07-22T13:00:00.000Z"),
      })
    ).rejects.toBeInstanceOf(ProductionWebhookBindingRevokedError);
  });

  it("creates one inactive replacement generation and then permits exact activation", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    await service.activate({
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    await service.revoke({
      scope: binding(),
      expectedPublicId: "WebhookPublicIdentity12345",
      actorId: "user_123",
      reason: "credential_compromise",
      revokedAt: new Date("2026-07-22T12:30:00.000Z"),
    });

    const first = await service.replaceRevoked({
      scope: binding(),
      expectedRevokedPublicId: "WebhookPublicIdentity12345",
      proposedPublicId: "ReplacementPublicIdentity12345",
      actorId: "user_456",
      replacedAt: new Date("2026-07-22T12:45:00.000Z"),
    });
    const second = await service.replaceRevoked({
      scope: binding(),
      expectedRevokedPublicId: "WebhookPublicIdentity12345",
      proposedPublicId: "IgnoredReplacementIdentity99",
      actorId: "user_789",
      replacedAt: new Date("2026-07-22T12:50:00.000Z"),
    });

    expect(first).toMatchObject({
      endpointPublicId: "ReplacementPublicIdentity12345",
      generation: 2,
      replacesPublicId: "WebhookPublicIdentity12345",
      changed: true,
    });
    expect(second).toMatchObject({
      endpointPublicId: "ReplacementPublicIdentity12345",
      generation: 2,
      changed: false,
    });
    expect(store.replacementWrites).toBe(1);
    expect(store.endpoints[0]).toMatchObject({
      publicId: "WebhookPublicIdentity12345",
      revokedAt: new Date("2026-07-22T12:30:00.000Z"),
      supersededAt: new Date("2026-07-22T12:45:00.000Z"),
    });
    expect(store.endpoint).toMatchObject({
      publicId: "ReplacementPublicIdentity12345",
      generation: 2,
      activeRevisionId: null,
      replacesEndpointId: "endpoint_1",
      replacementCreatedByUserId: "user_456",
    });

    const activated = await service.activate({
      binding: binding({ credentialVersion: "8" }),
      proposedPublicId: "IgnoredDuringActivation123",
      activatedAt: new Date("2026-07-22T13:00:00.000Z"),
    });
    expect(activated).toMatchObject({
      endpointPublicId: "ReplacementPublicIdentity12345",
      revision: 1,
      changed: true,
    });
  });

  it("rejects replacement before the exact endpoint is revoked", async () => {
    const store = new MemoryStore();
    const service = new ProductionWebhookBindingService(store);
    await service.activate({
      binding: binding(),
      proposedPublicId: "WebhookPublicIdentity12345",
      activatedAt: new Date("2026-07-22T12:00:00.000Z"),
    });

    await expect(
      service.replaceRevoked({
        scope: binding(),
        expectedRevokedPublicId: "WebhookPublicIdentity12345",
        proposedPublicId: "ReplacementPublicIdentity12345",
        actorId: "user_456",
        replacedAt: new Date("2026-07-22T12:45:00.000Z"),
      })
    ).rejects.toBeInstanceOf(ProductionWebhookReplacementRequiresRevocationError);
  });

  it("fingerprints credential versions and never accepts secret values", () => {
    const first = productionWebhookBindingFingerprint(binding({ credentialVersion: "7" }));
    const second = productionWebhookBindingFingerprint(binding({ credentialVersion: "8" }));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(JSON.stringify(binding())).not.toContain("secret");
  });
});
