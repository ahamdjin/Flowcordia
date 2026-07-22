import { createHash } from "node:crypto";

export const FLOWCORDIA_WEBHOOK_INCIDENT_DRILL_CONFIRMATION =
  "EXECUTE_EXACT_FLOWCORDIA_WEBHOOK_INCIDENT_DRILL" as const;

export type FlowcordiaWebhookIncidentDrillState = "READY" | "BLOCKED" | "UNAVAILABLE";
export type FlowcordiaWebhookIncidentDrillCheckState = "READY" | "BLOCKED";
export type FlowcordiaWebhookIncidentDrillPhase =
  | "activation"
  | "signature_rejection"
  | "delivery"
  | "replay"
  | "conflict"
  | "revocation"
  | "replacement"
  | "successor_activation"
  | "successor_delivery"
  | "cleanup"
  | "complete";

export interface FlowcordiaWebhookIncidentDrillEndpoint {
  publicId: string;
  generation: number;
  method: string;
  path: string;
  revision: number;
  workerVersion: string;
  mergeCommitSha: string;
}

export interface FlowcordiaWebhookIncidentDrillDeliveryObservation {
  state: "missing" | "processing" | "delivered" | "failed";
  attempts: number;
}

export interface FlowcordiaWebhookIncidentDrillDependencies {
  now(): Date;
  randomToken(): string;
  sleep(milliseconds: number): Promise<void>;
  activate(expectedPublicId?: string): Promise<FlowcordiaWebhookIncidentDrillEndpoint>;
  send(input: {
    endpoint: Pick<FlowcordiaWebhookIncidentDrillEndpoint, "publicId" | "method" | "path">;
    deliveryId: string;
    body: string;
    signature: "valid" | "invalid" | "none";
  }): Promise<{ status: number }>;
  observe(input: {
    publicId: string;
    deliveryId: string;
  }): Promise<FlowcordiaWebhookIncidentDrillDeliveryObservation>;
  revoke(publicId: string): Promise<{ changed: boolean }>;
  replace(publicId: string): Promise<{
    publicId: string;
    generation: number;
    replacesPublicId: string;
  }>;
}

export interface FlowcordiaWebhookIncidentDrillInput {
  applicationCommitSha: string;
  workflowId: string;
  nodeId: string;
  expectedProposalId: string;
  expectedMergeCommitSha: string;
  confirmation: string;
  deliveryTimeoutMilliseconds?: number;
}

export interface FlowcordiaWebhookIncidentDrillCheck {
  key: string;
  state: FlowcordiaWebhookIncidentDrillCheckState;
  message: string;
}

export interface FlowcordiaWebhookIncidentDrillProjection {
  schemaVersion: "0.1";
  state: FlowcordiaWebhookIncidentDrillState;
  phase: FlowcordiaWebhookIncidentDrillPhase;
  checkedAt: string;
  applicationCommitSha: string;
  workflow: {
    workflowId: string;
    nodeId: string;
    proposalId: string;
    mergeCommitSha: string;
  };
  endpoints: {
    predecessorReference: string | null;
    predecessorGeneration: number | null;
    successorReference: string | null;
    successorGeneration: number | null;
  };
  deliveries: Array<{
    reference: string;
    endpoint: "predecessor" | "successor";
    state: "delivered";
    attempts: number;
  }>;
  checks: FlowcordiaWebhookIncidentDrillCheck[];
  message: string;
}

class IncidentDrillBlockedError extends Error {
  constructor(
    readonly phase: FlowcordiaWebhookIncidentDrillPhase,
    readonly key: string,
    message: string
  ) {
    super(message);
    this.name = "IncidentDrillBlockedError";
  }
}

const GIT_SHA = /^[0-9a-f]{40}$/;
const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const PROPOSAL_ID = /^[A-Za-z0-9_-]{1,255}$/;
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

function reference(kind: string, value: string): string {
  return createHash("sha256").update(`flowcordia:${kind}:v1:${value}`, "utf8").digest("hex").slice(0, 16);
}

