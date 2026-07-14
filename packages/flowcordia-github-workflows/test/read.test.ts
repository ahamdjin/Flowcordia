import { describe, expect, it, vi } from "vitest";
import type { WorkflowMigration } from "@flowcordia/workflow";

import { GitHubTransportError, GitHubWorkflowStore, encodeWorkflow } from "../src/index.js";
import {
  BRANCH_COMMIT_SHA,
  CURRENT_BLOB_SHA,
  createClient,
  createResolver,
  createScope,
  createWorkflow,
} from "./fixtures.js";

describe("GitHubWorkflowStore.read", () => {
  it("rejects invalid tenant/repository scope before resolving credentials", async () => {
    const client = createClient();
    const resolver = createResolver(client);
    const store = new GitHubWorkflowStore({ clientResolver: resolver });
    const scope = createScope();
    scope.repository.branch = "../production";

    const result = await store.read({ scope, workflowId: "order_intake" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("invalid_input");
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("resolves a branch once and reads the workflow from the exact commit", async () => {
    const workflow = createWorkflow();
    const client = createClient();
    const resolver = createResolver(client);
    const store = new GitHubWorkflowStore({ clientResolver: resolver });
    const scope = createScope();

    const result = await store.read({ scope, workflowId: workflow.id });

    expect(result).toEqual({
      success: true,
      value: {
        workflow,
        source: {
          repository: scope.repository,
          path: ".flowcordia/workflows/order_intake.json",
          requestedRevision: "main",
          commitSha: BRANCH_COMMIT_SHA,
          blobSha: CURRENT_BLOB_SHA,
          sourceSchemaVersion: "0.1",
        },
        appliedMigrations: [],
      },
    });
    expect(resolver.resolve).toHaveBeenCalledWith(scope);
    expect(client.resolveRevision).toHaveBeenCalledWith({
      repository: scope.repository,
      revision: "main",
    });
    expect(client.getFile).toHaveBeenCalledWith({
      repository: scope.repository,
      path: ".flowcordia/workflows/order_intake.json",
      commitSha: BRANCH_COMMIT_SHA,
    });
  });

  it("returns not_found without leaking repository content", async () => {
    const client = createClient({ found: false });
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.read({ scope: createScope(), workflowId: "missing_flow" });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "not_found", retryable: false }),
      })
    );
  });

  it("returns structured validation issues for malformed repository content", async () => {
    const text = '{"schemaVersion":';
    const client = createClient({
      found: true,
      blobSha: CURRENT_BLOB_SHA,
      size: new TextEncoder().encode(text).length,
      contentBase64: btoa(text),
    });
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.read({ scope: createScope(), workflowId: "order_intake" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("invalid_document");
    expect(result.error.workflowIssues?.[0]?.code).toBe("invalid_json");
  });

  it("applies an explicit migration and preserves the source schema version", async () => {
    const workflow = createWorkflow();
    const { name, ...fields } = workflow;
    const legacy = { ...fields, schemaVersion: "0.0", title: name };
    const text = `${JSON.stringify(legacy)}\n`;
    const migration: WorkflowMigration = {
      fromVersion: "0.0",
      toVersion: "0.1",
      migrate(document) {
        const { title, ...rest } = document;
        return { ...rest, schemaVersion: "0.1", name: title };
      },
    };
    const client = createClient({
      found: true,
      blobSha: CURRENT_BLOB_SHA,
      size: new TextEncoder().encode(text).length,
      contentBase64: btoa(text),
    });
    const store = new GitHubWorkflowStore({
      clientResolver: createResolver(client),
      migrations: [migration],
    });

    const result = await store.read({ scope: createScope(), workflowId: workflow.id });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.workflow).toEqual(workflow);
    expect(result.value.source.sourceSchemaVersion).toBe("0.0");
    expect(result.value.appliedMigrations).toEqual([{ fromVersion: "0.0", toVersion: "0.1" }]);
  });

  it("retries safe reads with bounded jitter but never hides the exact commit", async () => {
    const client = createClient();
    client.resolveRevision
      .mockRejectedValueOnce(
        new GitHubTransportError("temporary", { code: "http_error", status: 503 })
      )
      .mockResolvedValueOnce({ commitSha: BRANCH_COMMIT_SHA });
    const sleep = vi.fn(async () => undefined);
    const store = new GitHubWorkflowStore({
      clientResolver: createResolver(client),
      sleep,
      random: () => 0.5,
      readRetry: { maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 100 },
    });

    const result = await store.read({ scope: createScope(), workflowId: "order_intake" });

    expect(result.success).toBe(true);
    expect(client.resolveRevision).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
    expect(client.getFile).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: BRANCH_COMMIT_SHA })
    );
  });

  it("does not sleep through a long GitHub rate limit", async () => {
    const client = createClient();
    client.resolveRevision.mockRejectedValue(
      new GitHubTransportError("limited", {
        code: "rate_limited",
        status: 429,
        retryAfterMs: 60_000,
        requestId: "github-request-1",
      })
    );
    const sleep = vi.fn(async () => undefined);
    const store = new GitHubWorkflowStore({
      clientResolver: createResolver(client),
      sleep,
      readRetry: { maxAttempts: 3, maxDelayMs: 1000 },
    });

    const result = await store.read({ scope: createScope(), workflowId: "order_intake" });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "rate_limited",
          retryAfterMs: 60_000,
          requestId: "github-request-1",
        }),
      })
    );
    expect(sleep).not.toHaveBeenCalled();
    expect(client.resolveRevision).toHaveBeenCalledTimes(1);
  });

  it("maps installation authorization failures without exposing raw errors", async () => {
    const client = createClient();
    client.resolveRevision.mockRejectedValue(
      new GitHubTransportError("raw github details", {
        code: "http_error",
        status: 403,
        requestId: "github-request-denied",
      })
    );
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.read({ scope: createScope(), workflowId: "order_intake" });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "access_denied",
          requestId: "github-request-denied",
        }),
      })
    );
    if (!result.success) expect(result.error.message).not.toContain("raw github details");
  });

  it("rejects oversized files before decoding them", async () => {
    const encoded = encodeWorkflow(createWorkflow());
    const client = createClient({
      found: true,
      blobSha: CURRENT_BLOB_SHA,
      size: encoded.byteLength,
      contentBase64: encoded.contentBase64,
    });
    const store = new GitHubWorkflowStore({
      clientResolver: createResolver(client),
      maxWorkflowBytes: encoded.byteLength - 1,
    });

    const result = await store.read({ scope: createScope(), workflowId: "order_intake" });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "invalid_document",
          message: expect.stringContaining("exceeds"),
        }),
      })
    );
  });
});
