import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_WEBHOOK_INCIDENT_DRILL_CONFIRMATION,
  runFlowcordiaWebhookIncidentDrill,
  type FlowcordiaWebhookIncidentDrillDependencies,
  type FlowcordiaWebhookIncidentDrillEndpoint,
} from "../../app/features/flowcordia/workflows/webhook/incident-drill";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const predecessor: FlowcordiaWebhookIncidentDrillEndpoint = {
  publicId: "PredecessorPublicIdentity1234567",
  generation: 1,
  method: "POST",
  path: "/incident-drill",
  revision: 1,
  workerVersion: "20260723.1",
  mergeCommitSha: "a".repeat(40),
};

const successor: FlowcordiaWebhookIncidentDrillEndpoint = {
  ...predecessor,
  publicId: "SuccessorPublicIdentity123456789",
  generation: 2,
  revision: 1,
};

function input() {
  return {
    applicationCommitSha: "b".repeat(40),
    workflowId: "incident_drill",
    nodeId: "receive-incident",
    expectedProposalId: "proposal_incident_1",
    expectedMergeCommitSha: "a".repeat(40),
    confirmation: FLOWCORDIA_WEBHOOK_INCIDENT_DRILL_CONFIRMATION,
    deliveryTimeoutMilliseconds: 2_000,
  };
}

function successfulDependencies(overrides: {
  invalidSignatureCreatesLedger?: boolean;
  retiredStatus?: number;
  successorDeliveryStatus?: number;
} = {}): {
  dependencies: FlowcordiaWebhookIncidentDrillDependencies;
  revoked: string[];
} {
  let clock = new Date("2026-07-23T00:00:00.000Z").getTime();
  let activations = 0;
  let replaced = false;
  const revoked: string[] = [];
  const deliveries = new Map<string, { body: string; attempts: number }>();
  const tokens = ["PredecessorToken123", "SuccessorToken456"];

  const dependencies: FlowcordiaWebhookIncidentDrillDependencies = {
    now: () => new Date(clock),
    randomToken: () => tokens.shift() ?? "FallbackToken789",
    sleep: async (milliseconds) => {
      clock += milliseconds;
    },
    activate: async (expectedPublicId) => {
      activations += 1;
      if (activations === 1) return predecessor;
      expect(expectedPublicId).toBe(successor.publicId);
      return successor;
    },
    send: async ({ endpoint, deliveryId, body, signature }) => {
      if (signature === "invalid") {
        if (overrides.invalidSignatureCreatesLedger) {
          deliveries.set(`${endpoint.publicId}:${deliveryId}`, { body, attempts: 1 });
        }
        return { status: 401 };
      }
      if (signature === "none") {
        if (endpoint.publicId === predecessor.publicId && revoked.includes(predecessor.publicId)) {
          return { status: overrides.retiredStatus ?? 404 };
        }
        if (endpoint.publicId === successor.publicId && replaced && activations === 1) {
          return { status: 404 };
        }
        return { status: 404 };
      }
      if (endpoint.publicId === successor.publicId && overrides.successorDeliveryStatus) {
        return { status: overrides.successorDeliveryStatus };
      }
      const key = `${endpoint.publicId}:${deliveryId}`;
      const existing = deliveries.get(key);
      if (existing) return { status: existing.body === body ? 200 : 409 };
      deliveries.set(key, { body, attempts: 1 });
      return { status: 202 };
    },
    observe: async ({ publicId, deliveryId }) => {
      const delivery = deliveries.get(`${publicId}:${deliveryId}`);
      return delivery
        ? { state: "delivered", attempts: delivery.attempts }
        : { state: "missing", attempts: 0 };
    },
    revoke: async (publicId) => {
      revoked.push(publicId);
      return { changed: true };
    },
    replace: async (publicId) => {
      expect(publicId).toBe(predecessor.publicId);
      replaced = true;
      return {
        publicId: successor.publicId,
        generation: successor.generation,
        replacesPublicId: predecessor.publicId,
      };
    },
  };
  return { dependencies, revoked };
}

