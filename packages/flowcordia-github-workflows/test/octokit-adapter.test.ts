import { describe, expect, it, vi } from "vitest";

import {
  GitHubTransportError,
  OctokitGitHubRepositoryClient,
  OctokitGitHubRepositoryComparisonClient,
  type FlowcordiaComparisonOctokitLike,
  type FlowcordiaOctokitLike,
} from "../src/index.js";
import {
  BRANCH_COMMIT_SHA,
  CURRENT_BLOB_SHA,
  NEW_BLOB_SHA,
  NEW_COMMIT_SHA,
  createScope,
  createWorkflow,
} from "./fixtures.js";
import { encodeWorkflow } from "../src/repository/content.js";

function createOctokit() {
  const encoded = encodeWorkflow(createWorkflow());
  return {
    rest: {
      repos: {
        getCommit: vi.fn(async () => ({ data: { sha: BRANCH_COMMIT_SHA } })),
        getContent: vi.fn(async () => ({
          data: {
            type: "file",
            encoding: "base64",
            content: encoded.contentBase64,
            size: encoded.byteLength,
            sha: CURRENT_BLOB_SHA,
          },
        })),
        createOrUpdateFileContents: vi.fn(async () => ({
          data: { commit: { sha: NEW_COMMIT_SHA }, content: { sha: NEW_BLOB_SHA } },
        })),
        deleteFile: vi.fn(async () => ({ data: { commit: { sha: NEW_COMMIT_SHA } } })),
      },
    },
  } satisfies FlowcordiaOctokitLike;
}

describe("OctokitGitHubRepositoryClient", () => {
  it("resolves revisions and reads content using an immutable commit SHA", async () => {
    const octokit = createOctokit();
    const client = new OctokitGitHubRepositoryClient(octokit);
    const repository = createScope().repository;

    const revision = await client.resolveRevision({ repository, revision: "main" });
    const file = await client.getFile({
      repository,
      path: ".flowcordia/workflows/order_intake.json",
      commitSha: revision.commitSha,
    });

    expect(revision).toEqual({ commitSha: BRANCH_COMMIT_SHA });
    expect(file).toEqual(expect.objectContaining({ found: true, blobSha: CURRENT_BLOB_SHA }));
    expect(octokit.rest.repos.getCommit).toHaveBeenCalledWith({
      owner: "acme-enterprise",
      repo: "automation",
      ref: "main",
    });
    expect(octokit.rest.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ ref: BRANCH_COMMIT_SHA })
    );
  });

  it("maps a content 404 to a missing file", async () => {
    const octokit = createOctokit();
    octokit.rest.repos.getContent.mockRejectedValue({
      status: 404,
      response: { status: 404, headers: { "x-github-request-id": "request-404" } },
    });
    const client = new OctokitGitHubRepositoryClient(octokit);

    await expect(
      client.getFile({
        repository: createScope().repository,
        path: ".flowcordia/workflows/missing_flow.json",
        commitSha: BRANCH_COMMIT_SHA,
      })
    ).resolves.toEqual({ found: false });
  });

  it("returns large-file metadata so the store can enforce its byte ceiling", async () => {
    const octokit = createOctokit();
    octokit.rest.repos.getContent.mockResolvedValue({
      data: {
        type: "file",
        encoding: "none",
        content: "",
        size: 1024 * 1024 + 1,
        sha: CURRENT_BLOB_SHA,
      },
    });
    const client = new OctokitGitHubRepositoryClient(octokit);

    await expect(
      client.getFile({
        repository: createScope().repository,
        path: ".flowcordia/workflows/too_large.json",
        commitSha: BRANCH_COMMIT_SHA,
      })
    ).resolves.toEqual({
      found: true,
      blobSha: CURRENT_BLOB_SHA,
      size: 1024 * 1024 + 1,
      contentBase64: "",
    });
  });

  it("omits sha for create and requires it for update", async () => {
    const octokit = createOctokit();
    const client = new OctokitGitHubRepositoryClient(octokit);
    const repository = createScope().repository;
    const common = {
      repository,
      path: ".flowcordia/workflows/order_intake.json",
      message: "flowcordia: save workflow\n",
      contentBase64: "e30K",
    };

    await client.putFile({ ...common, expectedBlobSha: null });
    await client.putFile({ ...common, expectedBlobSha: CURRENT_BLOB_SHA });

    expect(octokit.rest.repos.createOrUpdateFileContents.mock.calls[0]![0]).not.toHaveProperty(
      "sha"
    );
    expect(octokit.rest.repos.createOrUpdateFileContents.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ sha: CURRENT_BLOB_SHA, branch: "main" })
    );
  });

  it("preserves rate-limit and request metadata without exposing response bodies", async () => {
    const octokit = createOctokit();
    octokit.rest.repos.getCommit.mockRejectedValue({
      status: 403,
      message: "raw response that callers should not receive",
      response: {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1700000005",
          "x-github-request-id": "github-request-limit",
        },
      },
    });
    const client = new OctokitGitHubRepositoryClient(octokit, {
      now: () => 1_700_000_000_000,
    });

    const error = await client
      .resolveRevision({ repository: createScope().repository, revision: "main" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitHubTransportError);
    expect(error).toEqual(
      expect.objectContaining({
        code: "rate_limited",
        status: 403,
        requestId: "github-request-limit",
        retryAfterMs: 5000,
      })
    );
    expect((error as Error).message).not.toContain("raw response");
  });

  it("marks an invalid mutation response as ambiguous", async () => {
    const octokit = createOctokit();
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({ data: {} });
    const client = new OctokitGitHubRepositoryClient(octokit);

    const error = await client
      .putFile({
        repository: createScope().repository,
        path: ".flowcordia/workflows/order_intake.json",
        message: "save",
        contentBase64: "e30K",
        expectedBlobSha: null,
      })
      .catch((caught: unknown) => caught);

    expect(error).toEqual(
      expect.objectContaining({
        code: "invalid_response",
        mutationMayHaveSucceeded: true,
      })
    );
  });

  it("deletes a file on the configured branch with the expected blob", async () => {
    const octokit = createOctokit();
    const client = new OctokitGitHubRepositoryClient(octokit);

    await expect(
      client.deleteFile({
        repository: createScope().repository,
        path: ".flowcordia/workflows/order_intake.json",
        message: "delete",
        expectedBlobSha: CURRENT_BLOB_SHA,
      })
    ).resolves.toEqual({ commitSha: NEW_COMMIT_SHA });
    expect(octokit.rest.repos.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "main", sha: CURRENT_BLOB_SHA })
    );
  });
});

