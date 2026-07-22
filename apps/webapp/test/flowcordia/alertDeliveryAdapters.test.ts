import { ErrorCode } from "@slack/web-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const postMessage = vi.fn();
  return {
    postMessage,
    getAuthenticatedClientForIntegration: vi.fn(async () => ({
      chat: { postMessage },
    })),
    decryptSecret: vi.fn(async () => "fixed-canary-secret"),
  };
});

vi.mock("~/models/orgIntegration.server", () => ({
  OrgIntegrationRepository: {
    getAuthenticatedClientForIntegration: mocks.getAuthenticatedClientForIntegration,
  },
}));
vi.mock("~/services/secrets/secretStore.server", () => ({
  decryptSecret: mocks.decryptSecret,
}));

import {
  AlertDeliveryNoRetryError,
  deliverAlertWebhook,
  postAlertSlackMessage,
} from "~/v3/services/alerts/alertDeliveryAdapters.server";

describe("shared alert delivery adapters", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.postMessage.mockReset();
    mocks.postMessage.mockResolvedValue({ ok: true, ts: "1" });
    mocks.getAuthenticatedClientForIntegration.mockClear();
    mocks.decryptSecret.mockClear();
  });

  it("signs and sends the exact webhook canary without exposing its secret", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const payload = {
      schemaVersion: "0.1",
      type: "flowcordia.alert.readiness",
      result: "CANARY",
    };
    await deliverAlertWebhook(payload, {
      url: "https://hooks.example.com/flowcordia",
      secret: { encrypted: "ciphertext" },
      version: "v2",
    } as never);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/flowcordia");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(payload));
    expect(new Headers(init.headers).get("x-trigger-signature-hmacsha256")).toMatch(
      /^[0-9a-f]{64}$/
    );
    expect(String(init.body)).not.toContain("fixed-canary-secret");
  });

  it("uses the inherited Slack integration client with unfurling disabled", async () => {
    await postAlertSlackMessage({ service: "SLACK" } as never, {
      channel: "C123",
      text: "Flowcordia canary",
    });
    expect(mocks.getAuthenticatedClientForIntegration).toHaveBeenCalledWith(
      { service: "SLACK" },
      { forceBotToken: true }
    );
    expect(mocks.postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "Flowcordia canary",
      unfurl_links: false,
      unfurl_media: false,
    });
  });

  it("classifies non-retryable Slack configuration failures", async () => {
    mocks.postMessage.mockRejectedValue({
      code: ErrorCode.PlatformError,
      data: { error: "account_inactive" },
    });
    await expect(
      postAlertSlackMessage({ service: "SLACK" } as never, {
        channel: "C123",
        text: "Flowcordia canary",
      })
    ).rejects.toBeInstanceOf(AlertDeliveryNoRetryError);
  });

  it("returns a fixed webhook error instead of provider response data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private provider body", { status: 503 }))
    );
    await expect(
      deliverAlertWebhook({ type: "flowcordia.alert.readiness" }, {
        url: "https://hooks.example.com/private",
        secret: { encrypted: "ciphertext" },
        version: "v2",
      } as never)
    ).rejects.toThrow("Alert webhook rejected the request");
  });
});
