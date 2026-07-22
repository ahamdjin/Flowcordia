import { WORKFLOW_STUDIO_NODE_CATALOG } from "@flowcordia/workflow";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  discoverWorkflowStudioCatalog,
  firstAvailableWorkflowStudioTemplateId,
} from "../../app/features/flowcordia/workflows/studio/node-catalog-discovery";

describe("Workflow Studio node catalog discovery", () => {
  it("searches stable metadata, operations, and capabilities without reordering the catalog", () => {
    expect(
      discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, {
        query: "credential",
        category: "all",
        stage: "all",
      }).map((template) => template.id)
    ).toEqual(["http_action"]);
    expect(
      discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, {
        query: "production binding",
        category: "all",
        stage: "all",
      }).map((template) => template.id)
    ).toEqual(["api_trigger", "schedule_trigger"]);
  });

  it("combines category and release-stage filters exactly", () => {
    expect(
      discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, {
        query: "",
        category: "trigger",
        stage: "approved",
      }).map((template) => template.id)
    ).toEqual(["manual_trigger", "api_trigger", "schedule_trigger"]);
    expect(
      discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, {
        query: "",
        category: "trigger",
        stage: "limited",
      }).map((template) => template.id)
    ).toEqual(["webhook_trigger"]);
  });

  it("retains the current selection or moves to the first visible result", () => {
    const logic = discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, {
      query: "",
      category: "logic",
      stage: "all",
    });
    expect(
      firstAvailableWorkflowStudioTemplateId({
        catalog: logic,
        currentTemplateId: "condition",
      })
    ).toBe("condition");
    expect(
      firstAvailableWorkflowStudioTemplateId({
        catalog: logic,
        currentTemplateId: "http_action",
      })
    ).toBe("data_map");
    expect(
      firstAvailableWorkflowStudioTemplateId({
        catalog: [],
        currentTemplateId: "http_action",
      })
    ).toBeNull();
  });

  it("composes the picker while preserving the existing add-node command", () => {
    const studio = readFileSync(
      new URL(
        "../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx",
        import.meta.url
      ),
      "utf8"
    );
    const picker = readFileSync(
      new URL(
        "../../app/features/flowcordia/workflows/studio/WorkflowStudioNodeCatalogPicker.tsx",
        import.meta.url
      ),
      "utf8"
    );
    expect(studio).toContain("<WorkflowStudioNodeCatalogPicker");
    expect(studio).toContain('type: "add_node"');
    expect(studio).toContain("templateId");
    expect(picker).toContain("WORKFLOW_STUDIO_NODE_CATALOG");
    expect(picker).not.toContain("fetch(");
    expect(picker).not.toContain("process.env");
  });
});
