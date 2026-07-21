import { describe, expect, it } from "vitest";
import {
  WORKFLOW_STUDIO_CATALOG_SCHEMA_VERSION,
  WORKFLOW_STUDIO_NODE_CATALOG,
  WORKFLOW_STUDIO_TEMPLATE_IDS,
  workflowStudioNodeCatalogEntry,
} from "../src/index.js";

describe("Flowcordia approved node catalog", () => {
  it("publishes unique, versioned, visually addable entries", () => {
    expect(WORKFLOW_STUDIO_CATALOG_SCHEMA_VERSION).toBe("0.1");
    expect(WORKFLOW_STUDIO_NODE_CATALOG.map((entry) => entry.id)).toEqual(
      WORKFLOW_STUDIO_TEMPLATE_IDS
    );
    expect(new Set(WORKFLOW_STUDIO_NODE_CATALOG.map((entry) => entry.catalogId)).size).toBe(
      WORKFLOW_STUDIO_NODE_CATALOG.length
    );
    expect(WORKFLOW_STUDIO_NODE_CATALOG.every((entry) => entry.catalogVersion === 1)).toBe(true);
  });

  it("publishes HTTP as an approved executable credential-aware action", () => {
    expect(workflowStudioNodeCatalogEntry("http_action")).toMatchObject({
      catalogId: "flowcordia.action.http-request",
      releaseStage: "approved",
      category: "action",
      operation: "action.http",
      capabilities: expect.arrayContaining([
        "structural_preview",
        "live_execution",
        "credential_references",
        "governed_code_generation",
      ]),
    });
  });

  it("labels unbound public webhooks honestly and excludes generic code tasks", () => {
    expect(workflowStudioNodeCatalogEntry("webhook_trigger")).toMatchObject({
      releaseStage: "limited",
      capabilities: ["structural_preview", "governed_code_generation"],
    });
    expect(WORKFLOW_STUDIO_NODE_CATALOG.some((entry) => entry.operation === "code.task")).toBe(
      false
    );
  });
});
