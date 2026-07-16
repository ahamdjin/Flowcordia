import { describe, expect, it } from "vitest";

import { GitHubTransportError, GitHubWorkflowStore } from "../src/index.js";
import {
  CURRENT_BLOB_SHA,
  NEW_COMMIT_SHA,
  createClient,
  createResolver,
  createScope,
} from "./fixtures.js";

const mutation = { actorId: "user_42", correlationId: "request_delete_1" };

describe("GitHubWorkflowStore.delete", () => {
  it("deletes exactly the expected blob and returns an audit receipt", async () => {
    const client = createClient();
    const scope = createScope();
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.delete({
      scope,
      workflowId: "order_intake",
      expectedBlobSha: CURRENT_BLOB_SHA,
      mutation,
    });

    expect(result).toEqual({
      success: true,
      value: {
        repository: scope.repository,
        path: ".flowcordia/workflows/order_intake.json",
        previousBlobSha: CURRENT_BLOB_SHA,
        commitSha: NEW_COMMIT_SHA,
        audit: {
          operation: "delete",
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          installationId: scope.installationId,
          repository: scope.repository,
          path: ".flowcordia/workflows/order_intake.json",
          actorId: mutation.actorId,
          correlationId: mutation.correlationId,
          previousBlobSha: CURRENT_BLOB_SHA,
          blobSha: null,
          commitSha: NEW_COMMIT_SHA,
        },
      },
    });
    expect(client.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedBlobSha: CURRENT_BLOB_SHA,
        message: expect.stringContaining("flowcordia: delete workflow order_intake"),
      })
    );
  });

  it("does not delete a newer blob", async () => {
    const client = createClient();
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.delete({
      scope: createScope(),
      workflowId: "order_intake",
      expectedBlobSha: "e".repeat(40),
      mutation,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "conflict", actualBlobSha: CURRENT_BLOB_SHA }),
      })
    );
    expect(client.deleteFile).not.toHaveBeenCalled();
  });

  it("requires reconciliation when a delete response is ambiguous", async () => {
    const client = createClient();
    client.deleteFile.mockRejectedValue(
      new GitHubTransportError("timeout", {
        code: "network_error",
        mutationMayHaveSucceeded: true,
      })
    );
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.delete({
      scope: createScope(),
      workflowId: "order_intake",
      expectedBlobSha: CURRENT_BLOB_SHA,
      mutation,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "ambiguous_write", retryable: false }),
      })
    );
    expect(client.deleteFile).toHaveBeenCalledTimes(1);
  });
});
