import type { WorkflowDefinition } from "@flowcordia/workflow";
import type { GitHubFunctionCatalogReadValue } from "@flowcordia/github-workflows";
import { describe, expect, it } from "vitest";
import type {
  WorkflowIndexEntryRecord,
  WorkflowIndexSyncRecord,
} from "../../app/features/flowcordia/workflows/index/types";
import {
  presentWorkflowGraph,
  presentWorkflowIndexEntry,
  presentWorkflowIndexSync,
} from "../../app/features/flowcordia/workflows/studio/presentation";
import { presentWorkflowFunctionCatalog } from "../../app/features/flowcordia/workflows/functions/presentation";

const COMMIT_SHA = "a".repeat(40);
const BLOB_SHA = "b".repeat(40);

function sync(overrides: Partial<WorkflowIndexSyncRecord> = {}): WorkflowIndexSyncRecord {
  return {
    id: "internal-sync-id",
    status: "IDLE",
    reason: "manual",
    requestedCommitSha: null,
    observedCommitSha: COMMIT_SHA,
    generation: 7n,
    entryCount: 1,
    validCount: 1,
    invalidCount: 0,
    lockedBy: "internal-worker-id",
    lockToken: "internal-lock-token",
    lockExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    requestedAt: new Date("2026-07-15T12:00:00.000Z"),
    startedAt: new Date("2026-07-15T12:00:01.000Z"),
    completedAt: new Date("2026-07-15T12:00:02.000Z"),
    createdAt: new Date("2026-07-15T12:00:00.000Z"),
    updatedAt: new Date("2026-07-15T12:00:02.000Z"),
    ...overrides,
  };
}

function entry(overrides: Partial<WorkflowIndexEntryRecord> = {}): WorkflowIndexEntryRecord {
  return {
    id: "internal-entry-id",
    workflowId: "order_intake",
    workflowPath: ".flowcordia/workflows/order_intake.json",
    sourceCommitSha: COMMIT_SHA,
    sourceBlobSha: BLOB_SHA,
    indexedAt: new Date("2026-07-15T12:00:02.000Z"),
    status: "VALID",
    name: "Order intake",
    description: "Routes a new order.",
    schemaVersion: "0.1",
    nodeCount: 2,
    edgeCount: 1,
    canonicalSha256: "c".repeat(64),
    failureCode: null,
    failureMessage: null,
    createdAt: new Date("2026-07-15T12:00:02.000Z"),
    updatedAt: new Date("2026-07-15T12:00:02.000Z"),
    ...overrides,
  };
}

describe("Flowcordia workflow Studio presentation", () => {
  it("exposes a bounded sync contract without leases or storage identity", () => {
    const result = presentWorkflowIndexSync(sync());
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      state: "IDLE",
      reason: "manual",
      requestedCommitSha: null,
      observedCommitSha: COMMIT_SHA,
      generation: "7",
      entryCount: 1,
      validCount: 1,
      invalidCount: 0,
      requestedAt: "2026-07-15T12:00:00.000Z",
      completedAt: "2026-07-15T12:00:02.000Z",
      failure: null,
    });
    expect(serialized).not.toContain("internal-sync-id");
    expect(serialized).not.toContain("internal-worker-id");
    expect(serialized).not.toContain("internal-lock-token");
  });

  it("shows invalid workflow evidence without exposing index storage identity", () => {
    const result = presentWorkflowIndexEntry(
      entry({
        status: "INVALID",
        name: null,
        description: null,
        schemaVersion: null,
        nodeCount: null,
        edgeCount: null,
        canonicalSha256: null,
        failureCode: "missing_reference",
        failureMessage: "Node target is missing.",
      })
    );

    expect(result.name).toBe("order_intake");
    expect(result.failure).toEqual({
      code: "missing_reference",
      message: "Node target is missing.",
    });
    expect(JSON.stringify(result)).not.toContain("internal-entry-id");
    expect(JSON.stringify(result)).not.toContain(BLOB_SHA);
  });

  it("renders graph structure while excluding configuration values", () => {
    const workflow: WorkflowDefinition = {
      schemaVersion: "0.1",
      id: "order_intake",
      name: "Order intake",
      description: "Routes a new order.",
      labels: ["orders"],
      nodes: [
        {
          id: "new_order",
          name: "New order",
          kind: "trigger",
          operation: "webhook.receive",
          position: { x: 10, y: 20 },
          configuration: {
            endpoint: "https://private.example.test/hooks/order",
            apiKey: "secret-value-must-not-reach-browser",
          },
          credentialReferences: ["orders-api"],
        },
        {
          id: "route_order",
          kind: "action",
          operation: "orders.route",
          position: { x: 300, y: 20 },
          configuration: { team: "priority" },
        },
      ],
      edges: [{ id: "new_to_route", source: "new_order", target: "route_order" }],
    };

    const result = presentWorkflowGraph({
      workflow,
      source: {
        path: ".flowcordia/workflows/order_intake.json",
        commitSha: COMMIT_SHA,
        blobSha: BLOB_SHA,
        requestedRevision: COMMIT_SHA,
        sourceSchemaVersion: "0.1",
      },
      appliedMigrations: [],
    });
    const serialized = JSON.stringify(result);

    expect(result.nodes[0]?.configurationKeys).toEqual(["apiKey", "endpoint"]);
    expect(result.nodes[0]?.editableConfiguration).toBeNull();
    expect(result.edges).toEqual([
      {
        id: "new_to_route",
        source: "new_order",
        target: "route_order",
        sourceHandle: null,
        targetHandle: null,
        condition: null,
      },
    ]);
    expect(serialized).not.toContain("secret-value-must-not-reach-browser");
    expect(serialized).not.toContain("private.example.test");
    expect(serialized).not.toContain("priority");
  });

  it("projects repository functions without exposing schema values or source code", () => {
    const result = presentWorkflowFunctionCatalog({
      catalog: {
        schemaVersion: "0.1",
        functions: [
          {
            id: "qualify_lead",
            name: "Qualify lead",
            description: "Apply the reviewed scoring policy.",
            codeReference: {
              path: "src/flowcordia/qualify.ts",
              exportName: "qualifyLead",
            },
            inputSchema: {
              type: "object",
              properties: {
                leadId: { type: "string", default: "private-example-value" },
              },
            },
            outputSchema: {
              type: "object",
              properties: { qualified: { type: "boolean" } },
            },
          },
        ],
      },
      source: {
        path: ".flowcordia/functions.json",
        requestedRevision: COMMIT_SHA,
        commitSha: COMMIT_SHA,
        blobSha: BLOB_SHA,
      },
    } satisfies GitHubFunctionCatalogReadValue);

    expect(result).toMatchObject({
      state: "READY",
      functions: [
        {
          id: "qualify_lead",
          inputFields: ["leadId"],
          outputFields: ["qualified"],
          codePath: "src/flowcordia/qualify.ts",
          exportName: "qualifyLead",
        },
      ],
      source: { commitSha: COMMIT_SHA, blobSha: BLOB_SHA },
    });
    expect(JSON.stringify(result)).not.toContain("private-example-value");
    expect(JSON.stringify(result)).not.toContain("properties");
  });
});
