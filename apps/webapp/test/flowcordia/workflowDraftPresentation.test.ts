import type { WorkflowDefinition } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import type { WorkflowDraftRecord } from "../../app/features/flowcordia/workflows/drafts/types";
import {
  presentWorkflowDraft,
  presentWorkflowDiff,
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

  it("exposes only allow-listed editable configuration and excludes unknown values", () => {
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
    expect(graph.nodes[0]?.editableConfiguration).toEqual({ path: "/private-order-hook" });
    expect(graph.nodes[0]?.ownership).toBe("visual");
    expect(graph.nodes[0]?.inputSchema).toBeNull();
    expect(graph.nodes[0]?.outputSchema).toBeNull();
    expect(graph.nodes[0]?.credentialReferences).toEqual(["orders-api"]);
    expect(serialized).not.toContain("must-never-reach-the-browser");
  });

  it("projects bounded function schemas without exposing executable source", () => {
    const value = draft();
    value.document.nodes.push({
      id: "function_qualify_lead",
      name: "Qualify lead",
      kind: "code",
      operation: "code.task",
      position: { x: 280, y: 40 },
      configuration: { functionId: "qualify_lead" },
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["leadId"],
        properties: { leadId: { type: "string", minLength: 1 } },
      },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["qualified"],
        properties: { qualified: { type: "boolean" } },
      },
      codeReference: {
        path: "src/functions/qualifyLead.ts",
        exportName: "qualifyLead",
      },
    });

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
    const node = graph.nodes.find((candidate) => candidate.id === "function_qualify_lead");

    expect(node).toMatchObject({
      ownership: "developer",
      editableConfiguration: null,
      inputSchema: {
        type: "object",
        required: ["leadId"],
        properties: { leadId: { type: "string", minLength: 1 } },
      },
      outputSchema: {
        type: "object",
        required: ["qualified"],
        properties: { qualified: { type: "boolean" } },
      },
      codeReference: {
        path: "src/functions/qualifyLead.ts",
        exportName: "qualifyLead",
      },
    });
    expect(JSON.stringify(graph)).not.toContain("function qualifyLead");
  });

  it("does not expose credentials embedded in an otherwise editable URL", () => {
    const value = draft();
    value.document.nodes[0] = {
      id: "http_request",
      kind: "action",
      operation: "action.http",
      position: { x: 20, y: 40 },
      configuration: {
        method: "POST",
        url: "https://example.test/hook?access_token=must-never-reach-the-browser",
      },
    };

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

    expect(graph.nodes[0]?.editableConfiguration).toBeNull();
    expect(JSON.stringify(graph)).not.toContain("must-never-reach-the-browser");
  });

  it("marks a draft stale without exposing repository storage identity", () => {
    const result = presentWorkflowDraft(draft(), true);
    expect(result.stale).toBe(true);
    expect(JSON.stringify(result)).not.toContain(BLOB_SHA);
  });

  it("summarizes a visual diff without exposing configuration values", () => {
    const base = workflow();
    const edited = workflow();
    edited.name = "Priority order intake";
    edited.nodes[0]!.position = { x: 120, y: 80 };
    edited.nodes.push({
      id: "output",
      kind: "output",
      operation: "output.return",
      position: { x: 420, y: 80 },
      configuration: {},
    });

    expect(presentWorkflowDiff(base, edited)).toEqual({
      changed: true,
      detailsChanged: true,
      nodes: { added: ["output"], modified: ["webhook_trigger"], removed: [] },
      edges: { added: [], modified: [], removed: [] },
    });
    expect(JSON.stringify(presentWorkflowDiff(base, edited))).not.toContain(
      "must-never-reach-the-browser"
    );
  });
});
