import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpOutboxPublisher, type LeasedOutboxEvent } from "../src/index.js";
import { NOW } from "./fixtures.js";

const SECRET = "enterprise-test-secret-with-32-characters";

afterEach(() => vi.useRealTimers());

function event(): LeasedOutboxEvent {
  return {
    id: "outbox_1",
    dedupeKey: "proposal:event:1",
    eventType: "proposal.reconciliation.completed",
    aggregateType: "flowcordia.workflow_proposal",
    aggregateId: "stored_1",
    tenantId: "tenant_1",
    payload: { z: true, proposalId: "proposal_0001", nested: { b: 2, a: 1 } },
    occurredAt: NOW,
    availableAt: NOW,
    attempts: 7,
    lockToken: "private-lock-token",
    lockExpiresAt: new Date(NOW.getTime() + 60_000),
  };
}

describe("HttpOutboxPublisher", () => {
  it("signs a canonical secret-free envelope with idempotency headers", async () => {
    const calls: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push([input, init]);
      return { ok: true, status: 202 };
    });
    const publisher = new HttpOutboxPublisher({
      url: "https://events.example.test/flowcordia",
      secret: SECRET,
      fetch,
    });
    await publisher.publish(event());

    const [, init] = calls[0]!;
    const body = String(init?.body);
    const headers = init?.headers as Record<string, string>;
    expect(JSON.parse(body)).toEqual({
      aggregateId: "stored_1",
      aggregateType: "flowcordia.workflow_proposal",
      dedupeKey: "proposal:event:1",
      eventType: "proposal.reconciliation.completed",
      id: "outbox_1",
      occurredAt: NOW.toISOString(),
      payload: { nested: { a: 1, b: 2 }, proposalId: "proposal_0001", z: true },
      tenantId: "tenant_1",
      version: "1",
    });
    expect(body).not.toContain("private-lock-token");
    expect(body).not.toContain("attempts");
    expect(headers["x-flowcordia-idempotency-key"]).toBe("proposal:event:1");
    expect(headers["x-flowcordia-signature"]).toBe(
      `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`
    );
    expect(init?.redirect).toBe("error");
  });

  it("rejects non-successful endpoints without reading or leaking a response body", async () => {
    const publisher = new HttpOutboxPublisher({
      url: "https://events.example.test/flowcordia",
      secret: SECRET,
      fetch: async () => ({ ok: false, status: 503 }),
    });
    await expect(publisher.publish(event())).rejects.toThrow("HTTP 503");
  });

  it("aborts an endpoint that exceeds the configured delivery deadline", async () => {
    vi.useFakeTimers();
    const publisher = new HttpOutboxPublisher({
      url: "https://events.example.test/flowcordia",
      secret: SECRET,
      timeoutMs: 250,
      fetch: async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    });
    const published = publisher.publish(event());
    const failure = published.then(
      () => null,
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(await failure).toEqual(
      expect.objectContaining({ message: expect.stringContaining("timed out") })
    );
  });

  it("bounds the outbound body before opening a network connection", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 202 }));
    const publisher = new HttpOutboxPublisher({
      url: "https://events.example.test/flowcordia",
      secret: SECRET,
      maxBodyBytes: 1_024,
      fetch,
    });
    await expect(
      publisher.publish({ ...event(), payload: { value: "x".repeat(2_000) } })
    ).rejects.toThrow("size limit");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a strong secret and transport-safe URL", () => {
    expect(
      () => new HttpOutboxPublisher({ url: "http://events.example.test", secret: SECRET })
    ).toThrow("HTTPS");
    expect(
      () => new HttpOutboxPublisher({ url: "https://events.example.test", secret: "short" })
    ).toThrow("secret");
    expect(
      () =>
        new HttpOutboxPublisher({
          url: "https://user:password@events.example.test/#fragment",
          secret: SECRET,
        })
    ).toThrow("credentials");
  });
});
