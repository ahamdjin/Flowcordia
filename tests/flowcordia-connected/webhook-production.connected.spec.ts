import { expect, test, type Locator, type Page } from "@playwright/test";
import { signFlowcordiaWebhook } from "@flowcordia/runtime";
import {
  parseFlowcordiaWebhookAcceptanceEnvironment,
  webhookAcceptanceFailure,
  type FlowcordiaWebhookAcceptanceConfig,
  type FlowcordiaWebhookAcceptanceEvidence,
  type FlowcordiaWebhookAcceptanceStage,
} from "../../apps/webapp/app/features/flowcordia/acceptance/webhook-production-contract";
import { FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION } from "../../apps/webapp/app/features/flowcordia/workflows/webhook/activation-command";
import { FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION } from "../../apps/webapp/app/features/flowcordia/workflows/webhook/replacement-command";
import { FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION } from "../../apps/webapp/app/features/flowcordia/workflows/webhook/revocation-command";
import { writeFlowcordiaWebhookAcceptanceEvidence } from "./webhook-production-evidence";

const WORKFLOW_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const ACTIVE = "ACTIVE";
const INACTIVE = "INACTIVE";
const REVOKED = "REVOKED";

interface ActiveEndpoint {
  publicId: string;
  publicUrl: string;
  generation: number;
  revision: number;
}

function fallbackWorkflowId(): string {
  const value = process.env.FLOWCORDIA_WEBHOOK_ACCEPTANCE_WORKFLOW_ID?.trim() ?? "";
  return WORKFLOW_ID.test(value) ? value : "invalid_workflow";
}

