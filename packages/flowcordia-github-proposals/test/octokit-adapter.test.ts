import { GitHubTransportError } from "@flowcordia/github-workflows";
import { describe, expect, it, vi } from "vitest";

import { OctokitGitHubProposalClient, type FlowcordiaProposalOctokitLike } from "../src/index.js";
import { BASE_SHA, HEAD_SHA, MERGE_SHA } from "./fixtures.js";

const repository = { owner: "acme", name: "automations", branch: "main" };

function pullData(overrides: Record<string, unknown> = {}) {
  return {
    number: 17,
    node_id: "PR_node_17",
    html_url: "https://github.com/acme/automations/pull/17",
    state: "open",
    draft: true,
    merged: false,
    merged_at: null,
    merge_commit_sha: null,
    mergeable: true,
    mergeable_state: "clean",
    body: "managed",
    head: { ref: "flowcordia/proposals/order_intake/proposal_0001", sha: HEAD_SHA },
    base: { ref: "main" },
    user: { id: 100 },
    ...overrides,
  };
}

function createOctokit() {
  const pages = new Map<unknown, unknown[][]>();
  const paginate = {
    iterator: vi.fn((method: unknown) => ({
      async *[Symbol.asyncIterator]() {
        for (const data of pages.get(method) ?? [[]]) yield { data };
      },
    })),
  };
  const octokit = {
    paginate,
    graphql: vi.fn(async () => ({
      markPullRequestReadyForReview: { pullRequest: { id: "PR_node_17" } },
    })),
    rest: {
      git: {
        getRef: vi.fn(async () => ({ data: { object: { sha: BASE_SHA } } })),
        createRef: vi.fn(async () => ({ data: { object: { sha: BASE_SHA } } })),
      },
      pulls: {
        list: vi.fn(),
        create: vi.fn(async () => ({ data: pullData() })),
        get: vi.fn(async () => ({ data: pullData() })),
        listReviews: vi.fn(),
        merge: vi.fn(async () => ({ data: { merged: true, sha: MERGE_SHA } })),
      },
      checks: { listForRef: vi.fn() },
      repos: { listCommitStatusesForRef: vi.fn() },
    },
  };
  pages.set(octokit.rest.pulls.list, [[pullData()]]);
  pages.set(octokit.rest.checks.listForRef, [
    [
      {
        id: 1,
        name: "PR Checks",
        head_sha: HEAD_SHA,
        status: "completed",
        conclusion: "success",
        started_at: "2026-07-15T10:00:00Z",
        completed_at: "2026-07-15T10:01:00Z",
      },
    ],
  ]);
  pages.set(octokit.rest.repos.listCommitStatusesForRef, [
    [
      {
        id: 2,
        context: "security/policy",
        sha: HEAD_SHA,
        state: "pending",
        updated_at: "2026-07-15T10:01:00Z",
      },
    ],
  ]);
  pages.set(octokit.rest.pulls.listReviews, [
    [
      {
        id: 3,
        user: { id: 200 },
        state: "APPROVED",
        commit_id: HEAD_SHA,
        submitted_at: "2026-07-15T10:02:00Z",
      },
    ],
  ]);
  return { ...octokit, pages };
}

function createClient(octokit = createOctokit()) {
  return {
    octokit,
    client: new OctokitGitHubProposalClient(octokit as unknown as FlowcordiaProposalOctokitLike, {
      now: () => 1_000,
    }),
  };
}

