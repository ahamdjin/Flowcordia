import { beforeEach, describe, expect, it } from "vitest";

import {
  ProposalCommandService,
  WebhookIngestionService,
  normalizeGitHubWebhook,
  type NormalizedGitHubWebhook,
} from "../src/index.js";
import {
  HEAD_SHA,
  MERGE_SHA,
  NOW,
  InMemoryProposalStore,
  createCommand,
  createGateway,
} from "./fixtures.js";

const HASH = "1".repeat(64);

function binding() {
  return { installation: { id: 42 }, repository: { id: 987654 } };
}

function pullRequestPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: "ready_for_review",
    ...binding(),
    pull_request: {
      number: 17,
      head: { sha: HEAD_SHA, ref: "flowcordia/proposals/order_intake/proposal_0001" },
      base: { ref: "main" },
      state: "open",
      draft: false,
      merged: false,
      merge_commit_sha: null,
      updated_at: "2026-07-15T08:01:00.000Z",
      ...overrides,
    },
  };
}

function normalize(eventName: string, payload: unknown): NormalizedGitHubWebhook {
  const result = normalizeGitHubWebhook(eventName, payload);
  if (!result.success || !result.supported) throw new Error("Expected a supported webhook.");
  return result.value;
}

describe("GitHub webhook normalization", () => {
  it("normalizes pull request identity and projection fields", () => {
    const result = normalizeGitHubWebhook("pull_request", pullRequestPayload());
    expect(result).toMatchObject({
      success: true,
      supported: true,
      value: {
        eventName: "pull_request",
        installationId: 42,
        repositoryGithubId: "987654",
        pullRequestNumber: 17,
        headSha: HEAD_SHA,
        draft: false,
      },
    });
  });

  it("normalizes review, check, suite, and commit status events", () => {
    const review = normalizeGitHubWebhook("pull_request_review", {
      action: "submitted",
      ...binding(),
      pull_request: { number: 17, head: { sha: HEAD_SHA } },
      review: {
        state: "APPROVED",
        user: { id: 300 },
        commit_id: HEAD_SHA,
        submitted_at: "2026-07-15T08:02:00.000Z",
      },
    });
    const check = normalizeGitHubWebhook("check_run", {
      action: "completed",
      ...binding(),
      check_run: {
        name: "PR Checks",
        head_sha: HEAD_SHA,
        status: "completed",
        conclusion: "success",
        completed_at: "2026-07-15T08:03:00.000Z",
        pull_requests: [{ number: 17 }],
      },
    });
    const suite = normalizeGitHubWebhook("check_suite", {
      action: "completed",
      ...binding(),
      check_suite: {
        app: { name: "Actions" },
        head_sha: HEAD_SHA,
        status: "completed",
        conclusion: "success",
        updated_at: "2026-07-15T08:03:00.000Z",
        pull_requests: [],
      },
    });
    const status = normalizeGitHubWebhook("status", {
      ...binding(),
      sha: HEAD_SHA,
      context: "deploy/preview",
      state: "success",
      updated_at: "2026-07-15T08:04:00.000Z",
    });
    expect(review).toMatchObject({ success: true, value: { reviewState: "approved" } });
    expect(check).toMatchObject({ success: true, value: { checkName: "PR Checks" } });
    expect(suite).toMatchObject({ success: true, value: { checkName: "Actions" } });
    expect(status).toMatchObject({ success: true, value: { context: "deploy/preview" } });
  });

  it("rejects supported payloads without installation/repository binding", () => {
    expect(normalizeGitHubWebhook("pull_request", { pull_request: {} })).toEqual({
      success: false,
      error: "Webhook tenant binding is invalid.",
    });
  });

  it("ignores event families the control plane does not consume", () => {
    expect(normalizeGitHubWebhook("installation", {})).toEqual({
      success: true,
      supported: false,
    });
  });

  it("bounds normalized strings before persistence", () => {
    expect(
      normalizeGitHubWebhook("pull_request", {
        ...pullRequestPayload(),
        action: "a".repeat(101),
      })
    ).toEqual({ success: false, error: "Webhook action is invalid." });
    expect(
      normalizeGitHubWebhook("pull_request", {
        ...pullRequestPayload(),
        pull_request: {
          ...pullRequestPayload().pull_request,
          head: { sha: HEAD_SHA, ref: "x".repeat(1025) },
        },
      })
    ).toMatchObject({ success: false });
  });
});