describe("OctokitGitHubRepositoryComparisonClient", () => {
  function createComparisonOctokit() {
    return {
      rest: {
        repos: {
          compareCommitsWithBasehead: vi.fn(async () => ({
            data: {
              status: "ahead",
              ahead_by: 1,
              behind_by: 0,
              total_commits: 1,
              base_commit: { sha: BRANCH_COMMIT_SHA },
              merge_base_commit: { sha: BRANCH_COMMIT_SHA },
              commits: [{ sha: NEW_COMMIT_SHA }],
              files: [
                {
                  filename: ".flowcordia/workflows/order_intake.json",
                  status: "modified",
                  sha: NEW_BLOB_SHA,
                },
              ],
            },
          })),
        },
      },
    } satisfies FlowcordiaComparisonOctokitLike;
  }

  it("normalizes an immutable base-to-head comparison", async () => {
    const octokit = createComparisonOctokit();
    const client = new OctokitGitHubRepositoryComparisonClient(octokit);

    await expect(
      client.compareCommits({
        repository: createScope().repository,
        baseCommitSha: BRANCH_COMMIT_SHA,
        headCommitSha: NEW_COMMIT_SHA,
      })
    ).resolves.toEqual({
      status: "ahead",
      aheadBy: 1,
      behindBy: 0,
      totalCommits: 1,
      baseCommitSha: BRANCH_COMMIT_SHA,
      mergeBaseCommitSha: BRANCH_COMMIT_SHA,
      headCommitSha: NEW_COMMIT_SHA,
      files: [
        {
          path: ".flowcordia/workflows/order_intake.json",
          status: "modified",
          blobSha: NEW_BLOB_SHA,
        },
      ],
    });
    expect(octokit.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith({
      owner: "acme-enterprise",
      repo: "automation",
      basehead: `${BRANCH_COMMIT_SHA}...${NEW_COMMIT_SHA}`,
    });
  });

  it("rejects a malformed or incomplete changed-file response", async () => {
    const octokit = createComparisonOctokit();
    octokit.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
      data: {
        status: "ahead",
        ahead_by: 1,
        behind_by: 0,
        total_commits: 1,
        base_commit: { sha: BRANCH_COMMIT_SHA },
        merge_base_commit: { sha: BRANCH_COMMIT_SHA },
        commits: [{ sha: NEW_COMMIT_SHA }],
      },
    });
    const client = new OctokitGitHubRepositoryComparisonClient(octokit);

    await expect(
      client.compareCommits({
        repository: createScope().repository,
        baseCommitSha: BRANCH_COMMIT_SHA,
        headCommitSha: NEW_COMMIT_SHA,
      })
    ).rejects.toMatchObject({ code: "invalid_response", mutationMayHaveSucceeded: false });
  });
});
