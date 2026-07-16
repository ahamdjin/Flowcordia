import { describe, expect, it, vi } from "vitest";
import {
  GitHubWorkflowCatalog,
  GitHubTransportError,
  type GitHubWorkflowDiscoveryClient,
  type GitHubWorkflowDiscoveryClientResolver,
} from "../src/index.js";
import { createScope } from "./fixtures.js";

const COMMIT_SHA = "1111111111111111111111111111111111111111";
const OTHER_SHA = "2222222222222222222222222222222222222222";
const BLOB_SHA = "3333333333333333333333333333333333333333";

function client(overrides: Partial<GitHubWorkflowDiscoveryClient> = {}) {
  return {
    resolveRevision: vi.fn(async () => ({ commitSha: COMMIT_SHA })),
    listTree: vi.fn(async () => ({
      commitSha: COMMIT_SHA,
      truncated: false,
      entries: [
        {
          path: ".flowcordia/workflows/order_intake.json",
          blobSha: BLOB_SHA,
          size: 512,
        },
      ],
    })),
    ...overrides,
  } satisfies GitHubWorkflowDiscoveryClient;
}

function resolver(value: GitHubWorkflowDiscoveryClient) {
  return {
    resolve: vi.fn(async () => value),
  } satisfies GitHubWorkflowDiscoveryClientResolver;
}

describe("GitHubWorkflowCatalog", () => {
  it("resolves the branch once and returns a stable exact-commit catalog", async () => {
    const discoveryClient = client({
      listTree: vi.fn(async () => ({
        commitSha: COMMIT_SHA,
        truncated: false,
        entries: [
          {
            path: ".flowcordia/workflows/order_intake.json",
            blobSha: BLOB_SHA,
            size: 512,
          },
          {
            path: ".flowcordia/workflows/nested/ignored.json",
            blobSha: BLOB_SHA,
            size: 42,
          },
          {
            path: ".flowcordia/workflows/invalid name.json",
            blobSha: BLOB_SHA,
            size: 42,
          },
          { path: "README.md", blobSha: BLOB_SHA, size: 42 },
        ],
      })),
    });
    const scope = createScope();
    const catalog = new GitHubWorkflowCatalog({ clientResolver: resolver(discoveryClient) });

    const result = await catalog.discover({ scope });

    expect(result).toEqual({
      success: true,
      value: {
        repository: scope.repository,
        requestedRevision: scope.repository.branch,
        commitSha: COMMIT_SHA,
        workflowRoot: ".flowcordia/workflows",
        entries: [
          {
            path: ".flowcordia/workflows/order_intake.json",
            workflowId: "order_intake",
            blobSha: BLOB_SHA,
            size: 512,
          },
        ],
      },
    });
    expect(discoveryClient.resolveRevision).toHaveBeenCalledTimes(1);
    expect(discoveryClient.listTree).toHaveBeenCalledWith({
      repository: scope.repository,
      commitSha: COMMIT_SHA,
    });
  });

  it("rejects an invalid scope before resolving installation credentials", async () => {
    const discoveryClient = client();
    const installationResolver = resolver(discoveryClient);
    const scope = createScope();
    scope.repository.branch = "../main";
    const catalog = new GitHubWorkflowCatalog({ clientResolver: installationResolver });

    const result = await catalog.discover({ scope });

    expect(result).toEqual({
      success: false,
      error: {
        code: "invalid_input",
        message: "Workflow discovery input is invalid.",
        retryable: false,
      },
    });
    expect(installationResolver.resolve).not.toHaveBeenCalled();
  });

  it("fails closed when GitHub truncates the repository tree", async () => {
    const catalog = new GitHubWorkflowCatalog({
      clientResolver: resolver(
        client({
          listTree: vi.fn(async () => ({
            commitSha: COMMIT_SHA,
            truncated: true,
            entries: [],
          })),
        })
      ),
    });

    const result = await catalog.discover({ scope: createScope() });

    expect(result).toEqual({
      success: false,
      error: expect.objectContaining({ code: "truncated_tree", retryable: true }),
    });
  });

  it("does not accept a tree resolved from a different commit", async () => {
    const catalog = new GitHubWorkflowCatalog({
      clientResolver: resolver(
        client({
          listTree: vi.fn(async () => ({
            commitSha: OTHER_SHA,
            truncated: false,
            entries: [],
          })),
        })
      ),
    });

    const result = await catalog.discover({ scope: createScope() });

    expect(result).toEqual({
      success: false,
      error: expect.objectContaining({ code: "invalid_response", retryable: false }),
    });
  });

  it("preserves normalized rate-limit metadata without exposing provider errors", async () => {
    const catalog = new GitHubWorkflowCatalog({
      clientResolver: resolver(
        client({
          resolveRevision: vi.fn(async () => {
            throw new GitHubTransportError("raw provider detail", {
              code: "rate_limited",
              status: 429,
              requestId: "github-request-1",
              retryAfterMs: 30_000,
            });
          }),
        })
      ),
    });

    const result = await catalog.discover({ scope: createScope() });

    expect(result).toEqual({
      success: false,
      error: {
        code: "rate_limited",
        message: "GitHub workflow discovery was rate limited.",
        retryable: true,
        requestId: "github-request-1",
        retryAfterMs: 30_000,
      },
    });
    if (!result.success) expect(result.error.message).not.toContain("raw provider detail");
  });

  it("rejects catalogs above the configured operational bound", async () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({
      path: `.flowcordia/workflows/flow_${index}.json`,
      blobSha: BLOB_SHA,
      size: 100,
    }));
    const catalog = new GitHubWorkflowCatalog({
      clientResolver: resolver(
        client({
          listTree: vi.fn(async () => ({ commitSha: COMMIT_SHA, truncated: false, entries })),
        })
      ),
      maxEntries: 2,
    });

    const result = await catalog.discover({ scope: createScope() });

    expect(result).toEqual({
      success: false,
      error: expect.objectContaining({ code: "catalog_limit_exceeded", retryable: false }),
    });
  });
});