describe("WebhookIngestionService", () => {
  let store: InMemoryProposalStore;
  let ingest: WebhookIngestionService;

  beforeEach(async () => {
    store = new InMemoryProposalStore();
    const commands = new ProposalCommandService({
      store,
      github: createGateway(),
      now: () => NOW,
    });
    await commands.create(createCommand());
    ingest = new WebhookIngestionService({ store, now: () => NOW });
  });

  it("projects matching pull request updates and emits an outbox event", async () => {
    const result = await ingest.ingest({
      deliveryId: "delivery-0001",
      payloadHash: HASH,
      receivedAt: NOW,
      event: normalize("pull_request", pullRequestPayload()),
    });
    expect(result.status).toBe("processed");
    if (result.status !== "processed") return;
    expect(result.projectionUpdated).toBe(true);
    expect(result.proposal.state).toBe("READY");
    expect(result.proposal.lastPullRequestEventAt?.toISOString()).toBe("2026-07-15T08:01:00.000Z");
    expect(store.deliveries.get("delivery-0001")?.status).toBe("PROCESSED");
    expect([...store.audits.values()].at(-1)?.eventType).toBe("proposal.github.webhook_received");
  });

  it("deduplicates an exact delivery replay", async () => {
    const input = {
      deliveryId: "delivery-0002",
      payloadHash: HASH,
      receivedAt: NOW,
      event: normalize("pull_request", pullRequestPayload()),
    };
    await ingest.ingest(input);
    const auditCount = store.audits.size;
    expect(await ingest.ingest(input)).toEqual({ status: "duplicate" });
    expect(store.audits.size).toBe(auditCount);
  });

  it("rejects delivery-ID replay with a different payload hash", async () => {
    const input = {
      deliveryId: "delivery-0003",
      payloadHash: HASH,
      receivedAt: NOW,
      event: normalize("pull_request", pullRequestPayload()),
    };
    await ingest.ingest(input);
    await expect(ingest.ingest({ ...input, payloadHash: "2".repeat(64) })).rejects.toThrow(
      "different payload hash"
    );
  });

  it("records unmatched repository events as ignored", async () => {
    const event = normalize("pull_request", {
      ...pullRequestPayload(),
      repository: { id: 111111 },
    });
    const result = await ingest.ingest({
      deliveryId: "delivery-0004",
      payloadHash: HASH,
      receivedAt: NOW,
      event,
    });
    expect(result).toEqual({ status: "ignored" });
    expect(store.deliveries.get("delivery-0004")?.status).toBe("IGNORED");
  });

  it("audits branch identity mismatches without changing projection", async () => {
    const before = [...store.proposals.values()][0];
    const event = normalize(
      "pull_request",
      pullRequestPayload({ head: { sha: HEAD_SHA, ref: "attacker/branch" } })
    );
    const result = await ingest.ingest({
      deliveryId: "delivery-0005",
      payloadHash: HASH,
      receivedAt: NOW,
      event,
    });
    expect(result).toMatchObject({ status: "processed", projectionUpdated: false });
    expect([...store.proposals.values()][0]?.version).toBe(before?.version);
    expect([...store.audits.values()].at(-1)?.eventType).toBe("proposal.github.identity_mismatch");
  });

  it("ignores stale pull request projections but retains the delivery audit", async () => {
    await ingest.ingest({
      deliveryId: "delivery-0006",
      payloadHash: HASH,
      receivedAt: NOW,
      event: normalize("pull_request", pullRequestPayload()),
    });
    const stale = normalize(
      "pull_request",
      pullRequestPayload({ draft: true, updated_at: "2026-07-15T07:00:00.000Z" })
    );
    const result = await ingest.ingest({
      deliveryId: "delivery-0007",
      payloadHash: HASH,
      receivedAt: NOW,
      event: stale,
    });
    expect(result).toMatchObject({ status: "processed", projectionUpdated: false });
    expect([...store.proposals.values()][0]?.state).toBe("READY");
  });

  it("does not reorder two pull request events with the same GitHub timestamp", async () => {
    await ingest.ingest({
      deliveryId: "delivery-0011",
      payloadHash: HASH,
      receivedAt: NOW,
      event: normalize("pull_request", pullRequestPayload()),
    });
    const sameTimestamp = normalize("pull_request", pullRequestPayload({ draft: true }));
    const result = await ingest.ingest({
      deliveryId: "delivery-0012",
      payloadHash: HASH,
      receivedAt: NOW,
      event: sameTimestamp,
    });
    expect(result).toMatchObject({ status: "processed", projectionUpdated: false });
    expect([...store.proposals.values()][0]?.state).toBe("READY");
  });

  it("accepts check events by exact head SHA when no pull request is listed", async () => {
    const event = normalize("check_run", {
      action: "completed",
      ...binding(),
      check_run: {
        name: "PR Checks",
        head_sha: HEAD_SHA,
        status: "completed",
        conclusion: "success",
        completed_at: "2026-07-15T08:03:00.000Z",
        pull_requests: [],
      },
    });
    const result = await ingest.ingest({
      deliveryId: "delivery-0008",
      payloadHash: HASH,
      receivedAt: NOW,
      event,
    });
    expect(result).toMatchObject({ status: "processed", projectionUpdated: true });
  });

  it("projects merged pull requests into a terminal state", async () => {
    const event = normalize(
      "pull_request",
      pullRequestPayload({
        state: "closed",
        merged: true,
        merge_commit_sha: MERGE_SHA,
      })
    );
    const result = await ingest.ingest({
      deliveryId: "delivery-0009",
      payloadHash: HASH,
      receivedAt: NOW,
      event,
    });
    expect(result).toMatchObject({
      status: "processed",
      proposal: { state: "MERGED", mergeCommitSha: MERGE_SHA },
    });
  });

  it("validates delivery and hash formats before opening a transaction", async () => {
    const event = normalize("pull_request", pullRequestPayload());
    await expect(
      ingest.ingest({ deliveryId: "bad", payloadHash: HASH, receivedAt: NOW, event })
    ).rejects.toThrow("delivery ID");
    await expect(
      ingest.ingest({ deliveryId: "delivery-0010", payloadHash: "bad", receivedAt: NOW, event })
    ).rejects.toThrow("SHA-256");
  });
});
