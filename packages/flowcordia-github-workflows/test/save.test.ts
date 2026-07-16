import { cloneWorkflow } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";

import { GitHubTransportError, GitHubWorkflowStore } from "../src/index.js";
import {
  CURRENT_BLOB_SHA,
  NEW_BLOB_SHA,
  NEW_COMMIT_SHA,
  createClient,
  createResolver,
  createScope,
  createWorkflow,
} from "./fixtures.js";

const mutation = {
  actorId: "user_42",
  correlationId: "request_abc",
  reason: "Approved in change request CR-42",
};

describe("GitHubWorkflowStore.save", () => {
  it("creates a canonical workflow with an auditable receipt", async () => {
    const client = createClient({ found: false });
    const resolver = createResolver(client);
    const store = new GitHubWorkflowStore({ clientResolver: resolver });
    const scope = createScope();
    const workflow = createWorkflow();

    const result = await store.save({
      scope,
      workflow,
      expectedBlobSha: null,
      mutation,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual(
      expect.objectContaining({
        workflow,
        previousBlobSha: null,
        noChange: false,
        source: expect.objectContaining({
          path: ".flowcordia/workflows/order_intake.json",
          commitSha: NEW_COMMIT_SHA,
          blobSha: NEW_BLOB_SHA,
        }),
        audit: {
          operation: "create",
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          installationId: scope.installationId,
          repository: scope.repository,
          path: ".flowcordia/workflows/order_intake.json",
          actorId: mutation.actorId,
          correlationId: mutation.correlationId,
          previousBlobSha: null,
          blobSha: NEW_BLOB_SHA,
          commitSha: NEW_COMMIT_SHA,
        },
      })
    );
    expect(client.putFile).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: scope.repository,
        path: ".flowcordia/workflows/order_intake.json",
        expectedBlobSha: null,
        message: expect.stringContaining("Flowcordia-Correlation: request_abc"),
      })
    );
    const write = client.putFile.mock.calls[0]![0];
    expect(atob(write.contentBase64)).toContain('"schemaVersion": "0.1"');
    expect(atob(write.contentBase64).endsWith("\n")).toBe(true);
  });

  it("updates only the blob the caller previously read", async () => {
    const workflow = createWorkflow();
    const client = createClient();
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });
    const next = cloneWorkflow(workflow);
    next.name = "Order intake v2";

    const result = await store.save({
      scope: createScope(),
      workflow: next,
      expectedBlobSha: CURRENT_BLOB_SHA,
      mutation,
    });

    expect(result.success).toBe(true);
    expect(client.putFile).toHaveBeenCalledWith(
      expect.objectContaining({ expectedBlobSha: CURRENT_BLOB_SHA })
    );
    if (!result.success) return;
    expect(result.value.audit?.operation).toBe("update");
    expect(result.value.previousBlobSha).toBe(CURRENT_BLOB_SHA);
  });

  it("returns a conflict without writing when the blob changed", async () => {
    const client = createClient();
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });
    const staleSha = "e".repeat(40);

    const result = await store.save({
      scope: createScope(),
      workflow: createWorkflow(),
      expectedBlobSha: staleSha,
      mutation,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "conflict",
          expectedBlobSha: staleSha,
          actualBlobSha: CURRENT_BLOB_SHA,
        }),
      })
    );
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing workflow during create", async () => {
    const client = createClient();
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.save({
      scope: createScope(),
      workflow: createWorkflow(),
      expectedBlobSha: null,
      mutation,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "conflict",
          expectedBlobSha: null,
          actualBlobSha: CURRENT_BLOB_SHA,
        }),
      })
    );
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("rejects a stable node ID reused for a different operation", async () => {
    const client = createClient();
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });
    const next = createWorkflow();
    next.nodes[0]!.operation = "webhook.receive";

    const result = await store.save({
      scope: createScope(),
      workflow: next,
      expectedBlobSha: CURRENT_BLOB_SHA,
      mutation,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("identity_conflict");
    expect(result.error.workflowIssues?.[0]).toEqual(
      expect.objectContaining({
        code: "identity_changed",
        entity: { type: "node", id: "order_created" },
      })
    );
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("does not create a commit when canonical content is unchanged", async () => {
    const client = createClient();
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.save({
      scope: createScope(),
      workflow: createWorkflow(),
      expectedBlobSha: CURRENT_BLOB_SHA,
      mutation,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.noChange).toBe(true);
    expect(result.value.audit).toBeNull();
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("validates the workflow before resolving installation credentials", async () => {
    const client = createClient();
    const resolver = createResolver(client);
    const store = new GitHubWorkflowStore({ clientResolver: resolver });
    const invalid = createWorkflow() as unknown as Record<string, unknown>;
    invalid.nodes = "not-an-array";

    const result = await store.save({
      scope: createScope(),
      workflow: invalid as never,
      expectedBlobSha: null,
      mutation,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("invalid_document");
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("never retries an ambiguous write", async () => {
    const client = createClient({ found: false });
    client.putFile.mockRejectedValue(
      new GitHubTransportError("server failed after accepting request", {
        code: "http_error",
        status: 503,
        requestId: "github-request-write",
      })
    );
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.save({
      scope: createScope(),
      workflow: createWorkflow(),
      expectedBlobSha: null,
      mutation,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "ambiguous_write",
          retryable: false,
          requestId: "github-request-write",
        }),
      })
    );
    expect(client.putFile).toHaveBeenCalledTimes(1);
  });

  it("maps a definitive GitHub concurrency rejection to conflict", async () => {
    const client = createClient({ found: false });
    client.putFile.mockRejectedValue(
      new GitHubTransportError("conflict", { code: "http_error", status: 409 })
    );
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.save({
      scope: createScope(),
      workflow: createWorkflow(),
      expectedBlobSha: null,
      mutation,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "conflict", retryable: false }),
      })
    );
  });
});
