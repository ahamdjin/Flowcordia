import { createHash } from "node:crypto";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  WebhookReplayMismatchError,
  WebhookIngestionService,
  normalizeGitHubWebhook,
} from "@flowcordia/control-plane";
import { flowcordiaProposalStore } from "~/features/flowcordia/proposals/prisma.server";
import { githubApp } from "~/services/gitHub.server";
import { logger } from "~/services/logger.server";

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const ingestion = new WebhookIngestionService({ store: flowcordiaProposalStore });

async function rawPayload(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    throw new Response("Webhook payload is too large", { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_WEBHOOK_BYTES) {
    throw new Response("Webhook payload is too large", { status: 413 });
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function action({ request }: ActionFunctionArgs) {
  if (!githubApp) return json({ accepted: false, reason: "github_app_disabled" }, 503);
  const signature = request.headers.get("x-hub-signature-256");
  const eventName = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");
  if (!signature || !eventName || !deliveryId) {
    return json({ accepted: false, reason: "missing_headers" }, 400);
  }

  let payload: string;
  try {
    payload = await rawPayload(request);
  } catch (error) {
    if (error instanceof Response) throw error;
    return json({ accepted: false, reason: "invalid_utf8" }, 400);
  }
  let verified = false;
  try {
    verified = await githubApp.webhooks.verify(payload, signature);
  } catch {
    // Treat malformed signatures exactly like a validly shaped mismatch.
  }
  if (!verified) {
    return json({ accepted: false, reason: "invalid_signature" }, 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return json({ accepted: false, reason: "invalid_json" }, 400);
  }
  const normalized = normalizeGitHubWebhook(eventName, parsed);
  if (!normalized.success) {
    logger.warn("Flowcordia rejected a verified GitHub webhook payload", {
      deliveryId,
      eventName,
      reason: normalized.error,
    });
    return json({ accepted: false, reason: "invalid_payload" }, 422);
  }
  if (!normalized.supported) {
    return json({ accepted: true, status: "unsupported" }, 202);
  }

  const payloadHash = createHash("sha256").update(payload, "utf8").digest("hex");
  try {
    const result = await ingestion.ingest({
      deliveryId,
      payloadHash,
      receivedAt: new Date(),
      event: normalized.value,
    });
    return json({ accepted: true, status: result.status }, 202);
  } catch (error) {
    logger.error("Flowcordia GitHub webhook ingestion failed", {
      deliveryId,
      eventName,
      error: error instanceof Error ? error.message : "Unknown ingestion failure",
    });
    return json(
      {
        accepted: false,
        reason:
          error instanceof WebhookReplayMismatchError
            ? "delivery_replay_mismatch"
            : "ingestion_failed",
      },
      error instanceof WebhookReplayMismatchError ? 409 : 503
    );
  }
}