describe("OctokitGitHubProposalClient", () => {
  it("reads a fully qualified branch ref and treats 404 as absent", async () => {
    const { client, octokit } = createClient();
    expect(await client.getBranch({ repository, branch: "main" })).toEqual({
      exists: true,
      sha: BASE_SHA,
    });
    expect(octokit.rest.git.getRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "automations",
      ref: "heads/main",
    });

    octokit.rest.git.getRef.mockRejectedValueOnce({ status: 404 });
    expect(await client.getBranch({ repository, branch: "missing" })).toEqual({ exists: false });
  });

  it("creates a branch from an exact commit without retry metadata", async () => {
    const { client, octokit } = createClient();
    await expect(
      client.createBranch({
        repository,
        branch: "flowcordia/proposals/x/y",
        fromCommitSha: BASE_SHA,
      })
    ).resolves.toEqual({ sha: BASE_SHA });
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "automations",
      ref: "refs/heads/flowcordia/proposals/x/y",
      sha: BASE_SHA,
    });
  });

  it("paginates pull request lookup with an owner-qualified head", async () => {
    const { client, octokit } = createClient();
    const pullRequests = await client.findPullRequests({
      repository,
      baseBranch: "main",
      headBranch: "flowcordia/proposals/order_intake/proposal_0001",
    });
    expect(pullRequests).toHaveLength(1);
    expect(octokit.paginate.iterator).toHaveBeenCalledWith(
      octokit.rest.pulls.list,
      expect.objectContaining({
        state: "all",
        base: "main",
        head: "acme:flowcordia/proposals/order_intake/proposal_0001",
        per_page: 100,
      })
    );
  });

  it("treats an invalid create-PR success payload as an ambiguous mutation", async () => {
    const { client, octokit } = createClient();
    octokit.rest.pulls.create.mockResolvedValueOnce({ data: {} } as never);
    await expect(
      client.createPullRequest({
        repository,
        baseBranch: "main",
        headBranch: "flowcordia/proposals/order_intake/proposal_0001",
        title: "Flowcordia: order",
        body: "managed",
        draft: true,
      })
    ).rejects.toMatchObject({ code: "invalid_response", mutationMayHaveSucceeded: true });
  });

  it("combines paginated check runs, commit statuses, and reviews for one head", async () => {
    const { client } = createClient();
    const snapshot = await client.getProposalSnapshot({ repository, pullRequestNumber: 17 });
    expect(snapshot.pullRequest.headSha).toBe(HEAD_SHA);
    expect(snapshot.checks).toEqual([
      expect.objectContaining({ name: "PR Checks", conclusion: "success" }),
      expect.objectContaining({ name: "security/policy", status: "in_progress" }),
    ]);
    expect(snapshot.reviews).toEqual([
      expect.objectContaining({ reviewerId: "200", state: "approved", commitSha: HEAD_SHA }),
    ]);
  });

  it("normalizes an unsubmitted pending review without counting it as decisive", async () => {
    const { client, octokit } = createClient();
    octokit.pages.set(octokit.rest.checks.listForRef, [[]]);
    octokit.pages.set(octokit.rest.repos.listCommitStatusesForRef, [[]]);
    octokit.pages.set(octokit.rest.pulls.listReviews, [
      [
        {
          id: 4,
          user: { id: 201 },
          state: "PENDING",
          commit_id: HEAD_SHA,
          submitted_at: null,
        },
      ],
    ]);
    const snapshot = await client.getProposalSnapshot({ repository, pullRequestNumber: 17 });
    expect(snapshot.reviews).toEqual([
      expect.objectContaining({ reviewerId: "201", state: "pending", submittedAt: "" }),
    ]);
  });

  it("uses the list-status endpoint and reads every bounded evidence page", async () => {
    const { client, octokit } = createClient();
    octokit.pages.set(octokit.rest.repos.listCommitStatusesForRef, [
      [
        {
          id: 20,
          context: "security/policy",
          sha: HEAD_SHA,
          state: "pending",
          updated_at: "2026-07-15T10:01:00Z",
        },
      ],
      [
        {
          id: 21,
          context: "release/policy",
          sha: HEAD_SHA,
          state: "success",
          updated_at: "2026-07-15T10:02:00Z",
        },
      ],
    ]);

    const snapshot = await client.getProposalSnapshot({ repository, pullRequestNumber: 17 });
    expect(snapshot.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 20, name: "security/policy" }),
        expect.objectContaining({ id: 21, name: "release/policy" }),
      ])
    );
    expect(octokit.paginate.iterator).toHaveBeenCalledWith(
      octokit.rest.repos.listCommitStatusesForRef,
      expect.objectContaining({ ref: HEAD_SHA, per_page: 100 })
    );
  });

  it.each([
    ["check run", "checks", 1_001],
    ["commit status", "statuses", 1_001],
    ["review", "reviews", 1_001],
  ] as const)("fails closed when %s evidence exceeds its bound", async (label, source, count) => {
    const { client, octokit } = createClient();
    const method =
      source === "checks"
        ? octokit.rest.checks.listForRef
        : source === "statuses"
          ? octokit.rest.repos.listCommitStatusesForRef
          : octokit.rest.pulls.listReviews;
    octokit.pages.set(
      method,
      Array.from({ length: Math.ceil(count / 100) }, (_, pageIndex) =>
        Array.from({ length: Math.min(100, count - pageIndex * 100) }, (_, itemIndex) => ({
          pageIndex,
          itemIndex,
        }))
      )
    );

    await expect(
      client.getProposalSnapshot({ repository, pullRequestNumber: 17 })
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: `GitHub returned more than 1000 ${label} records.`,
      mutationMayHaveSucceeded: false,
    });
  });

  it("fails closed when matching proposal lookup exceeds its bound", async () => {
    const { client, octokit } = createClient();
    octokit.pages.set(
      octokit.rest.pulls.list,
      Array.from({ length: 2 }, () => Array.from({ length: 51 }, () => pullData()))
    );

    await expect(
      client.findPullRequests({
        repository,
        baseBranch: "main",
        headBranch: "flowcordia/proposals/order_intake/proposal_0001",
      })
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: "GitHub returned more than 100 matching pull request records.",
    });
  });

  it("checks the expected head before marking a draft ready", async () => {
    const { client, octokit } = createClient();
    await expect(
      client.markReadyForReview({
        repository,
        pullRequestNumber: 17,
        expectedHeadSha: "f".repeat(40),
      })
    ).rejects.toMatchObject({ status: 409, mutationMayHaveSucceeded: false });
    expect(octokit.graphql).not.toHaveBeenCalled();
  });

  it("does not mark a preflight read failure as an attempted ready mutation", async () => {
    const { client, octokit } = createClient();
    octokit.rest.pulls.get.mockRejectedValueOnce(new Error("network down"));
    await expect(
      client.markReadyForReview({
        repository,
        pullRequestNumber: 17,
        expectedHeadSha: HEAD_SHA,
      })
    ).rejects.toMatchObject({ code: "network_error", mutationMayHaveSucceeded: false });
    expect(octokit.graphql).not.toHaveBeenCalled();
  });

  it("marks a pull request ready through GraphQL and reads back authoritative state", async () => {
    const { client, octokit } = createClient();
    octokit.rest.pulls.get
      .mockResolvedValueOnce({ data: pullData({ draft: true }) })
      .mockResolvedValueOnce({ data: pullData({ draft: false }) });
    const pullRequest = await client.markReadyForReview({
      repository,
      pullRequestNumber: 17,
      expectedHeadSha: HEAD_SHA,
    });
    expect(pullRequest.draft).toBe(false);
    expect(octokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining("markPullRequestReadyForReview"),
      { pullRequestId: "PR_node_17" }
    );
  });

  it("marks a readback failure after ready mutation as ambiguous", async () => {
    const { client, octokit } = createClient();
    octokit.rest.pulls.get
      .mockResolvedValueOnce({ data: pullData({ draft: true }) })
      .mockRejectedValueOnce(new Error("readback failed"));
    await expect(
      client.markReadyForReview({
        repository,
        pullRequestNumber: 17,
        expectedHeadSha: HEAD_SHA,
      })
    ).rejects.toMatchObject({ code: "network_error", mutationMayHaveSucceeded: true });
    expect(octokit.graphql).toHaveBeenCalledTimes(1);
  });

  it("passes expected head SHA and allowed merge method to GitHub", async () => {
    const { client, octokit } = createClient();
    await expect(
      client.mergePullRequest({
        repository,
        pullRequestNumber: 17,
        expectedHeadSha: HEAD_SHA,
        method: "squash",
      })
    ).resolves.toEqual({ merged: true, mergeCommitSha: MERGE_SHA });
    expect(octokit.rest.pulls.merge).toHaveBeenCalledWith(
      expect.objectContaining({ sha: HEAD_SHA, merge_method: "squash" })
    );
  });

  it("normalizes rate limits without leaking raw GitHub errors", async () => {
    const { client, octokit } = createClient();
    octokit.rest.pulls.get.mockRejectedValueOnce({
      status: 403,
      message: "secret upstream details",
      response: {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "3",
          "x-github-request-id": "github-request-1",
        },
      },
    });
    let caught: unknown;
    try {
      await client.getProposalSnapshot({ repository, pullRequestNumber: 17 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitHubTransportError);
    expect(caught).toMatchObject({
      code: "rate_limited",
      requestId: "github-request-1",
      retryAfterMs: 2_000,
    });
    expect((caught as Error).message).not.toContain("secret upstream details");
  });

  it("marks transport failures during merge as potentially applied", async () => {
    const { client, octokit } = createClient();
    octokit.rest.pulls.merge.mockRejectedValueOnce(new Error("socket included token"));
    await expect(
      client.mergePullRequest({
        repository,
        pullRequestNumber: 17,
        expectedHeadSha: HEAD_SHA,
        method: "merge",
      })
    ).rejects.toMatchObject({ code: "network_error", mutationMayHaveSucceeded: true });
  });

  it("treats an invalid successful merge payload as an ambiguous mutation", async () => {
    const { client, octokit } = createClient();
    octokit.rest.pulls.merge.mockResolvedValueOnce({ data: { merged: true, sha: "invalid" } });
    await expect(
      client.mergePullRequest({
        repository,
        pullRequestNumber: 17,
        expectedHeadSha: HEAD_SHA,
        method: "rebase",
      })
    ).rejects.toMatchObject({ code: "invalid_response", mutationMayHaveSucceeded: true });
  });
});
