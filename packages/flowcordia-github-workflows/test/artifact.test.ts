import { describe, expect, it } from "vitest";
import { GitHubWorkflowStore } from "../src/index.js";
import {
  CURRENT_BLOB_SHA,
  NEW_BLOB_SHA,
  NEW_COMMIT_SHA,
  createClient,
  createResolver,
  createScope,
} from "./fixtures.js";

const mutation = { actorId: "user_42", correlationId: "request_artifact" };
const sourceText = 'export const workflow = "compiled";\n';

describe("GitHubWorkflowStore generated artifacts", () => {
  it("stores compiler output under the governed generated path", async () => {
    const client = createClient({ found: false });
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.saveGeneratedArtifact({
      scope: createScope(),
      workflowId: "order_intake",
      sourceText,
      mutation,
    });

    expect(result).toMatchObject({
      success: true,
      value: {
        sourceText,
        previousBlobSha: null,
        noChange: false,
        source: {
          path: "trigger/flowcordia/order_intake.ts",
          commitSha: NEW_COMMIT_SHA,
          blobSha: NEW_BLOB_SHA,
        },
      },
    });
    expect(client.putFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "trigger/flowcordia/order_intake.ts",
        expectedBlobSha: null,
      })
    );
  });

  it("reads the exact generated artifact revision", async () => {
    const bytes = new TextEncoder().encode(sourceText);
    const file = {
      found: true as const,
      blobSha: CURRENT_BLOB_SHA,
      size: bytes.length,
      contentBase64: btoa(String.fromCharCode(...bytes)),
    };
    const client = createClient(file);
    const store = new GitHubWorkflowStore({ clientResolver: createResolver(client) });

    const result = await store.readGeneratedArtifact({
      scope: createScope(),
      workflowId: "order_intake",
      revision: "a".repeat(40),
    });

    expect(result).toMatchObject({
      success: true,
      value: {
        sourceText,
        source: { path: "trigger/flowcordia/order_intake.ts", blobSha: CURRENT_BLOB_SHA },
      },
    });
  });
});
