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
    ).toEqual(["webhook_trigger", "http_action"]);
    expect(
      discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, {
        query: "production binding",
        category: "all",
        stage: "all",
      }).map((template) => template.id)
    ).toEqual(["api_trigger", "schedule_trigger", "webhook_trigger"]);
  });

  it("combines category and release-stage filters exactly", () => {
    expect(
      discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, {
        query: "",
        category: "trigger",
        stage: "approved",
      }).map((template) => template.id)
    ).toEqual(["manual_trigger", "api_trigger", "schedule_trigger", "webhook_trigger"]);
    expect(
      discoverWorkflowStudioCatalog(WORKFLOW_STUDIO_NODE_CATALOG, {
        query: "",
        category: "trigger",
        stage: "limited",
      }).map((template) => template.id)
    ).toEqual([]);
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

  it("composes contextual creation while preserving canonical workflow commands", () => {
    const studio = readFileSync(
      new URL("../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx", import.meta.url),
      "utf8"
    );
    const canvas = readFileSync(
      new URL(
        "../../app/features/flowcordia/workflows/studio/WorkflowStudioCanvas.tsx",
        import.meta.url
      ),
      "utf8"
    );
    const creator = readFileSync(
      new URL(
        "../../app/features/flowcordia/workflows/studio/WorkflowStudioQuickNodeCreator.tsx",
        import.meta.url
      ),
      "utf8"
    );

    expect(studio).not.toContain("<WorkflowStudioNodeCatalogPicker");
    expect(studio).toContain("onCommand={submitCanvasCommand}");
    expect(canvas).toContain("<WorkflowStudioQuickNodeCreator");
    expect(canvas).toContain('type: "add_node"');
    expect(canvas).toContain('type: "add_connected_node"');
    expect(canvas).toContain('type: "insert_node_on_edge"');
    expect(creator).toContain("workflowStudioQuickNodeTemplates");
    expect(creator).not.toContain("fetch(");
    expect(creator).not.toContain("process.env");
  });
});