function validate(input: FlowcordiaWebhookIncidentDrillInput): number {
  if (input.confirmation !== FLOWCORDIA_WEBHOOK_INCIDENT_DRILL_CONFIRMATION) {
    throw new TypeError("Webhook incident drill confirmation is invalid.");
  }
  if (!GIT_SHA.test(input.applicationCommitSha)) {
    throw new TypeError("Application commit SHA is invalid.");
  }
  if (!WORKFLOW_ID.test(input.workflowId)) throw new TypeError("Workflow ID is invalid.");
  if (!NODE_ID.test(input.nodeId)) throw new TypeError("Webhook node ID is invalid.");
  if (!PROPOSAL_ID.test(input.expectedProposalId)) throw new TypeError("Proposal ID is invalid.");
  if (!GIT_SHA.test(input.expectedMergeCommitSha)) {
    throw new TypeError("Merge commit SHA is invalid.");
  }
  const timeout = input.deliveryTimeoutMilliseconds ?? 15_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 60_000) {
    throw new TypeError("Delivery observation timeout is invalid.");
  }
  return timeout;
}

function assertStatus(
  phase: FlowcordiaWebhookIncidentDrillPhase,
  key: string,
  status: number,
  allowed: readonly number[],
  message: string
): void {
  if (!allowed.includes(status)) throw new IncidentDrillBlockedError(phase, key, message);
}

async function observeDelivered(input: {
  dependencies: FlowcordiaWebhookIncidentDrillDependencies;
  publicId: string;
  deliveryId: string;
  timeoutMilliseconds: number;
  phase: FlowcordiaWebhookIncidentDrillPhase;
}): Promise<FlowcordiaWebhookIncidentDrillDeliveryObservation> {
  const startedAt = input.dependencies.now().getTime();
  while (input.dependencies.now().getTime() - startedAt <= input.timeoutMilliseconds) {
    const observation = await input.dependencies.observe({
      publicId: input.publicId,
      deliveryId: input.deliveryId,
    });
    if (observation.state === "delivered") return observation;
    if (observation.state === "failed") {
      throw new IncidentDrillBlockedError(
        input.phase,
        `${input.phase}.delivery_failed`,
        "The signed webhook delivery reached a failed ledger state."
      );
    }
    await input.dependencies.sleep(250);
  }
  throw new IncidentDrillBlockedError(
    input.phase,
    `${input.phase}.delivery_timeout`,
    "The signed webhook delivery did not reach its durable delivered state in time."
  );
}

function ready(key: string, message: string): FlowcordiaWebhookIncidentDrillCheck {
  return { key, state: "READY", message };
}