function positiveInteger(value: string | null, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} is invalid.`);
  return parsed;
}

async function bindingState(card: Locator): Promise<string> {
  return (await card.getAttribute("data-binding-state")) ?? "";
}

async function waitForState(card: Locator, state: string, timeout: number): Promise<void> {
  await expect
    .poll(() => bindingState(card), { timeout, intervals: [1_000, 2_000, 3_000, 5_000] })
    .toBe(state);
}

async function replaceRevoked(page: Page, card: Locator, nodeId: string, timeout: number) {
  await page.getByTestId(`flowcordia-replace-webhook-${nodeId}`).click();
  await page
    .getByTestId("flowcordia-webhook-replacement-confirmation")
    .fill(FLOWCORDIA_WEBHOOK_REPLACEMENT_CONFIRMATION);
  await expect(page.getByTestId("flowcordia-webhook-replacement-confirm")).toBeEnabled();
  await page.getByTestId("flowcordia-webhook-replacement-confirm").click();
  await waitForState(card, INACTIVE, timeout);
}

async function activateEndpoint(page: Page, card: Locator, nodeId: string, timeout: number) {
  if ((await bindingState(card)) === REVOKED) await replaceRevoked(page, card, nodeId, timeout);
  await page.getByTestId(`flowcordia-activate-webhook-${nodeId}`).click();
  await page
    .getByTestId("flowcordia-webhook-activation-confirmation")
    .fill(FLOWCORDIA_WEBHOOK_ACTIVATION_CONFIRMATION);
  await expect(page.getByTestId("flowcordia-webhook-activation-confirm")).toBeEnabled();
  await page.getByTestId("flowcordia-webhook-activation-confirm").click();
  await waitForState(card, ACTIVE, timeout);
  const publicId = (await card.getAttribute("data-endpoint-public-id")) ?? "";
  const publicUrl = (await card.getAttribute("data-public-url")) ?? "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(publicId)) throw new Error("Active endpoint identity is invalid.");
  const parsedUrl = new URL(publicUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
    throw new Error("Active webhook URL is invalid.");
  }
  return {
    publicId,
    publicUrl,
    generation: positiveInteger(await card.getAttribute("data-generation"), "Endpoint generation"),
    revision: positiveInteger(await card.getAttribute("data-revision"), "Endpoint revision"),
  } satisfies ActiveEndpoint;
}

async function signedRequest(input: {
  endpoint: ActiveEndpoint;
  secret: string;
  body: string;
  deliveryId: string;
  signature?: string;
}): Promise<{ status: number; value: unknown }> {
  const timestampSeconds = Math.floor(Date.now() / 1_000);
  const signature =
    input.signature ??
    signFlowcordiaWebhook({
      body: input.body,
      timestampSeconds,
      deliveryId: input.deliveryId,
      secret: input.secret,
    });
  const response = await fetch(input.endpoint.publicUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      "x-flowcordia-signature": signature,
      "x-flowcordia-timestamp": String(timestampSeconds),
      "x-flowcordia-delivery": input.deliveryId,
    },
    body: input.body,
  });
  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    // Bounded status remains authoritative when a reverse proxy returns no JSON body.
  }
  return { status: response.status, value };
}

function accepted(result: { status: number; value: unknown }): asserts result is {
  status: 200 | 202;
  value: { accepted: true };
} {
  if (
    ![200, 202].includes(result.status) ||
    !result.value ||
    typeof result.value !== "object" ||
    (result.value as { accepted?: unknown }).accepted !== true
  ) {
    throw new Error(`Signed webhook delivery returned unexpected status ${result.status}.`);
  }
}

async function revokedRequest(input: {
  endpoint: ActiveEndpoint;
  secret: string;
  body: string;
  deliveryId: string;
}): Promise<number> {
  const result = await signedRequest(input);
  if (result.status !== 404) throw new Error(`Revoked endpoint returned ${result.status}.`);
  return 404;
}

test("prove signed production webhook activation, incident revocation, and replacement", async ({
  page,
}) => {
  const startedAt = new Date().toISOString();
  const fallbackEvidencePath =
    process.env.FLOWCORDIA_WEBHOOK_ACCEPTANCE_EVIDENCE_PATH ??
    "/tmp/flowcordia-webhook-acceptance/evidence.json";
  let config: FlowcordiaWebhookAcceptanceConfig | null = null;
  let evidence: FlowcordiaWebhookAcceptanceEvidence | null = null;
  let stage: Exclude<FlowcordiaWebhookAcceptanceStage, "complete"> = "configuration";

  try {
    config = parseFlowcordiaWebhookAcceptanceEnvironment(process.env);
    test.setTimeout(config.timeoutMs + 180_000);
    const body = JSON.stringify(config.payload);

    stage = "navigation";
    await page.goto(config.studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const route = page.getByTestId("flowcordia-studio-route");
    await expect(route).toBeVisible();
    await expect(route).toHaveAttribute("data-connected", "true");

    stage = "identity";
    await expect(route).toHaveAttribute(
      "data-application-commit",
      config.expectedApplicationCommitSha
    );
    await expect(page.getByTestId("flowcordia-production-webhooks")).toBeVisible();
    const card = page.getByTestId(`flowcordia-production-webhook-${config.nodeId}`);
    await expect(card).toBeVisible();

    stage = "activation";
    const original = await activateEndpoint(page, card, config.nodeId, config.timeoutMs);

    stage = "delivery";
    const originalDeliveryId = `accept-${Date.now().toString(36)}`;
    const first = await signedRequest({
      endpoint: original,
      secret: config.hmacSecret,
      body,
      deliveryId: originalDeliveryId,
    });
    accepted(first);

    stage = "replay";
    const replay = await signedRequest({
      endpoint: original,
      secret: config.hmacSecret,
      body,
      deliveryId: originalDeliveryId,
    });
    accepted(replay);

    stage = "invalid_signature";
    const invalid = await signedRequest({
      endpoint: original,
      secret: config.hmacSecret,
      body,
      deliveryId: `${originalDeliveryId}-invalid`,
      signature: `v1=${"0".repeat(64)}`,
    });
    expect(invalid.status).toBe(401);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(card).toContainText("DELIVERED", { timeout: config.timeoutMs });

    stage = "revocation";
    await page.getByTestId(`flowcordia-revoke-webhook-${config.nodeId}`).click();
    await page.getByTestId("flowcordia-webhook-revocation-reason").selectOption(
      "manual_emergency_stop"
    );
    await page
      .getByTestId("flowcordia-webhook-revocation-confirmation")
      .fill(FLOWCORDIA_WEBHOOK_REVOCATION_CONFIRMATION);
    await expect(page.getByTestId("flowcordia-webhook-revocation-confirm")).toBeEnabled();
    await page.getByTestId("flowcordia-webhook-revocation-confirm").click();
    await waitForState(card, REVOKED, config.timeoutMs);

    stage = "predecessor_closed";
    const revokedPredecessorStatus = await revokedRequest({
      endpoint: original,
      secret: config.hmacSecret,
      body,
      deliveryId: `${originalDeliveryId}-revoked`,
    });

    stage = "replacement";
    await replaceRevoked(page, card, config.nodeId, config.timeoutMs);
    const replacementPublicId = (await card.getAttribute("data-endpoint-public-id")) ?? "";
    const replacementGeneration = positiveInteger(
      await card.getAttribute("data-generation"),
      "Replacement generation"
    );
    if (replacementPublicId === original.publicId || replacementGeneration !== original.generation + 1) {
      throw new Error("Replacement endpoint did not create the next immutable identity generation.");
    }
    expect(await card.getAttribute("data-public-url")).toBe("");

    stage = "successor_activation";
    const replacement = await activateEndpoint(page, card, config.nodeId, config.timeoutMs);
    if (
      replacement.publicId !== replacementPublicId ||
      replacement.generation !== replacementGeneration
    ) {
      throw new Error("Successor activation changed the replacement endpoint identity.");
    }

    stage = "successor_delivery";
    const successor = await signedRequest({
      endpoint: replacement,
      secret: config.hmacSecret,
      body,
      deliveryId: `${originalDeliveryId}-successor`,
    });
    accepted(successor);
    const predecessorAfterSuccessorStatus = await revokedRequest({
      endpoint: original,
      secret: config.hmacSecret,
      body,
      deliveryId: `${originalDeliveryId}-predecessor`,
    });

    evidence = {
      schemaVersion: "0.1",
      mode: "webhook_production",
      result: "PASSED",
      stage: "complete",
      workflowId: config.workflowId,
      applicationCommitSha: config.expectedApplicationCommitSha,
      startedAt,
      completedAt: new Date().toISOString(),
      webhook: {
        originalGeneration: original.generation,
        originalRevision: original.revision,
        firstDeliveryStatus: first.status,
        replayStatus: replay.status,
        invalidSignatureStatus: 401,
        revokedPredecessorStatus,
        replacementGeneration: replacement.generation,
        replacementRevision: replacement.revision,
        successorDeliveryStatus: successor.status,
        predecessorAfterSuccessorStatus,
      },
    };
  } finally {
    try {
      await page.evaluate(() => window.sessionStorage.clear());
    } catch {
      // Browser cleanup must not replace the primary acceptance result.
    }
    await writeFlowcordiaWebhookAcceptanceEvidence(
      config?.evidencePath ?? fallbackEvidencePath,
      evidence ??
        webhookAcceptanceFailure({
          stage,
          workflowId: config?.workflowId ?? fallbackWorkflowId(),
          startedAt,
          completedAt: new Date().toISOString(),
        })
    );
  }
});