describe("Flowcordia webhook incident drill", () => {
  it("proves signed delivery, replay safety, revocation, replacement, and recovery", async () => {
    const { dependencies, revoked } = successfulDependencies();
    const result = await runFlowcordiaWebhookIncidentDrill(input(), dependencies);

    expect(result.state).toBe("READY");
    expect(result.phase).toBe("complete");
    expect(result.endpoints).toEqual({
      predecessorReference: expect.stringMatching(/^[0-9a-f]{16}$/),
      predecessorGeneration: 1,
      successorReference: expect.stringMatching(/^[0-9a-f]{16}$/),
      successorGeneration: 2,
    });
    expect(result.deliveries).toEqual([
      {
        reference: expect.stringMatching(/^[0-9a-f]{16}$/),
        endpoint: "predecessor",
        state: "delivered",
        attempts: 1,
      },
      {
        reference: expect.stringMatching(/^[0-9a-f]{16}$/),
        endpoint: "successor",
        state: "delivered",
        attempts: 1,
      },
    ]);
    expect(result.checks.map((check) => check.key)).toEqual([
      "activation.predecessor",
      "signature_rejection",
      "delivery.predecessor",
      "replay.idempotent",
      "replay.conflict",
      "revocation.predecessor",
      "replacement.inactive",
      "activation.successor",
      "delivery.successor",
    ]);
    expect(revoked).toEqual([predecessor.publicId]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(predecessor.publicId);
    expect(serialized).not.toContain(successor.publicId);
    expect(serialized).not.toContain("PredecessorToken123");
    expect(serialized).not.toContain("SuccessorToken456");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("runFriendlyId");
    expect(serialized).not.toContain("actorId");
  });

  it("blocks when an invalid signature creates replay state and revokes the active endpoint", async () => {
    const { dependencies, revoked } = successfulDependencies({
      invalidSignatureCreatesLedger: true,
    });
    const result = await runFlowcordiaWebhookIncidentDrill(input(), dependencies);

    expect(result.state).toBe("BLOCKED");
    expect(result.phase).toBe("signature_rejection");
    expect(result.checks).toContainEqual({
      key: "signature_rejection.replay_ledger",
      state: "BLOCKED",
      message: "An invalid signature created durable replay state.",
    });
    expect(result.checks).toContainEqual({
      key: "cleanup.revoked_active_endpoint",
      state: "READY",
      message: "The active endpoint was revoked after the failed drill.",
    });
    expect(revoked).toEqual([predecessor.publicId]);
  });

  it("blocks if a permanently revoked predecessor URL remains reachable", async () => {
    const { dependencies } = successfulDependencies({ retiredStatus: 202 });
    const result = await runFlowcordiaWebhookIncidentDrill(input(), dependencies);

    expect(result.state).toBe("BLOCKED");
    expect(result.phase).toBe("revocation");
    expect(result.endpoints.successorReference).toBeNull();
    expect(result.checks.at(-1)).toMatchObject({
      key: "revocation.retired_url",
      state: "BLOCKED",
    });
  });

  it("revokes an activated successor when recovery delivery cannot be confirmed", async () => {
    const { dependencies, revoked } = successfulDependencies({ successorDeliveryStatus: 503 });
    const result = await runFlowcordiaWebhookIncidentDrill(input(), dependencies);

    expect(result.state).toBe("BLOCKED");
    expect(result.phase).toBe("successor_delivery");
    expect(revoked).toEqual([predecessor.publicId, successor.publicId]);
    expect(result.checks).toContainEqual({
      key: "cleanup.revoked_active_endpoint",
      state: "READY",
      message: "The active endpoint was revoked after the failed drill.",
    });
  });

  it("rejects execution without the exact destructive confirmation", async () => {
    const { dependencies } = successfulDependencies();
    await expect(
      runFlowcordiaWebhookIncidentDrill({ ...input(), confirmation: "wrong" }, dependencies)
    ).rejects.toThrow("Webhook incident drill confirmation is invalid.");
  });

  it("keeps the live adapter exact-key, version-bound, externally routed, and secret-free", () => {
    const server = source(
      "../../app/features/flowcordia/workflows/webhook/incident-drill.server.ts"
    );
    const cli = source("../../scripts/flowcordia-webhook-incident-drill.ts");

    expect(server).toContain("resolveWorkflowIndexScope");
    expect(server).toContain("activateFlowcordiaProductionWebhook");
    expect(server).toContain("revokeFlowcordiaProductionWebhook");
    expect(server).toContain("replaceFlowcordiaProductionWebhook");
    expect(server).toContain("getVariableValuesForKeys");
    expect(server).toContain("credentialVersion");
    expect(server).toContain("signFlowcordiaWebhook");
    expect(server).toContain("flowcordiaPublicWebhookUrl");
    expect(server).toContain("redirect: \"error\"");
    expect(server).toContain("webhookEndpointId: endpoint.id");
    expect(server).not.toContain("runFriendlyId");
    expect(server).not.toContain("payloadHash: true");
    expect(server).not.toContain("failureCode: true");
    expect(cli).toContain("presentFlowcordiaInstallationPreflight");
    expect(cli).toContain("profile: \"release\"");
    expect(cli).toContain("FLOWCORDIA_WEBHOOK_INCIDENT_DRILL_CONFIRMATION");
    expect(cli).toContain("failed safely");
  });
});