export async function runFlowcordiaWebhookIncidentDrill(
  input: FlowcordiaWebhookIncidentDrillInput,
  dependencies: FlowcordiaWebhookIncidentDrillDependencies
): Promise<FlowcordiaWebhookIncidentDrillProjection> {
  const timeoutMilliseconds = validate(input);
  const checkedAt = dependencies.now();
  const checks: FlowcordiaWebhookIncidentDrillCheck[] = [];
  const deliveries: FlowcordiaWebhookIncidentDrillProjection["deliveries"] = [];
  let predecessor: FlowcordiaWebhookIncidentDrillEndpoint | null = null;
  let successor: FlowcordiaWebhookIncidentDrillEndpoint | null = null;
  let activePublicId: string | null = null;
  let phase: FlowcordiaWebhookIncidentDrillPhase = "activation";

  const projection = (
    state: FlowcordiaWebhookIncidentDrillState,
    message: string
  ): FlowcordiaWebhookIncidentDrillProjection => ({
    schemaVersion: "0.1",
    state,
    phase: state === "READY" ? "complete" : phase,
    checkedAt: checkedAt.toISOString(),
    applicationCommitSha: input.applicationCommitSha,
    workflow: {
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      proposalId: input.expectedProposalId,
      mergeCommitSha: input.expectedMergeCommitSha,
    },
    endpoints: {
      predecessorReference: predecessor ? reference("webhook-endpoint", predecessor.publicId) : null,
      predecessorGeneration: predecessor?.generation ?? null,
      successorReference: successor ? reference("webhook-endpoint", successor.publicId) : null,
      successorGeneration: successor?.generation ?? null,
    },
    deliveries,
    checks,
    message,
  });

  try {
    predecessor = await dependencies.activate();
    activePublicId = predecessor.publicId;
    if (predecessor.mergeCommitSha !== input.expectedMergeCommitSha) {
      throw new IncidentDrillBlockedError(
        "activation",
        "activation.commit_mismatch",
        "The activated endpoint did not bind the expected promoted commit."
      );
    }
    checks.push(ready("activation.predecessor", "The exact promoted webhook generation is active."));

    const predecessorToken = dependencies.randomToken();
    if (!TOKEN.test(predecessorToken)) throw new TypeError("Incident drill token is invalid.");
    const predecessorDeliveryId = `flowcordia-drill-${predecessorToken}`;
    const predecessorBody = JSON.stringify({
      flowcordiaDrill: { schemaVersion: "0.1", phase: "predecessor", token: predecessorToken },
    });

    phase = "signature_rejection";
    const invalidSignatureId = `${predecessorDeliveryId}-invalid`;
    const invalidSignature = await dependencies.send({
      endpoint: predecessor,
      deliveryId: invalidSignatureId,
      body: predecessorBody,
      signature: "invalid",
    });
    assertStatus(
      phase,
      "signature_rejection.http",
      invalidSignature.status,
      [401],
      "The active endpoint did not reject an invalid HMAC signature."
    );
    await dependencies.sleep(250);
    const invalidObservation = await dependencies.observe({
      publicId: predecessor.publicId,
      deliveryId: invalidSignatureId,
    });
    if (invalidObservation.state !== "missing") {
      throw new IncidentDrillBlockedError(
        phase,
        "signature_rejection.replay_ledger",
        "An invalid signature created durable replay state."
      );
    }
    checks.push(ready("signature_rejection", "Invalid signatures are rejected before replay ownership."));

    phase = "delivery";
    const firstDelivery = await dependencies.send({
      endpoint: predecessor,
      deliveryId: predecessorDeliveryId,
      body: predecessorBody,
      signature: "valid",
    });
    assertStatus(
      phase,
      "delivery.predecessor_http",
      firstDelivery.status,
      [200, 202],
      "The predecessor did not accept the signed delivery."
    );
    const predecessorObservation = await observeDelivered({
      dependencies,
      publicId: predecessor.publicId,
      deliveryId: predecessorDeliveryId,
      timeoutMilliseconds,
      phase,
    });
    if (predecessorObservation.attempts !== 1) {
      throw new IncidentDrillBlockedError(
        phase,
        "delivery.predecessor_attempts",
        "The first predecessor delivery did not retain a single replay attempt."
      );
    }
    deliveries.push({
      reference: reference("webhook-delivery", predecessorDeliveryId),
      endpoint: "predecessor",
      state: "delivered",
      attempts: predecessorObservation.attempts,
    });
    checks.push(ready("delivery.predecessor", "A signed predecessor delivery reached durable delivery evidence."));

    phase = "replay";
    const replay = await dependencies.send({
      endpoint: predecessor,
      deliveryId: predecessorDeliveryId,
      body: predecessorBody,
      signature: "valid",
    });
    assertStatus(
      phase,
      "replay.http",
      replay.status,
      [200, 202],
      "The exact replay did not return the accepted idempotent response."
    );
    const replayObservation = await dependencies.observe({
      publicId: predecessor.publicId,
      deliveryId: predecessorDeliveryId,
    });
    if (replayObservation.state !== "delivered" || replayObservation.attempts !== 1) {
      throw new IncidentDrillBlockedError(
        phase,
        "replay.ownership",
        "The exact replay changed durable trigger ownership."
      );
    }
    checks.push(ready("replay.idempotent", "The same delivery and payload remain single-owner and idempotent."));

    phase = "conflict";
    const conflict = await dependencies.send({
      endpoint: predecessor,
      deliveryId: predecessorDeliveryId,
      body: JSON.stringify({
        flowcordiaDrill: { schemaVersion: "0.1", phase: "conflict", token: predecessorToken },
      }),
      signature: "valid",
    });
    assertStatus(
      phase,
      "conflict.http",
      conflict.status,
      [409],
      "The same delivery ID with a different payload was not rejected."
    );
    checks.push(ready("replay.conflict", "A payload mismatch for the same delivery identity is rejected."));

    phase = "revocation";
    await dependencies.revoke(predecessor.publicId);
    activePublicId = null;
    const retired = await dependencies.send({
      endpoint: predecessor,
      deliveryId: `${predecessorDeliveryId}-retired`,
      body: predecessorBody,
      signature: "none",
    });
    assertStatus(
      phase,
      "revocation.retired_url",
      retired.status,
      [404],
      "The permanently revoked predecessor URL remained reachable."
    );
    checks.push(ready("revocation.predecessor", "The predecessor public URL is permanently unavailable."));

    phase = "replacement";
    const replacement = await dependencies.replace(predecessor.publicId);
    if (
      replacement.replacesPublicId !== predecessor.publicId ||
      replacement.generation !== predecessor.generation + 1
    ) {
      throw new IncidentDrillBlockedError(
        phase,
        "replacement.generation",
        "The replacement did not create the next immutable endpoint generation."
      );
    }
    successor = {
      ...predecessor,
      publicId: replacement.publicId,
      generation: replacement.generation,
      revision: 0,
    };
    const inactiveSuccessor = await dependencies.send({
      endpoint: successor,
      deliveryId: `${predecessorDeliveryId}-inactive-successor`,
      body: predecessorBody,
      signature: "none",
    });
    assertStatus(
      phase,
      "replacement.inactive",
      inactiveSuccessor.status,
      [404],
      "The replacement endpoint was reachable before exact activation."
    );
    checks.push(ready("replacement.inactive", "The successor begins inactive with a new public identity."));

    phase = "successor_activation";
    successor = await dependencies.activate(replacement.publicId);
    activePublicId = successor.publicId;
    if (
      successor.publicId !== replacement.publicId ||
      successor.generation !== replacement.generation ||
      successor.mergeCommitSha !== input.expectedMergeCommitSha
    ) {
      throw new IncidentDrillBlockedError(
        phase,
        "successor_activation.identity",
        "The successor activation did not bind the exact replacement and promoted commit."
      );
    }
    checks.push(ready("activation.successor", "The successor passed the existing exact deployment activation gate."));

    phase = "successor_delivery";
    const successorToken = dependencies.randomToken();
    if (!TOKEN.test(successorToken)) throw new TypeError("Incident drill token is invalid.");
    const successorDeliveryId = `flowcordia-drill-${successorToken}`;
    const successorBody = JSON.stringify({
      flowcordiaDrill: { schemaVersion: "0.1", phase: "successor", token: successorToken },
    });
    const successorResponse = await dependencies.send({
      endpoint: successor,
      deliveryId: successorDeliveryId,
      body: successorBody,
      signature: "valid",
    });
    assertStatus(
      phase,
      "successor_delivery.http",
      successorResponse.status,
      [200, 202],
      "The activated successor did not accept a signed delivery."
    );
    const successorObservation = await observeDelivered({
      dependencies,
      publicId: successor.publicId,
      deliveryId: successorDeliveryId,
      timeoutMilliseconds,
      phase,
    });
    if (successorObservation.attempts !== 1) {
      throw new IncidentDrillBlockedError(
        phase,
        "successor_delivery.attempts",
        "The first successor delivery did not retain a single replay attempt."
      );
    }
    deliveries.push({
      reference: reference("webhook-delivery", successorDeliveryId),
      endpoint: "successor",
      state: "delivered",
      attempts: successorObservation.attempts,
    });
    checks.push(ready("delivery.successor", "A signed successor delivery reached durable delivery evidence."));

    phase = "complete";
    return projection(
      "READY",
      "The configured webhook incident drill proved signed delivery, replay safety, permanent revocation, replacement isolation, and successor recovery."
    );
  } catch (error) {
    const blocked = error instanceof IncidentDrillBlockedError;
    phase = blocked ? error.phase : phase;
    checks.push({
      key: blocked ? error.key : `${phase}.unavailable`,
      state: "BLOCKED",
      message: blocked ? error.message : "The configured webhook incident drill became unavailable safely.",
    });
    if (activePublicId) {
      try {
        await dependencies.revoke(activePublicId);
        checks.push(ready("cleanup.revoked_active_endpoint", "The active endpoint was revoked after the failed drill."));
      } catch {
        phase = "cleanup";
        checks.push({
          key: "cleanup.revocation_failed",
          state: "BLOCKED",
          message: "The failed drill could not confirm emergency revocation of its active endpoint.",
        });
        return projection(
          "UNAVAILABLE",
          "The webhook incident drill failed and cleanup could not be confirmed."
        );
      }
    }
    return projection(
      blocked ? "BLOCKED" : "UNAVAILABLE",
      blocked
        ? "The configured webhook incident drill found a release-blocking webhook lifecycle condition."
        : "The configured webhook incident drill failed safely without exposing raw evidence."
    );
  }
}
