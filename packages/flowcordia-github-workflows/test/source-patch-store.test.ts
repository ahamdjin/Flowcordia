import { GitHubTransportError } from "../src/transport/errors.js";
import { describe, expect, it, vi } from "vitest";
import { GitHubRepositorySourcePatchStore } from "../src/index.js";
import {
  BRANCH_COMMIT_SHA,
  CURRENT_BLOB_SHA,
  NEW_BLOB_SHA,
  NEW_COMMIT_SHA,
  createClient,
  createResolver,
  createScope,
} from "./fixtures.js";

const mutation = { actorId: "user_42", correlationId: "request_source_patch" };
const sourceText = "export function qualifyLead() { return { qualified: true }; }\n";

function sourceFile(text = sourceText) {
  const bytes = new TextEncoder().encode(text);
  return {
    found: true as const,
    blobSha: CURRENT_BLOB_SHA,
    size: bytes.length,
    contentBase64: btoa(String.fromCharCode(...bytes)),
  };
}

describe("GitHubRepositorySourcePatchStore", () => {
  it("reads one exact repository source file", async () => {
    const client = createClient(sourceFile());
    const store = new GitHubRepositorySourcePatchStore({ clientResolver: createResolver(client) });

    const result = await store.read({
      scope: createScope(),
      path: "src/functions/qualifyLead.ts",
      revision: BRANCH_COMMIT_SHA,
    });

    expect(result).toEqual({
      success: true,
      value: {
        path: "src/functions/qualifyLead.ts",
        sourceText,
        requestedRevision: BRANCH_COMMIT_SHA,
        commitSha: BRANCH_COMMIT_SHA,
        blobSha: CURRENT_BLOB_SHA,
      },
    });
    expect(client.getFile).toHaveBeenCalledWith({
      repository: createScope().repository,
      path: "src/functions/qualifyLead.ts",
      commitSha: BRANCH_COMMIT_SHA,
    });
  });

  it("stores a patch only when the expected blob identity matches", async () => {
    const client = createClient(sourceFile("export const before = true;\n"));
    const store = new GitHubRepositorySourcePatchStore({ clientResolver: createResolver(client) });

    const result = await store.save({
      scope: createScope(),
      patch: {
        path: "src/functions/qualifyLead.ts",
        sourceText,
        expectedBlobSha: CURRENT_BLOB_SHA,
      },
      mutation,
    });

    expect(result).toMatchObject({
      success: true,
      value: {
        path: "src/functions/qualifyLead.ts",
        sourceText,
        previousBlobSha: CURRENT_BLOB_SHA,
        noChange: false,
        commitSha: NEW_COMMIT_SHA,
        blobSha: NEW_BLOB_SHA,
      },
    });
    expect(client.putFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "src/functions/qualifyLead.ts",
        expectedBlobSha: CURRENT_BLOB_SHA,
      })
    );
  });

  it("fails closed on a stale source blob", async () => {
    const client = createClient(sourceFile());
    const store = new GitHubRepositorySourcePatchStore({ clientResolver: createResolver(client) });

    const result = await store.save({
      scope: createScope(),
      patch: {
        path: "src/functions/qualifyLead.ts",
        sourceText,
        expectedBlobSha: "f".repeat(40),
      },
      mutation,
    });

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "conflict",
        expectedBlobSha: "f".repeat(40),
        actualBlobSha: CURRENT_BLOB_SHA,
      },
    });
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("returns an idempotent no-change result without writing", async () => {
    const client = createClient(sourceFile());
    const store = new GitHubRepositorySourcePatchStore({ clientResolver: createResolver(client) });

    const result = await store.save({
      scope: createScope(),
      patch: {
        path: "src/functions/qualifyLead.ts",
        sourceText,
        expectedBlobSha: CURRENT_BLOB_SHA,
      },
      mutation,
    });

    expect(result).toMatchObject({ success: true, value: { noChange: true } });
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("normalizes an ambiguous mutation without exposing provider details", async () => {
    const client = createClient(sourceFile("export const before = true;\n"));
    client.putFile = vi.fn(async () => {
      throw new GitHubTransportError("socket closed", {
        code: "network",
        mutationMayHaveSucceeded: true,
      });
    });
    const store = new GitHubRepositorySourcePatchStore({ clientResolver: createResolver(client) });

    const result = await store.save({
      scope: createScope(),
      patch: {
        path: "src/functions/qualifyLead.ts",
        sourceText,
        expectedBlobSha: CURRENT_BLOB_SHA,
      },
      mutation,
    });

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "ambiguous_write",
        operation: "save_source",
        path: "src/functions/qualifyLead.ts",
      },
    });
    expect(JSON.stringify(result)).not.toContain("socket closed");
  });
});
