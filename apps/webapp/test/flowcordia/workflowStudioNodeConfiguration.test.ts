import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JsonObject } from "@flowcordia/workflow";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowStudioNodeConfiguration,
  createWorkflowStudioNodeConfigurationDraft,
} from "../../app/features/flowcordia/workflows/studio/node-configuration";

function build(operation: string, configuration: JsonObject) {
  return buildWorkflowStudioNodeConfiguration(
    createWorkflowStudioNodeConfigurationDraft(operation, configuration)
  );
}

describe("Flowcordia structured node configuration", () => {
  it("keeps pass-through operations exact and blocks unknown fields", () => {
    expect(build("trigger.manual", {})).toEqual({ success: true, configuration: {} });
    expect(createWorkflowStudioNodeConfigurationDraft("trigger.api", { unexpected: true })).toEqual(
      {
        kind: "blocked",
        message:
          "This node contains advanced configuration (unexpected) that Studio will not rewrite.",
      }
    );
  });

  it("normalizes a valid schedule and rejects invalid cron or timezone values", () => {
    expect(build("trigger.schedule", { cron: " 0 9 * * 1-5 ", timezone: " UTC " })).toEqual({
      success: true,
      configuration: { cron: "0 9 * * 1-5", timezone: "UTC" },
    });
    expect(build("trigger.schedule", { cron: "0 0 9 * * *", timezone: "UTC" })).toEqual({
      success: false,
      message: "Use a bounded five-field cron expression.",
    });
    expect(build("trigger.schedule", { cron: "0 9 * * 1-5", timezone: "Not/AZone" })).toEqual({
      success: false,
      message: "Use a valid IANA timezone such as UTC or Asia/Karachi.",
    });
  });

  it("normalizes webhook methods and requires an absolute bounded path", () => {
    expect(build("trigger.webhook", { method: "post", path: " /orders " })).toEqual({
      success: true,
      configuration: { method: "POST", path: "/orders" },
    });
    expect(build("trigger.webhook", { method: "POST", path: "orders" })).toEqual({
      success: false,
      message: "Webhook paths must start with / and stay under 512 characters.",
    });
  });

  it("hydrates legacy HTTP nodes into the complete bounded runtime contract", () => {
    expect(
      build("action.http", { method: "post", url: " https://api.example.com/orders " })
    ).toEqual({
      success: true,
      configuration: {
        method: "POST",
        url: "https://api.example.com/orders",
        bodyMode: "input",
        responseMode: "auto",
        timeoutSeconds: 30,
        maxResponseBytes: 1_048_576,
      },
    });
    expect(build("action.http", { method: "GET", url: "http://example.com" })).toEqual({
      success: false,
      message: "HTTP requests require an HTTPS URL without credentials or a fragment.",
    });
    expect(build("action.http", { method: "GET", url: "https://user:pass@example.com" })).toEqual({
      success: false,
      message: "HTTP requests require an HTTPS URL without credentials or a fragment.",
    });
    expect(
      build("action.http", { method: "GET", url: `https://example.com/${"x".repeat(2_100)}` })
    ).toEqual({
      success: false,
      message: "HTTP requests require an HTTPS URL under 2,048 characters.",
    });
  });

  it("round-trips HTTP body, response, timeout, and response-limit controls", () => {
    expect(
      build("action.http", {
        method: "PATCH",
        url: "https://api.example.com/orders",
        bodyMode: "none",
        responseMode: "text",
        timeoutSeconds: 45,
        maxResponseBytes: 32_768,
      })
    ).toEqual({
      success: true,
      configuration: {
        method: "PATCH",
        url: "https://api.example.com/orders",
        bodyMode: "none",
        responseMode: "text",
        timeoutSeconds: 45,
        maxResponseBytes: 32_768,
      },
    });
    expect(
      build("action.http", {
        method: "GET",
        url: "https://api.example.com/orders",
        bodyMode: "input",
        responseMode: "binary",
        timeoutSeconds: 0,
        maxResponseBytes: 9_000_000,
      })
    ).toMatchObject({ success: false });
  });

  it("keeps a new empty HTTP node editable while refusing unknown stored fields", () => {
    expect(
      createWorkflowStudioNodeConfigurationDraft("action.http", {
        method: "GET",
        url: "",
        bodyMode: "none",
        responseMode: "auto",
        timeoutSeconds: 30,
        maxResponseBytes: 1_048_576,
      })
    ).toMatchObject({ kind: "http", url: "" });
    expect(
      createWorkflowStudioNodeConfigurationDraft("action.http", {
        method: "GET",
        url: "https://api.example.com/orders",
        headers: { authorization: "hidden" },
      })
    ).toEqual({
      kind: "blocked",
      message: 'HTTP configuration field "headers" is not supported.',
    });
  });

  it("keeps mapping behind its dedicated bounded editor", () => {
    const draft = createWorkflowStudioNodeConfigurationDraft("data.map", {
      mode: "replace",
      entries: [{ target: "customer.email", source: "contact.email", required: true }],
    });
    expect(draft).toEqual({
      kind: "blocked",
      message: 'Operation "data.map" does not have a safe visual configuration form.',
    });
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudioMappingEditor.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );
    expect(source).toContain("parseFlowcordiaMappingConfiguration");
    expect(source).toContain("No expressions");
    expect(source).not.toContain("eval(");
    expect(source).not.toContain("new Function");
  });

  it("round-trips wait durations through human units without changing seconds", () => {
    const draft = createWorkflowStudioNodeConfigurationDraft("control.wait", {
      durationSeconds: 7_200,
    });
    expect(draft).toEqual({ kind: "wait", duration: "2", unit: "hours" });
    expect(buildWorkflowStudioNodeConfiguration(draft)).toEqual({
      success: true,
      configuration: { durationSeconds: 7_200 },
    });
  });

  it("supports scalar condition values and omits values for exists", () => {
    expect(
      build("control.condition", { path: " customer.plan ", operator: "equals", value: 2 })
    ).toEqual({
      success: true,
      configuration: { path: "customer.plan", operator: "equals", value: 2 },
    });
    expect(
      build("control.condition", {
        path: "customer.email",
        operator: "exists",
        value: null,
      })
    ).toEqual({
      success: true,
      configuration: { path: "customer.email", operator: "exists" },
    });
  });

  it("fails closed for object comparisons and unsupported operations", () => {
    expect(
      createWorkflowStudioNodeConfigurationDraft("control.condition", {
        path: "customer",
        operator: "equals",
        value: { plan: "pro" },
      })
    ).toEqual({
      kind: "blocked",
      message:
        "Studio edits condition comparison values only when they are strings, numbers, booleans, or null. Preserve object and array comparisons in code.",
    });
    expect(createWorkflowStudioNodeConfigurationDraft("approval.request", {})).toEqual({
      kind: "blocked",
      message: 'Operation "approval.request" does not have a safe visual configuration form.',
    });
  });

  it("keeps raw JSON configuration controls out of the Studio inspector", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudio.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );

    expect(source).not.toContain("Configuration (JSON)");
    expect(source).not.toContain("JSON.parse(configuration)");
    const picker = readFileSync(
      fileURLToPath(
        new URL(
          "../../app/features/flowcordia/workflows/studio/WorkflowStudioNodeCatalogPicker.tsx",
          import.meta.url
        )
      ),
      "utf8"
    );

    expect(source).toContain("WorkflowStudioNodeConfigurationEditor");
    expect(source).toContain("WorkflowStudioNodeCatalogPicker");
    expect(picker).toContain("Find an approved capability");
    expect(picker).toContain("<optgroup");
    expect(picker).toContain("selectedTemplate.capabilities");
  });
});
