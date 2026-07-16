import { createHmac } from "node:crypto";

import type { JsonValue, LeasedOutboxEvent } from "../types.js";
import type { OutboxPublisher } from "./dispatcher.js";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status">>;

interface HttpOutboxPublisherOptions {
  url: string;
  secret: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  fetch?: FetchLike;
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function boundedTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 250 || value > 120_000) {
    throw new TypeError("Publisher timeout must be an integer between 250 and 120000.");
  }
  return value;
}

function publisherUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Proposal event URL is invalid.");
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new TypeError("Proposal event URL must use HTTPS (HTTP is allowed only on loopback).");
  }
  if (url.username || url.password || url.hash) {
    throw new TypeError("Proposal event URL cannot contain credentials or a fragment.");
  }
  return url;
}

export class HttpOutboxPublisher implements OutboxPublisher {
  readonly #url: URL;
  readonly #secret: string;
  readonly #timeoutMs: number;
  readonly #maxBodyBytes: number;
  readonly #fetch: FetchLike;

  constructor(options: HttpOutboxPublisherOptions) {
    if (!options || typeof options.url !== "string") {
      throw new TypeError("HTTP outbox publisher requires an event URL.");
    }
    if (
      typeof options.secret !== "string" ||
      options.secret.length < 32 ||
      options.secret.length > 4096
    ) {
      throw new TypeError("Proposal event secret must contain between 32 and 4096 characters.");
    }
    this.#url = publisherUrl(options.url);
    this.#secret = options.secret;
    this.#timeoutMs = boundedTimeout(options.timeoutMs ?? 10_000);
    this.#maxBodyBytes = boundedBodyBytes(options.maxBodyBytes ?? 256 * 1024);
    this.#fetch = options.fetch ?? fetch;
  }

  async publish(event: LeasedOutboxEvent, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const envelope = canonicalize({
      version: "1",
      id: event.id,
      dedupeKey: event.dedupeKey,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      tenantId: event.tenantId,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload,
    });
    const body = JSON.stringify(envelope);
    if (Buffer.byteLength(body, "utf8") > this.#maxBodyBytes) {
      throw new Error("Proposal event exceeds the configured delivery size limit.");
    }
    const signature = createHmac("sha256", this.#secret).update(body, "utf8").digest("hex");
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new Error("Proposal event delivery timed out.")),
      this.#timeoutMs
    );
    try {
      const response = await this.#fetch(this.#url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "user-agent": "flowcordia-proposal-worker/1",
          "x-flowcordia-event-id": event.id,
          "x-flowcordia-event-type": event.eventType,
          "x-flowcordia-idempotency-key": event.dedupeKey,
          "x-flowcordia-signature": `sha256=${signature}`,
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`Proposal event endpoint returned HTTP ${response.status}.`);
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

function boundedBodyBytes(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1_024 || value > 1024 * 1024) {
    throw new TypeError("Publisher body limit must be an integer between 1024 and 1048576.");
  }
  return value;
}
