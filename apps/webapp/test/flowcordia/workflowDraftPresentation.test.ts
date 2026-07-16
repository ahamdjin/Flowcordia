import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import type { WorkflowDraftRecord } from "../../app/features/flowcordia/workflows/drafts/types";
import {
  presentWorkflowDraft,
  presentWorkflowGraph,
} from "../../app/features/flowcordia/workflows/studio/presentation";

const COMMIT_SHA = "a".repeat(40);
const BLOB_SHA = "b".repeat(40);
const HASH = "c".repeat(64);

function workflow(): WorkflowDefinition {
  return {
    schemaVersion: "0.1",
    id: "order_intake",
    name: "Order intake draft",
    nodes: [
      {
        id: "webhook_trigger",
        name: "Receive order",
        kind: "trigger",
        operation: "trigger.webhook",
        position: { x: 20, y: 40 },
        configuration: {
          path: "/private-order-hook",
          apiKey: "must-never-reach-the-browser",
        },
        credentialReferences: ["orders-api"],
      },
    ],
    edges: [],
  };
}

function draft(): WorkflowDraftRecord {
  return {
    id: "internal-draft-row-id",
    publicId: "2be6e404-2e58-44db-8a3a-fc7e34e4f4f9",
    workflowId: "order_intake",
    workflowPath: ".flowcordia/workflows/order_intake.json",
    status: "ACTIVE",
    baseCommitSha: COMMIT_SHA,
    baseBlobSha: BLOB_SHA,
    baseCanonicalSha256: "d".repeat(64),
    document: workflow(),
    documentSha256: HASH,
    version: 8n,
    createdByActorId: "internal-creator-id",
    updatedByActorId: "internal-editor-id",
    discardedByActorId: null,
    createdAt: new Date("2026-07-16T08:00:00.000Z"),
    updatedAt: new Date("2026-07-16T08:05:00.000Z"),
    discardedAt: null,
  };
}

describe("Flowcordia workflow draft presentation", () => {
  it("exposes only the public optimistic draft identity", () => {
    const result = presentWorkflowDraft(draft(), false);
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      publicId: "2be6e404-2e58-44db-8a3a-fc7e34e4f4f9",
      workflowId: "order_intake",
      version: "8",
      documentSha256: HASH,
      baseCommitSha: COMMIT_SHA,
      createdAt: "2026-07-16T08:00:00.000Z",
      updatedAt: "2026-07-16T08:05:00.000Z",
      stale: false,
    });
    expect(serialized).not.toContain("internal-draft-row-id");
    expect(serialized).not.toContain("internal-creator-id");
    expect(serialized).not.toContain("internal-editor-id");
    expect(serialized).not.toContain("must-never-reach-the-browser");
  });

  it("renders draft structure while excluding configuration values", () => {
    const value = draft();
    const graph = presentWorkflowGraph({
      workflow: value.document,
      source: {
        path: value.workflowPath,
        commitSha: value.baseCommitSha,
        blobSha: value.baseBlobSha,
        requestedRevision: value.baseCommitSha,
        sourceSchemaVersion: value.document.schemaVersion,
      },
      appliedMigrations: [],
    });
    const serialized = JSON.stringify(graph);

    expect(graph.nodes[0]?.configurationKeys).toEqual(["apiKey", "path"]);
    expect(graph.nodes[0]?.credentialReferences).toEqual(["orders-api"]);
    expect(serialized).not.toContain("private-order-hook");
    expect(serialized).not.toContain("must-never-reach-the-browser");
  });

  it("marks a draft stale without exposing repository storage identity", () => {
    const result = presentWorkflowDraft(draft(), true);
    expect(result.stale).toBe(true);
    expect(JSON.stringify(result)).not.toContain(BLOB_SHA);
  });
});
