import { describe, expect, it } from "vitest";
import {
  rememberWorkflowStudioQuickTemplate,
  workflowStudioQuickNodeTemplates,
} from "./quick-node-creator";

describe("workflowStudioQuickNodeTemplates", () => {
  it("keeps triggers available only for standalone creation", () => {
    const standalone = workflowStudioQuickNodeTemplates({
      context: "standalone",
      query: "trigger",
      category: "all",
    });
    const connected = workflowStudioQuickNodeTemplates({
      context: "after_source",
      query: "trigger",
      category: "all",
    });

    expect(standalone.some((template) => template.kind === "trigger")).toBe(true);
    expect(connected.some((template) => template.kind === "trigger")).toBe(false);
  });

  it("offers only nodes that can be inserted between an existing source and target", () => {
    const templates = workflowStudioQuickNodeTemplates({
      context: "on_edge",
      query: "",
      category: "all",
    });

    expect(templates.some((template) => template.kind === "trigger")).toBe(false);
    expect(templates.some((template) => template.kind === "output")).toBe(false);
    expect(templates.some((template) => template.operation === "control.condition")).toBe(false);
    expect(templates.some((template) => template.id === "http_action")).toBe(true);
  });

  it("searches labels, operations, descriptions, identifiers, and categories", () => {
    const templates = workflowStudioQuickNodeTemplates({
      context: "standalone",
      query: "allowlisted https",
      category: "all",
    });

    expect(templates.map((template) => template.id)).toEqual(["http_action"]);
  });
});

describe("rememberWorkflowStudioQuickTemplate", () => {
  it("moves the latest choice to the front without duplicates", () => {
    expect(
      rememberWorkflowStudioQuickTemplate(["http_action", "wait", "output"], "wait")
    ).toEqual(["wait", "http_action", "output"]);
  });
});
