import type { WorkflowFunctionCatalog } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  FLOWCORDIA_FUNCTION_CATALOG_PATH,
  GitHubFunctionCatalogStore,
  type GitHubFileResult,
} from "../src/index.js";
import {
  BRANCH_COMMIT_SHA,
  CURRENT_BLOB_SHA,
  createClient,
  createResolver,
  createScope,
} from "./fixtures.js";

function catalog(): WorkflowFunctionCatalog {
  return {
    schemaVersion: "0.1",
    functions: [
      {
        id: "qualify_lead",
        name: "Qualify lead",
        codeReference: { path: "src/functions/qualify.ts", exportName: "qualifyLead" },
        inputSchema: { type: "object", properties: { leadId: { type: "string" } } },
        outputSchema: { type: "object", properties: { qualified: { type: "boolean" } } },
      },
    ],
  };
}

function file(value: unknown = catalog()): Extract<GitHubFileResult, { found: true }> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return {
    found: true,
    blobSha: CURRENT_BLOB_SHA,
    size: bytes.length,
    contentBase64: btoa(String.fromCharCode(...bytes)),
  };
}

describe("GitHub function catalog", () => {
  it("reads and validates the manifest at an exact repository revision", async () => {
    const client = createClient(file());
    const store = new GitHubFunctionCatalogStore({ clientResolver: createResolver(client) });

    const result = await store.read({ scope: createScope(), revision: BRANCH_COMMIT_SHA });

    expect(result).toEqual({
      success: true,
      value: {
        catalog: catalog(),
        source: {
          path: FLOWCORDIA_FUNCTION_CATALOG_PATH,
          requestedRevision: BRANCH_COMMIT_SHA,
          commitSha: BRANCH_COMMIT_SHA,
          blobSha: CURRENT_BLOB_SHA,
        },
      },
    });
    expect(client.getFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: FLOWCORDIA_FUNCTION_CATALOG_PATH,
        commitSha: BRANCH_COMMIT_SHA,
      })
    );
  });

  it("reports a missing catalog without inventing visual nodes", async () => {
    const store = new GitHubFunctionCatalogStore({
      clientResolver: createResolver(createClient({ found: false })),
    });

    await expect(store.read({ scope: createScope(), revision: "main" })).resolves.toMatchObject({
      success: false,
      error: { code: "not_found", operation: "read_function_catalog", retryable: false },
    });
  });

  it("returns bounded contract diagnostics for an invalid manifest", async () => {
    const invalid = catalog() as WorkflowFunctionCatalog & { browserCode?: string };
    invalid.browserCode = "alert('no')";
    const store = new GitHubFunctionCatalogStore({
      clientResolver: createResolver(createClient(file(invalid))),
    });

    const result = await store.read({ scope: createScope(), revision: "main" });

    expect(result).toMatchObject({
      success: false,
      error: {
        code: "invalid_document",
        operation: "read_function_catalog",
        catalogIssues: [expect.objectContaining({ code: "unknown_property" })],
      },
    });
  });

  it("rejects oversized manifests before decoding them", async () => {
    const oversized = file();
    oversized.size = 257;
    const store = new GitHubFunctionCatalogStore({
      clientResolver: createResolver(createClient(oversized)),
      maxBytes: 256,
    });

    await expect(store.read({ scope: createScope(), revision: "main" })).resolves.toMatchObject({
      success: false,
      error: { code: "invalid_document", message: expect.stringContaining("256-byte") },
    });
  });

  it("rejects invalid access scope before resolving an installation client", async () => {
    const client = createClient(file());
    const resolver = createResolver(client);
    const scope = createScope();
    scope.tenantId = "";
    const store = new GitHubFunctionCatalogStore({ clientResolver: resolver });

    await expect(store.read({ scope, revision: "main" })).resolves.toMatchObject({
      success: false,
      error: { code: "invalid_input", operation: "read_function_catalog" },
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});
